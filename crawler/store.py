"""SQLite storage for the crawler (data/scout.db) and the JSON export the app reads."""

import json
import re
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data/scout.db"
# Loaded by the app at runtime (public/), so thousands of creators don't end up in the JS bundle.
EXPORT = ROOT / "app/public/data/creators.json"
# Contact emails and past-partner flags go in a separate, git-ignored file next to the export.
PRIVATE_EXPORT = ROOT / "app/public/data/private.json"
# Columns added after the first databases were created.
MIGRATIONS = {
    "creators": {"tiktok": "TEXT", "instagram": "TEXT", "source": "TEXT", "verdict": "TEXT", "verdict_reason": "TEXT",
                 "description": "TEXT", "enriched_at": "TEXT", "comments_at": "TEXT",
                 "intent_at": "TEXT", "safety": "TEXT", "safety_at": "TEXT", "linked": "TEXT", "likes_total": "INTEGER", "featured_at": "TEXT", "bd_at": "TEXT"},
    "comments": {"intent": "INTEGER"},
    "posts": {"description": "TEXT", "shares": "INTEGER"},
    "frontier": {"query": "TEXT", "attempts": "INTEGER NOT NULL DEFAULT 0"},
    "queries": {"url": "TEXT", "prior": "REAL NOT NULL DEFAULT 1", "qualified": "INTEGER NOT NULL DEFAULT 0",
                "attempts": "INTEGER NOT NULL DEFAULT 0"},
}


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    # Autocommit: every write commits on its own, so no worker holds the write lock across network calls
    # (the app writes team state to the same file and would otherwise time out).
    db = sqlite3.connect(DB_PATH, timeout=60, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout = 60000")
    db.executescript((ROOT / "crawler/schema.sql").read_text())
    for table, cols in MIGRATIONS.items():
        have = {r["name"] for r in db.execute(f"PRAGMA table_info({table})")}
        for col, typ in cols.items():
            if col not in have:
                db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
    db.execute("PRAGMA journal_mode = WAL")
    return db


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def known_channel_ids(db: sqlite3.Connection) -> set[str]:
    return {r["channel_id"] for r in db.execute("SELECT channel_id FROM creators")}


def save_creator(db: sqlite3.Connection, c: dict, seen_at: str | None = None) -> None:
    """Upserts a crawled creator, their Shorts, and today's snapshot."""
    platform = c.get("platform", "youtube")
    cid = f"{'tt' if platform == 'tiktok' else 'yt'}-{c['channelId']}"
    t = seen_at or now()
    db.execute(
        """INSERT INTO creators (id, platform, channel_id, handle, name, market, followers, avatar, bio, email, agency,
                                 games, past_partner, first_seen, last_crawled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET handle=excluded.handle, name=excluded.name, followers=excluded.followers,
             avatar=excluded.avatar, bio=excluded.bio, email=COALESCE(excluded.email, creators.email),
             agency=COALESCE(excluded.agency, creators.agency), games=excluded.games,
             past_partner=excluded.past_partner, last_crawled=excluded.last_crawled""",
        (cid, platform, c["channelId"], c["handle"], c["name"], c["market"], c["followers"], c.get("avatar"), c.get("bio"),
         c.get("email"), c.get("agency"), json.dumps(c["games"]), int(bool(c.get("pastPartner"))), t, t),
    )
    if c.get("linked"):
        db.execute("UPDATE creators SET linked = ? WHERE id = ?", (c["linked"], cid))
    db.execute(
        """UPDATE creators SET tiktok = COALESCE(?, tiktok), instagram = COALESCE(?, instagram), source = COALESCE(source, ?),
             description = COALESCE(?, description), enriched_at = CASE WHEN ? THEN ? ELSE enriched_at END WHERE id = ?""",
        (c.get("tiktok"), c.get("instagram"), c.get("source"), c.get("description"), int(bool(c.get("enriched"))), t, cid),
    )
    save_posts(db, cid, c["posts"], t)
    snapshot(db, cid, c["followers"], [p["views"] for p in c["posts"]], t[:10])


def save_posts(db: sqlite3.Connection, cid: str, posts: list[dict], t: str) -> None:
    for i, p in enumerate(posts):
        db.execute(
            """INSERT INTO posts (id, creator_id, position, title, views, likes, comments, date, updated_at, description)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET position=excluded.position, title=excluded.title, views=excluded.views,
                 likes=COALESCE(excluded.likes, posts.likes), comments=COALESCE(excluded.comments, posts.comments),
                 date=COALESCE(excluded.date, posts.date), updated_at=excluded.updated_at,
                 description=COALESCE(excluded.description, posts.description)""",
            (p["id"], cid, i, p["title"], p["views"], p.get("likes"), p.get("comments"), p.get("date"), t, p.get("description")),
        )
    # Anything that fell out of the latest 30 keeps its row but moves to the back.
    ids = [p["id"] for p in posts]
    db.execute(
        f"UPDATE posts SET position = position + 1000 WHERE creator_id = ? AND id NOT IN ({','.join('?' * len(ids))}) AND position < 1000",
        (cid, *ids),
    )


def snapshot(db: sqlite3.Connection, cid: str, followers: int, views: list[int], day: str) -> None:
    db.execute(
        "INSERT OR REPLACE INTO snapshots (creator_id, day, followers, median_views) VALUES (?, ?, ?, ?)",
        (cid, day, followers, int(median(views)) if views else None),
    )


def growth(db: sqlite3.Connection, cid: str, days: int) -> float | None:
    """Follower change in percent over `days`. Until that much history exists, the change over the history we
    have (at least 2 days) is scaled to `days`; None before that."""
    rows = db.execute("SELECT day, followers FROM snapshots WHERE creator_id = ? ORDER BY day DESC", (cid,)).fetchall()
    if len(rows) < 2:
        return None
    latest = rows[0]
    end = date.fromisoformat(latest["day"])
    cutoff = (end - timedelta(days=days)).isoformat()
    old = next((r for r in rows if r["day"] <= cutoff), None)
    span = days
    if not old:
        old = rows[-1]
        span = (end - date.fromisoformat(old["day"])).days
        if span < 2:
            return None
    if not old["followers"]:
        return None
    change = (latest["followers"] - old["followers"]) / old["followers"] * 100
    return round(change * days / span, 2)


_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def _redact(text: str | None) -> str:
    """Email addresses stay in the private file only, even when a creator wrote one into their bio or a title."""
    return _EMAIL.sub("[email]", text or "")


def export_json(db: sqlite3.Connection, extra=None, not_creator=None) -> int:
    """Writes the app's creator file from the database. `extra(row, posts)` adds derived fields per creator
    (sponsorships, audience) and may mark posts."""
    creators = []
    private = {}
    # Channels the local model judged not to be individual gaming creators stay in the DB but aren't shown.
    for r in db.execute("SELECT * FROM creators WHERE COALESCE(verdict, 'ok') = 'ok' ORDER BY market, followers DESC"):
        if not_creator and not_creator(f"{r['name']} {r['handle']}"):
            continue
        posts = [
            {**{k: p[k] for k in ("id", "views", "likes", "comments", "date")}, "title": _redact(p["title"])}
            for p in db.execute("SELECT * FROM posts WHERE creator_id = ? AND position < 1000 ORDER BY position LIMIT 20", (r["id"],))
        ]
        derived = extra(r, posts) if extra else {}
        creators.append(
            {
                **derived,
                "channelId": r["channel_id"],
                "handle": r["handle"],
                "name": r["name"],
                "market": r["market"],
                "platform": r["platform"],
                "followers": r["followers"],
                "avatar": r["avatar"],
                "bio": _redact(r["bio"]),
                "email": None,
                "agency": r["agency"],
                "games": json.loads(r["games"]),
                "pastPartner": False,
                "growth7d": growth(db, r["id"], 7),
                "growth30d": growth(db, r["id"], 30),
                "lastCrawled": r["last_crawled"],
                "tiktok": r["tiktok"],
                "linked": r["linked"],
                "likesTotal": r["likes_total"],
                "instagram": r["instagram"],
                "source": r["source"],
                "posts": posts,
            }
        )
        if r["email"] or r["past_partner"]:
            private[f"{r['platform']}:{r['channel_id']}"] = {"email": r["email"], "pastPartner": bool(r["past_partner"])}
    EXPORT.parent.mkdir(parents=True, exist_ok=True)
    ptmp = PRIVATE_EXPORT.with_suffix(".tmp")
    ptmp.write_text(json.dumps(private, ensure_ascii=False, separators=(",", ":")))
    ptmp.replace(PRIVATE_EXPORT)
    tmp = EXPORT.with_suffix(".tmp")
    tmp.write_text(json.dumps({"crawledAt": now(), "creators": creators}, ensure_ascii=False, separators=(",", ":")))
    tmp.replace(EXPORT)  # atomic, so the app never reads a half-written file
    return len(creators)


def import_json(db: sqlite3.Connection, path: Path) -> int:
    """One-off: loads an older export (before the database existed) into the database."""
    data = json.loads(path.read_text())
    for c in data["creators"]:
        save_creator(db, c, data.get("crawledAt") or now())
    db.commit()
    return len(data["creators"])


# ---------- Frontier ----------

def enqueue(db: sqlite3.Connection, channel_id: str, name: str | None, source: str, market: str | None,
            votes: dict | None = None, priority: float = 0.0, query: str | None = None) -> bool:
    """Adds or reinforces a discovered channel. Returns True if it was new."""
    row = db.execute("SELECT hits, lang_votes, priority FROM frontier WHERE channel_id = ?", (channel_id,)).fetchone()
    if row:
        merged = json.loads(row["lang_votes"])
        for k, v in (votes or {}).items():
            merged[k] = merged.get(k, 0) + v
        db.execute(
            "UPDATE frontier SET hits = hits + 1, lang_votes = ?, priority = MAX(priority, ?) + 0.5 WHERE channel_id = ?",
            (json.dumps(merged), priority, channel_id),
        )
        return False
    db.execute(
        "INSERT INTO frontier (channel_id, name, source, market_hint, lang_votes, priority, discovered_at, query) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (channel_id, name, source, market, json.dumps(votes or {}), priority, now(), query),
    )
    return True


def source_weights(db: sqlite3.Connection) -> dict[str, float]:
    """How much more often channels from each source qualify than average, smoothed toward 1."""
    rows = db.execute(
        "SELECT source, SUM(status = 'qualified') q, SUM(status IN ('qualified', 'rejected')) n FROM frontier GROUP BY source"
    ).fetchall()
    total_q = sum(r["q"] or 0 for r in rows)
    total_n = sum(r["n"] or 0 for r in rows) or 1
    base = max(0.01, total_q / total_n)
    return {r["source"]: ((r["q"] or 0) + base * 30) / ((r["n"] or 0) + 30) / base for r in rows}


def next_candidates(db: sqlite3.Connection, limit: int, markets: tuple[str, ...] = ("FI", "SE", "DE")) -> list[sqlite3.Row]:
    """Highest priority first, scaled by how well each discovery source has paid off so far. Markets take equal
    shares so the biggest one (Germany) doesn't crowd out the Nordics; unused shares go to the rest."""
    weights = source_weights(db)
    case = " ".join(f"WHEN '{k}' THEN {w:.4f}" for k, w in weights.items() if k.replace("-", "").isalpha())
    # Small-creator sources (commenters, featured channels) get a head start: that's where hidden gems are.
    order = f"(priority + CASE WHEN source IN ('commenter', 'featured') THEN 0.8 ELSE 0 END) * CASE source {case} ELSE 1 END" if case else "priority"
    share = -(-limit // len(markets))
    picked = []
    for m in markets:
        picked += db.execute(
            f"SELECT * FROM frontier WHERE status = 'new' AND market_hint = ? ORDER BY {order} DESC, hits DESC LIMIT ?", (m, share)
        ).fetchall()
    if len(picked) < limit:
        seen = {r["channel_id"] for r in picked}
        rest = db.execute(f"SELECT * FROM frontier WHERE status = 'new' ORDER BY {order} DESC, hits DESC LIMIT ?", (limit * 2,)).fetchall()
        picked += [r for r in rest if r["channel_id"] not in seen][: limit - len(picked)]
    return picked[:limit]


def mark(db: sqlite3.Connection, channel_id: str, status: str, reason: str | None = None) -> None:
    db.execute("UPDATE frontier SET status = ?, reason = ?, checked_at = ? WHERE channel_id = ?", (status, reason, now(), channel_id))


# ---------- Queries ----------

def add_query(db: sqlite3.Connection, qid: str, market: str, kind: str, url: str, prior: float = 1.0) -> bool:
    """Queues a search to run later. Returns True if it wasn't known yet."""
    cur = db.execute(
        "INSERT OR IGNORE INTO queries (query, market, kind, url, prior) VALUES (?, ?, ?, ?, ?)", (qid, market, kind, url, prior)
    )
    return cur.rowcount > 0


def finish_query(db: sqlite3.Connection, qid: str, results: int, new: int) -> None:
    db.execute("UPDATE queries SET results = ?, new_channels = ?, done_at = ? WHERE query = ?", (results, new, now(), qid))


def credit_query(db: sqlite3.Connection, channel_id: str) -> None:
    """A channel qualified: credit the search that first found it, which feeds query scoring."""
    db.execute(
        "UPDATE queries SET qualified = qualified + 1 WHERE query = (SELECT query FROM frontier WHERE channel_id = ?)", (channel_id,)
    )
