# /// script
# requires-python = ">=3.11"
# dependencies = ["yt-dlp", "langdetect"]
# ///
"""
Scout crawler: finds gaming YouTube Shorts creators in Finland, Sweden and Germany at scale, keyless.

    uv run crawler/scout.py run            # runs until stopped: every step, every round, survives throttling
    uv run crawler/scout.py status         # queue, rejection reasons, lane health (read-only)
    uv run crawler/scout.py refresh        # re-check known creators, snapshot followers (growth)

Pipeline (one round; each step only works while its lane is open)
  suggest   mines YouTube autocomplete in each market's language (stem + a..ö). Real people's searches name
            local creators ("minecraft suomi kakkuh"); every suggestion becomes a search.
  discover  runs queued searches, best first: each query is scored by how many qualified creators searches
            sharing its words (and its kind) produced so far, round-robin across markets. Sources: partner
            seeds, games × local words, newest-first, hashtags, autocomplete, and a name search for every
            creator that qualifies (collabs). Result titles vote on language, ranking the channel queue.
  qualify   Shorts tab (followers, size, language, games, creator vs brand) + Shorts RSS feed (exact views,
            likes, dates, descriptions → contacts, sponsorships, @mentions → snowball).
  enrich    RSS for creators saved before descriptions were kept.
  comments  samples comments on two recent Shorts per creator: audience language and PC-buying questions.
  verify    local qwen3 (Ollama) judges "individual gaming creator?" on name, bio and titles.
  export    app/public/data/creators.json, read by the app at runtime.

Robustness: every request goes through a lane (net.py) with its own pace and cool-down. Throttled work stays
queued and is retried after the cool-down; network hiccups are retried up to 3 times; a crash in one step is
logged and the loop carries on. It never works around a block: it waits.
"""

import argparse
import json
import re
import sqlite3
import sys
import time
import traceback
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, quote_plus

sys.path.insert(0, str(Path(__file__).parent))
import comments as CM  # noqa: E402
import judge  # noqa: E402
import llm  # noqa: E402
import ytapi  # noqa: E402
import tiktok  # noqa: E402
import websearch  # noqa: E402
import brightdata  # noqa: E402
import common as C  # noqa: E402
import net  # noqa: E402
import sponsor  # noqa: E402
import store  # noqa: E402
from net import FLAT, LANES, Offline, Throttled, Transient  # noqa: E402

MIN_FOLLOWERS, MAX_FOLLOWERS = 300, 2_000_000
BREAKOUT_VIEWS = 20_000
ACTIVE_DAYS = 60
MAX_ATTEMPTS = 3


def log(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


# ---------- Queries ----------

def search_url(text: str) -> str:
    """The public results page. Its first page and continuations come from the same web client a visitor uses."""
    return f"https://www.youtube.com/results?search_query={quote_plus(text)}"


def newest_url(text: str) -> str:
    # Newest first surfaces smaller and fresher creators than relevance does (measured: ~5% vs ~0.1% qualify).
    return f"https://www.youtube.com/results?search_query={quote_plus(text)}&sp=CAI%253D"


def seed_queries(db, markets: list[str]) -> None:
    """Queues the fixed query set once; later rounds add autocomplete and collab queries on top."""
    for m in markets:
        for name in C.SEED_NAMES.get(m, []):
            store.add_query(db, f"seed:{name}", m, "seed", search_url(name), 2.0)
        for w in C.GENERIC_GAMING[m]:
            store.add_query(db, f"{w}|{m}", m, "search", search_url(f"{w} shorts"), 1.5)
    for gi, game in enumerate(C.SEARCH_GAMES):
        for m in markets:
            words = C.MARKET_WORDS[m] if gi < 12 else C.MARKET_WORDS[m][:3]
            for w in words:
                store.add_query(db, f"{game} {w}", m, "search", search_url(f"{game} {w}"), 1.2 if gi < 12 else 1.0)
            if gi < 15:
                store.add_query(db, f"new:{game} {C.MARKET_WORDS[m][0]}", m, "search-new", newest_url(f"{game} {C.MARKET_WORDS[m][0]}"), 1.3)
    for m, tags in {"FI": ["suomitubettaja", "minecraftsuomi", "fortnitesuomi"], "SE": ["svenskyoutuber", "minecraftsverige"], "DE": ["zocken", "deutschegamer"]}.items():
        if m in markets:
            for t in tags:
                store.add_query(db, f"#{t}", m, "hashtag", f"https://www.youtube.com/hashtag/{t}", 1.0)
    for m in markets:
        # Stems for autocomplete; the short generic ones also get expanded letter by letter.
        for w in C.MARKET_WORDS[m] + C.GENERIC_GAMING[m]:
            add_stem(db, w, m, alphabet=True)
        for game in C.SEARCH_GAMES[:25]:
            add_stem(db, f"{game} {C.MARKET_WORDS[m][0]}", m)
    db.commit()


def repair(db) -> None:
    """One-off fixes for work lost before the crawler handled throttling (runs once per database)."""
    if db.execute("SELECT 1 FROM kv WHERE key = 'crawler:repair1'").fetchone():
        return
    n = 0
    for r in db.execute("SELECT query, url FROM queries WHERE url LIKE 'ytsearch%'").fetchall():
        db.execute("UPDATE queries SET url = ? WHERE query = ?", (search_url(r["url"].split(":", 1)[1]), r["query"]))
        n += 1
    # Searches that "found nothing" were mostly blocked; run them again.
    requeued = db.execute("UPDATE queries SET done_at = NULL, attempts = 1 WHERE done_at IS NOT NULL AND COALESCE(results, 0) = 0").rowcount
    retried = db.execute("UPDATE frontier SET status = 'new', attempts = 1 WHERE status = 'rejected' AND reason LIKE 'error:%'").rowcount
    db.execute("INSERT INTO kv (key, value, updated_at) VALUES ('crawler:repair1', '1', ?)", (store.now(),))
    db.commit()
    log(f"repair: {n} searches moved to the results page, {requeued} blocked searches and {retried} failed channels requeued")


def repair_offline(db) -> None:
    """Work that failed only because this machine was offline goes back in the queue."""
    ch = db.execute(
        "UPDATE frontier SET status = 'new', attempts = 0 WHERE status = 'error' AND (reason LIKE '%Errno -3%' OR reason LIKE '%Errno -2%' OR reason LIKE '%name resolution%' OR reason LIKE '%Unable to download API page%' OR reason LIKE '%Unable to d%')"
    ).rowcount
    q = db.execute("UPDATE queries SET done_at = NULL, attempts = 0 WHERE done_at IS NOT NULL AND COALESCE(results, 0) = 0 AND attempts >= 1").rowcount
    # "Inactive" with no date at all meant the RSS feed was withheld, not that the channel stopped posting.
    ch += db.execute("UPDATE frontier SET status = 'new', attempts = 0 WHERE status = 'rejected' AND reason = 'inactive (latest None)'").rowcount
    db.commit()
    if ch or q:
        log(f"requeued {ch} channels and {q} searches that failed for reasons outside the channel")


def wait_online() -> None:
    if net.online():
        return
    log("offline; waiting for the connection to come back")
    while not net.online():
        time.sleep(30)
    log("back online")


# ---------- Autocomplete ----------

ALPHABET = {"FI": "abcdefghijklmnoprstuvyäö", "SE": "abcdefghijklmnoprstuvyåäö", "DE": "abcdefghijklmnoprstuvwzäöü",
            "DK": "abcdefghijklmnoprstuvyæøå", "FR": "abcdefghijlmnopqrstuvé", "NL": "abcdefghijklmnoprstuvwz",
            "BE": "abcdefghijklmnoprstuvwz", "AT": "abcdefghijklmnoprstuvwzäöü", "PL": "abcdefghijklmnoprstuwzłśż",
            "EE": "abdeghijklmnoprstuvõäöü", "LV": "abcdegijklmnoprstuvzāēīū", "LT": "abcdegijklmnoprstuvyzšž"}
MARKET_HL = {"FI": ("fi", "FI"), "SE": ("sv", "SE"), "DE": ("de", "DE"), "DK": ("da", "DK"), "FR": ("fr", "FR"), "NL": ("nl", "NL"),
             "BE": ("nl", "BE"), "AT": ("de", "AT"), "PL": ("pl", "PL"), "EE": ("et", "EE"), "LV": ("lv", "LV"), "LT": ("lt", "LT")}
# Where discovery goes now: the markets with the fewest creators so far.
ACTIVE_MARKETS = ("DK", "BE", "AT", "EE", "LV")


def active_first() -> str:
    return f"(market IN ({', '.join(repr(m) for m in ACTIVE_MARKETS)})) DESC"


def add_stem(db, stem: str, market: str, alphabet: bool = False) -> None:
    stems = [stem] + ([f"{stem} {ch}" for ch in ALPHABET[market]] if alphabet else [])
    for st in stems:
        db.execute("INSERT OR IGNORE INTO stems (stem, market) VALUES (?, ?)", (st, market))


def autocomplete(stem: str, market: str) -> list[str]:
    hl, gl = MARKET_HL[market]
    body = net.get("suggest", f"https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl={hl}&gl={gl}&q={quote(stem)}")
    return json.loads(body)[1] if body else []


def suggest(db, workers: int, limit: int) -> int:
    """Turns pending stems into search queries via autocomplete. Suggestions that extend the stem with a new
    word get a higher prior: those extra words are often a creator's name."""
    if LANES["suggest"].paused():
        return 0
    # Markets being crawled only, newest first.
    order = " ".join(f"WHEN '{m}' THEN {i}" for i, m in enumerate(ACTIVE_MARKETS))
    marks = ",".join("?" * len(ACTIVE_MARKETS))
    rows = db.execute(
        f"SELECT stem, market FROM stems WHERE done_at IS NULL AND market IN ({marks}) ORDER BY CASE market {order} END LIMIT ?",
        (*ACTIVE_MARKETS, limit),
    ).fetchall()
    added = done = 0
    with ThreadPoolExecutor(workers) as pool:
        futures = {pool.submit(autocomplete, r["stem"], r["market"]): r for r in rows}
        for f in as_completed(futures):
            r = futures[f]
            try:
                sugg = f.result()
            except (Throttled, Transient):
                continue
            except Exception as e:  # noqa: BLE001
                log(f"autocomplete failed {r['stem']}: {str(e)[:80]}")
                sugg = []
            base = set(r["stem"].lower().split())
            for text in sugg:
                extra = set(text.lower().split()) - base - C.VOCAB
                added += store.add_query(db, f"ac:{text}|{r['market']}", r["market"], "suggest", newest_url(text), 1.6 if extra else 1.1)
            db.execute("UPDATE stems SET suggestions = ?, done_at = ? WHERE stem = ?", (len(sugg), store.now(), r["stem"]))
            # Commit per stem: holding the write lock for a whole round blocks the app's saves.
            db.commit()
            done += 1
    db.commit()
    if LANES["suggest"].paused():
        log(f"autocomplete throttled; cooling down {round(LANES['suggest'].paused())}s")
    return done + added


# ---------- Discover ----------

PRIORITY = {"seed": 3.0, "mention": 2.5, "featured": 2.4, "collab": 2.2, "search-new": 1.5, "suggest": 1.3, "commenter": 1.2, "search": 1.0, "hashtag": 1.0}


def words(qid: str) -> set[str]:
    text = qid.split(":", 1)[-1].split("|")[0].lower()
    return {w for w in text.replace("#", " ").split() if len(w) > 2}


def pick_queries(db, n: int) -> list[sqlite3.Row]:
    """Chooses the next queries: prior × learned yield of their words and kind, interleaved across markets.

    A word's yield is qualified creators per new channel over finished queries containing it; the same is
    learned per kind of search. Both are smoothed toward a small base rate so one lucky query doesn't dominate."""
    stats: dict[str, list[int]] = {}
    kinds: dict[str, list[int]] = {}
    for r in db.execute("SELECT query, kind, new_channels, qualified FROM queries WHERE done_at IS NOT NULL"):
        k = kinds.setdefault(r["kind"], [0, 0])
        k[0] += r["qualified"] or 0
        k[1] += r["new_channels"] or 0
        for w in words(r["query"]):
            s = stats.setdefault(w, [0, 0])
            s[0] += r["qualified"] or 0
            s[1] += r["new_channels"] or 0
    base = 0.05

    def score(r) -> float:
        rates = [(q + base * 10) / (new + 10) for q, new in (stats.get(w, (0, 0)) for w in words(r["query"]))]
        kq, kn = kinds.get(r["kind"], (0, 0))
        kind_rate = (kq + base * 50) / (kn + 50)
        return r["prior"] * (0.5 + max(rates or [base]) / base * 0.5) * (kind_rate / base) ** 0.5

    by_market: dict[str, list] = {}
    for r in db.execute("SELECT * FROM queries WHERE done_at IS NULL AND kind != 'web-tiktok'"):
        if r["market"] not in ACTIVE_MARKETS:
            continue
        by_market.setdefault(r["market"], []).append(r)
    for rows in by_market.values():
        rows.sort(key=score, reverse=True)
    out = []
    while len(out) < n and any(by_market.values()):
        for rows in by_market.values():
            if rows and len(out) < n:
                out.append(rows.pop(0))
    return out


def run_query(url: str):
    info = net.ydl("search", url, {**FLAT, "playlistend": 120})
    hits = {}
    for e in info.get("entries") or []:
        if not e or not e.get("channel_id"):
            continue
        h = hits.setdefault(e["channel_id"], {"name": e.get("channel") or e.get("uploader"), "titles": []})
        h["titles"].append(e.get("title") or "")
    return hits


def discover(db, workers, max_queries) -> int:
    if LANES["search"].paused():
        return 0
    todo = pick_queries(db, max_queries)
    done = 0
    with ThreadPoolExecutor(workers) as pool:
        futures = {pool.submit(run_query, r["url"]): r for r in todo}
        for f in as_completed(futures):
            r = futures[f]
            qid, m, kind = r["query"], r["market"], r["kind"]
            try:
                hits = f.result()
            except Throttled:
                continue  # stays queued
            except Transient as e:
                attempts = r["attempts"] + 1
                db.execute("UPDATE queries SET attempts = ? WHERE query = ?", (attempts, qid))
                if attempts >= MAX_ATTEMPTS:
                    store.finish_query(db, qid, 0, 0)
                    log(f"search gave up after {attempts} tries {qid}: {str(e)[:80]}")
                continue
            except Exception as e:  # noqa: BLE001
                log(f"search failed {qid}: {str(e)[:100]}")
                store.finish_query(db, qid, 0, 0)
                continue
            new = 0
            for cid, h in hits.items():
                votes = dict(C.lang_votes(h["titles"]))
                bonus = 1.0 if votes.get(C.MARKET_LANG[m]) else 0.0
                new += store.enqueue(db, cid, h["name"], kind, m, votes, PRIORITY[kind] + bonus, qid)
            store.finish_query(db, qid, len(hits), new)
            db.commit()
            done += 1
    db.commit()
    if LANES["search"].paused():
        log(f"search throttled; cooling down {round(LANES['search'].paused())}s, queued searches kept")
    return done


# ---------- Qualify ----------

ATOM = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015", "m": "http://search.yahoo.com/mrss/"}


def rss_shorts(channel_id: str) -> list[dict]:
    """The channel's latest 15 Shorts from its public RSS feed: exact views, likes, dates and descriptions in one
    light request (the UUSH playlist is YouTube's Shorts-only uploads list)."""
    body = net.get("rss", f"https://www.youtube.com/feeds/videos.xml?playlist_id=UUSH{channel_id[2:]}")
    if not body:
        return []
    out = []
    for e in ET.fromstring(body).findall("a:entry", ATOM):
        stats = e.find("m:group/m:community/m:statistics", ATOM)
        stars = e.find("m:group/m:community/m:starRating", ATOM)
        out.append({
            "id": e.findtext("yt:videoId", "", ATOM),
            "title": e.findtext("a:title", "", ATOM),
            "views": int(stats.get("views", 0)) if stats is not None else 0,
            "likes": int(stars.get("count", 0)) if stars is not None else None,
            "date": e.findtext("a:published", "", ATOM)[:10] or None,
            "description": e.findtext("m:group/m:description", "", ATOM),
        })
    return out


def qualify_one(cand: dict) -> dict:
    """Returns {'status': 'qualified', 'creator': {...}, 'mentions': [...]} or {'status': 'rejected', 'reason': ...}.
    Raises Throttled/Transient so the caller can retry later."""
    key = cand["channel_id"]
    url = f"https://www.youtube.com/{key}/shorts" if key.startswith("@") else f"https://www.youtube.com/channel/{key}/shorts"
    try:
        ch = net.ydl("channel", url, {**FLAT, "playlistend": 30})
    except (Throttled, Transient):
        raise
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if "does not have a shorts tab" in msg:
            return {"status": "rejected", "reason": "no Shorts"}
        if any(k in msg for k in ("does not exist", "unavailable", "terminated", "404")):
            return {"status": "rejected", "reason": "channel gone"}
        return {"status": "rejected", "reason": f"error: {msg[:80]}"}
    channel_id = ch.get("channel_id") or key
    name = ch.get("channel") or ch.get("uploader") or channel_id
    handle = (ch.get("uploader_id") or "").lstrip("@") or name
    followers = ch.get("channel_follower_count") or 0
    entries = [e for e in (ch.get("entries") or []) if e and e.get("id")]
    titles = [e.get("title") or "" for e in entries]
    desc = ch.get("description") or ""

    if len(entries) < 8:
        return {"status": "rejected", "reason": f"only {len(entries)} Shorts", "channel_id": channel_id}
    # Small channels still count when a recent Short took off: that's the growth worth catching early.
    breakout = max((e.get("view_count") or 0 for e in entries[:6]), default=0) >= BREAKOUT_VIEWS and followers >= 100
    if followers > MAX_FOLLOWERS or (followers < MIN_FOLLOWERS and not breakout):
        return {"status": "rejected", "reason": f"{followers} followers", "channel_id": channel_id}
    if C.NOT_A_CREATOR.search(f"{name} {handle}"):
        return {"status": "rejected", "reason": "brand/media/clip channel", "channel_id": channel_id}
    market, share = C.best_market(titles, desc, cand.get("market_hint"))
    if not market:
        return {"status": "rejected", "reason": f"language (share {share:.2f})", "channel_id": channel_id}
    games = C.detect_games(titles + [desc])
    if not games:
        return {"status": "rejected", "reason": "not gaming", "channel_id": channel_id}

    feed = {p["id"]: p for p in rss_shorts(channel_id)} if channel_id.startswith("UC") else {}
    if not feed:
        # The channel has Shorts, so an empty feed means YouTube is holding RSS back (it answers 404 then).
        wait = LANES["rss"].throttled()
        raise Throttled(f"rss empty for a channel with Shorts; cooling down {round(wait)}s")
    latest = max((p["date"] for p in feed.values() if p["date"]), default=None)
    if not latest or (datetime.now() - datetime.strptime(latest, "%Y-%m-%d")).days > ACTIVE_DAYS:
        return {"status": "rejected", "reason": f"inactive (latest {latest})", "channel_id": channel_id}
    posts = []
    for e in entries:
        f = feed.get(e["id"], {})
        posts.append({
            "id": e["id"],
            "title": e.get("title") or f.get("title") or "",
            "views": f.get("views") or e.get("view_count") or 0,
            "likes": f.get("likes"),
            "comments": None,
            "date": f.get("date"),
            "description": f.get("description"),
        })

    info = C.contacts([desc] + [p["description"] for p in feed.values()], handle)
    avatar = next((t["url"] for t in ch.get("thumbnails") or [] if t.get("width") and t.get("width") == t.get("height")), None)
    past = C.norm(handle) in C.PAST_PARTNERS or C.norm(name) in C.PAST_PARTNERS
    return {
        "status": "qualified",
        "channel_id": channel_id,
        "mentions": info["mentions"],
        "creator": {
            "channelId": channel_id,
            "handle": handle,
            "name": name,
            "market": market,
            "platform": "youtube",
            "followers": followers,
            "avatar": avatar,
            "bio": desc.split("\n")[0][:160],
            "description": desc,
            "enriched": bool(feed),
            "email": info["email"],
            "agency": info["agency"],
            "tiktok": info["tiktok"],
            "instagram": info["instagram"],
            "games": games,
            "pastPartner": past,
            "source": cand["source"],
            "posts": posts,
        },
    }


def record(db, c: dict, res: dict, known: set, stats: Counter) -> bool:
    """Stores one qualify result. True when the channel turned out to be a creator we already have."""
    status = res["status"]
    # Mentions come in as @handles; once resolved, record the real channel id too.
    if res.get("channel_id") and res["channel_id"] != c["channel_id"]:
        store.mark(db, c["channel_id"], "resolved", res["channel_id"])
        if res["channel_id"] in known:
            return True
        store.enqueue(db, res["channel_id"], None, c["source"], c["market_hint"], query=c.get("query"))
    if status == "qualified":
        store.save_creator(db, res["creator"])
        store.mark(db, res["channel_id"], "qualified")
        store.credit_query(db, res["channel_id"])
        known.add(res["channel_id"])
        cr = res["creator"]
        for m in res["mentions"]:
            store.enqueue(db, f"@{m}", m, "mention", cr["market"], priority=PRIORITY["mention"], query=f"mention:{cr['handle']}")
        # Snowball: searches and autocomplete for their name surface collabs and similar local creators.
        store.add_query(db, f"collab:{cr['name']}", cr["market"], "collab", search_url(cr["name"]), 1.8)
        add_stem(db, cr["name"].lower(), cr["market"])
        stats["qualified"] += 1
    else:
        store.mark(db, res.get("channel_id") or c["channel_id"], "rejected", res["reason"])
        stats[f"rejected: {res['reason'].split(' (')[0].split(':')[0]}"] += 1
    return False


def qualify(db, limit, workers) -> Counter:
    stats = Counter()
    if LANES["channel"].paused() or LANES["rss"].paused():
        return stats
    cands = [dict(r) for r in store.next_candidates(db, limit, ACTIVE_MARKETS)]
    known = store.known_channel_ids(db)
    todo = []
    for c in cands:
        votes = json.loads(c["lang_votes"])
        # Free pre-filter: several results, all clearly in other languages.
        if c["hits"] >= 2 and votes and not any(votes.get(l) for l in C.LANG_MARKET):
            store.mark(db, c["channel_id"], "rejected", "language (from search titles)")
            stats["rejected: language (titles)"] += 1
        elif c["channel_id"] in known:
            store.mark(db, c["channel_id"], "qualified", "already known")
        else:
            todo.append(c)
    db.commit()
    with ThreadPoolExecutor(workers) as pool:
        futures = {pool.submit(qualify_one, c): c for c in todo}
        for f in as_completed(futures):
            c = futures[f]
            try:
                res = f.result()
            except Throttled:
                stats["throttled (kept)"] += 1
                continue
            except Transient as e:
                attempts = c["attempts"] + 1
                if attempts >= MAX_ATTEMPTS:
                    store.mark(db, c["channel_id"], "error", str(e)[:80])
                else:
                    db.execute("UPDATE frontier SET attempts = ? WHERE channel_id = ?", (attempts, c["channel_id"]))
                stats["network retry"] += 1
                continue
            except Exception as e:  # noqa: BLE001
                store.mark(db, c["channel_id"], "error", str(e)[:80])
                stats["error"] += 1
                continue
            if record(db, c, res, known, stats):
                continue
            db.commit()
    return stats



# ---------- Qualify through the YouTube Data API ----------

def api_check(cand: dict, ch: dict) -> dict:
    """Same gates as qualify_one, from API data: 2 units (Shorts list + stats) for channels that pass the free
    checks on the channel record."""
    cid = ch["id"]
    sn, st = ch.get("snippet", {}), ch.get("statistics", {})
    name = sn.get("title") or cid
    handle = (sn.get("customUrl") or "").lstrip("@") or name
    followers = int(st.get("subscriberCount", 0) or 0)
    desc = sn.get("description") or ""
    country = sn.get("country")
    if followers > MAX_FOLLOWERS:
        return {"status": "rejected", "reason": f"{followers} followers", "channel_id": cid}
    if followers < 100:
        return {"status": "rejected", "reason": f"{followers} followers", "channel_id": cid}
    if C.NOT_A_CREATOR.search(f"{name} {handle}"):
        return {"status": "rejected", "reason": "brand/media/clip channel", "channel_id": cid}
    if country and country not in C.MARKET_LANG:
        return {"status": "rejected", "reason": f"country {country}", "channel_id": cid}
    items = ytapi.shorts(cid)
    if items is None:
        return {"status": "rejected", "reason": "no Shorts", "channel_id": cid}
    if len(items) < 8:
        return {"status": "rejected", "reason": f"only {len(items)} Shorts", "channel_id": cid}
    latest = max((p["date"] for p in items if p["date"]), default=None)
    if not latest or (datetime.now() - datetime.strptime(latest, "%Y-%m-%d")).days > ACTIVE_DAYS:
        return {"status": "rejected", "reason": f"inactive (latest {latest})", "channel_id": cid}
    titles = [p["title"] for p in items]
    market, share = C.best_market(titles, desc, cand.get("market_hint"))
    # The channel's own country setting is the strongest market signal there is.
    if country in C.MARKET_LANG:
        market = country
    if not market:
        return {"status": "rejected", "reason": f"language (share {share:.2f})", "channel_id": cid}
    games = C.detect_games(titles + [desc])
    if not games:
        return {"status": "rejected", "reason": "not gaming", "channel_id": cid}
    stats = ytapi.video_stats([p["id"] for p in items[:30]])
    posts = [{**p, **stats.get(p["id"], {"views": 0, "likes": None, "comments": None})} for p in items[:30]]
    breakout = max((p["views"] for p in posts[:6]), default=0) >= BREAKOUT_VIEWS
    if followers < MIN_FOLLOWERS and not breakout:
        return {"status": "rejected", "reason": f"{followers} followers", "channel_id": cid}
    info = C.contacts([desc] + [p["description"] for p in items], handle)
    thumbs = sn.get("thumbnails", {})
    avatar = (thumbs.get("high") or thumbs.get("medium") or thumbs.get("default") or {}).get("url")
    return {
        "status": "qualified",
        "channel_id": cid,
        "mentions": info["mentions"],
        "creator": {
            "channelId": cid, "handle": handle, "name": name, "market": market, "platform": "youtube",
            "followers": followers, "avatar": avatar, "bio": desc.split("\n")[0][:160], "description": desc,
            "enriched": True, "email": info["email"], "agency": info["agency"], "tiktok": info["tiktok"],
            "instagram": info["instagram"], "games": games,
            "pastPartner": C.norm(handle) in C.PAST_PARTNERS or C.norm(name) in C.PAST_PARTNERS,
            "source": cand["source"], "posts": posts,
        },
    }


def api_qualify(db, limit: int, workers: int = 8) -> Counter:
    stats = Counter()
    if not ytapi.enabled() or ytapi.QUOTA.left() < 100:
        return stats
    cands = [dict(r) for r in store.next_candidates(db, limit, ACTIVE_MARKETS)]
    known = store.known_channel_ids(db)
    ids, handles = [], []
    for c in cands:
        votes = json.loads(c["lang_votes"])
        if c["hits"] >= 2 and votes and not any(votes.get(l) for l in C.LANG_MARKET):
            store.mark(db, c["channel_id"], "rejected", "language (from search titles)")
            stats["rejected: language (titles)"] += 1
        elif c["channel_id"] in known:
            store.mark(db, c["channel_id"], "qualified", "already known")
        elif c["channel_id"].startswith("@"):
            handles.append(c)
        else:
            ids.append(c)
    db.commit()
    try:
        chans = ytapi.channels([c["channel_id"] for c in ids])
        for c in handles[:40]:
            ch = ytapi.channel_for_handle(c["channel_id"])
            if ch:
                chans[c["channel_id"]] = ch
    except Throttled as e:
        log(f"api: {e}")
        return stats
    todo = []
    for c in ids + handles[:40]:
        ch = chans.get(c["channel_id"])
        if not ch:
            store.mark(db, c["channel_id"], "rejected", "channel gone")
            stats["rejected: channel gone"] += 1
        else:
            todo.append((c, ch))
    db.commit()
    with ThreadPoolExecutor(workers) as pool:
        futures = {pool.submit(api_check, c, ch): c for c, ch in todo}
        for f in as_completed(futures):
            c = futures[f]
            try:
                res = f.result()
            except Throttled as e:
                stats["api budget reached"] += 1
                continue
            except Exception as e:  # noqa: BLE001
                stats["error"] += 1
                log(f"api check failed {c['channel_id']}: {str(e)[:100]}")
                continue
            if record(db, c, res, known, stats):
                continue
            db.commit()
    ytapi.QUOTA.save()
    db.commit()
    return stats



def api_snapshot(db, limit: int = 500) -> int:
    """Daily followers for every creator (1 unit per 50) plus fresh view counts on their recent Shorts
    (1 unit per creator); growth and momentum come from these."""
    if not ytapi.enabled() or ytapi.QUOTA.left() < 100:
        return 0
    today = store.now()[:10]
    rows = db.execute(
        "SELECT id, channel_id FROM creators c WHERE platform = 'youtube' AND NOT EXISTS (SELECT 1 FROM snapshots s WHERE s.creator_id = c.id AND s.day = ?) LIMIT ?",
        (today, limit),
    ).fetchall()
    if not rows:
        return 0
    try:
        chans = ytapi.channels([r["channel_id"] for r in rows])
        done = 0
        for r in rows:
            ch = chans.get(r["channel_id"])
            if not ch:
                continue
            followers = int(ch.get("statistics", {}).get("subscriberCount", 0) or 0)
            ids = [p["id"] for p in db.execute("SELECT id FROM posts WHERE creator_id = ? AND position < 30", (r["id"],))]
            stats = ytapi.video_stats(ids) if ids else {}
            t = store.now()
            for vid, v in stats.items():
                db.execute("UPDATE posts SET views = ?, likes = COALESCE(?, likes), comments = COALESCE(?, comments), updated_at = ? WHERE id = ?",
                           (v["views"], v["likes"], v["comments"], t, vid))
            db.execute("UPDATE creators SET followers = ?, last_crawled = ? WHERE id = ?", (followers, t, r["id"]))
            store.snapshot(db, r["id"], followers, [v["views"] for v in stats.values()], today)
            db.commit()
            done += 1
    except Throttled as e:
        log(f"api snapshot: {e}")
    ytapi.QUOTA.save()
    db.commit()
    return done


def api_comments(db, limit: int = 60) -> int:
    """Up to 100 comments on each of two well-watched recent Shorts per creator (2 units per creator)."""
    if not ytapi.enabled() or ytapi.QUOTA.left() < 100:
        return 0
    rows = db.execute(
        # Commenters on a creator are mostly from the same country, so the thinnest markets go first.
        f"SELECT id FROM creators WHERE platform = 'youtube' AND comments_at IS NULL ORDER BY {active_first()}, (verdict = 'ok') DESC, followers DESC LIMIT ?", (limit,)
    ).fetchall()
    done = 0
    for r in rows:
        vids = [p["id"] for p in db.execute(
            "SELECT id FROM posts WHERE creator_id = ? AND position < 8 ORDER BY views DESC LIMIT 2", (r["id"],))]
        try:
            got = [(v, c) for v in vids for c in ytapi.comments(v)]
        except Throttled as e:
            log(f"api comments: {e}")
            break
        except Exception as e:  # noqa: BLE001
            log(f"api comments failed {r['id']}: {str(e)[:80]}")
            got = []
        t = store.now()
        db.executemany(
            "INSERT OR IGNORE INTO comments (id, creator_id, video_id, text, likes, fetched_at) VALUES (?, ?, ?, ?, ?, ?)",
            [(c["id"], r["id"], v, c["text"], c["likes"], t) for v, c in got],
        )
        # Commenters are the creator's audience, and small creators in a scene comment on each other's videos.
        market = db.execute("SELECT market FROM creators WHERE id = ?", (r["id"],)).fetchone()[0]
        for _, c in got:
            if c.get("author_channel"):
                store.enqueue(db, c["author_channel"], None, "commenter", market, priority=1.2, query=f"commenter:{r['id']}")
        db.execute("UPDATE creators SET comments_at = ? WHERE id = ?", (t, r["id"]))
        db.commit()
        done += 1
    ytapi.QUOTA.save()
    db.commit()
    return done


def api_enrich(db, limit: int = 200) -> int:
    """Descriptions and exact stats for creators saved before descriptions were kept (2 units each)."""
    if not ytapi.enabled() or ytapi.QUOTA.left() < 100:
        return 0
    done = 0
    for r in db.execute("SELECT id, channel_id FROM creators WHERE platform = 'youtube' AND enriched_at IS NULL LIMIT ?", (limit,)).fetchall():
        try:
            items = ytapi.shorts(r["channel_id"]) or []
        except Throttled:
            break
        t = store.now()
        for p in items:
            db.execute("UPDATE posts SET description = ?, date = COALESCE(date, ?), updated_at = ? WHERE id = ?",
                       (p["description"], p["date"], t, p["id"]))
        db.execute("UPDATE creators SET enriched_at = ? WHERE id = ?", (t, r["id"]))
        db.commit()
        done += 1
    ytapi.QUOTA.save()
    return done




def link_step(db, limit: int = 40) -> int:
    """Reads link-in-bio pages (Linktree and similar) from creators' descriptions and queues the TikTok
    accounts they list, linked to the creator."""
    rows = db.execute(
        "SELECT id, market, description FROM creators WHERE platform = 'youtube' AND description IS NOT NULL "
        "AND id NOT IN (SELECT value FROM kv WHERE key LIKE 'links:%') LIMIT ?", (limit,)
    ).fetchall()
    done = 0
    for r in rows:
        for url in C.link_pages(r["description"])[:2]:
            try:
                body = net.get("tiktok", url)
            except (Throttled, Transient):
                continue
            except Exception:  # noqa: BLE001
                continue
            for a, b in C.TIKTOK.findall((body or b"").decode("utf-8", errors="replace")):
                h = (a or b).lower().rstrip(".")
                db.execute("INSERT OR IGNORE INTO tiktok_queue (handle, source, market_hint, linked) VALUES (?, 'bio', ?, ?)", (h, r["market"], r["id"]))
        db.execute("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)", (f"links:{r['id']}", r["id"], store.now()))
        db.commit()
        done += 1
    return done



WEB_WORDS = {"FI": ["suomi", "suomeksi", "pelaa"], "SE": ["svenska", "på svenska", "sverige"], "DE": ["deutsch", "zocken"]}


def web_tiktok_seed(db) -> None:
    for m, ws in WEB_WORDS.items():
        for w in ws:
            store.add_query(db, f"web:{w} gaming|{m}", m, "web-tiktok", f"cse:site:tiktok.com {w} gaming", 1.4)
            for game in C.SEARCH_GAMES[:20]:
                store.add_query(db, f"web:{game} {w}|{m}", m, "web-tiktok", f"cse:site:tiktok.com {game} {w}", 1.2)
    db.commit()


_web_blocked_until = 0.0


def web_tiktok_step(db) -> int:
    """Google search for TikTok creators by game and language (free tier: ~95 a day, Sweden first)."""
    global _web_blocked_until
    if db.execute("SELECT 1 FROM kv WHERE key = 'cse:closed'").fetchone():
        return 0
    if not websearch.enabled() or time.time() < _web_blocked_until or websearch.used_today(db) >= websearch.DAILY:
        return 0
    web_tiktok_seed(db)
    rows = db.execute("SELECT * FROM queries WHERE kind = 'web-tiktok' AND done_at IS NULL ORDER BY prior DESC, RANDOM()").fetchall()
    todo = []
    for m, k in (("SE", 2), ("FI", 2), ("DE", 1)):
        todo += [r for r in rows if r["market"] == m][:k]
    done = 0
    for r in todo:
        try:
            hits = websearch.search(db, r["url"].removeprefix("cse:"))
        except (websearch.Closed, urllib.error.HTTPError) as e:
            # Google closed this API to new projects; remember that across restarts instead of retrying.
            db.execute("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES ('cse:closed', ?, ?)", (str(e)[:200], store.now()))
            log("web search for TikTok is off (Google Custom Search unavailable to this project)")
            break
        except websearch.Blocked:
            _web_blocked_until = time.time() + 1800
            break
        except Throttled:
            break
        new = 0
        for h in hits:
            cur = db.execute("INSERT OR IGNORE INTO tiktok_queue (handle, source, market_hint) VALUES (?, 'web', ?)", (h["handle"], r["market"]))
            new += cur.rowcount
        store.finish_query(db, r["query"], len(hits), new)
        db.commit()
        done += 1
    return done



def bd_enrich(db, batch: int = 10) -> int:
    """Real per-video likes, comments and shares for qualified TikTok creators, once each (paid records)."""
    if not brightdata.enabled():
        return 0
    rows = db.execute(
        "SELECT id, handle FROM creators WHERE platform = 'tiktok' AND bd_at IS NULL AND COALESCE(verdict, 'ok') = 'ok' "
        "ORDER BY (market = 'SE') DESC, (market = 'FI') DESC, followers DESC LIMIT ?", (batch,)
    ).fetchall()
    if not rows:
        return 0
    try:
        recs = brightdata.profiles(db, [r["handle"] for r in rows])
    except (Throttled, Transient) as e:
        log(f"bright data: {str(e)[:120]}")
        return 0
    by = {r["account_id"].lower(): r for r in recs}
    t = store.now()
    for r in rows:
        rec = by.get(r["handle"].lower())
        if rec:
            for v in rec.get("top_videos") or []:
                db.execute(
                    "UPDATE posts SET likes = ?, comments = ?, shares = ?, views = MAX(views, ?), updated_at = ? WHERE id = ?",
                    (v.get("diggcount"), v.get("commentcount"), v.get("share_count"), v.get("playcount") or 0, t, v.get("video_id")),
                )
            db.execute("UPDATE creators SET followers = COALESCE(?, followers), likes_total = COALESCE(?, likes_total) WHERE id = ?",
                       (rec.get("followers"), rec.get("likes"), r["id"]))
        db.execute("UPDATE creators SET bd_at = ? WHERE id = ?", (t, r["id"]))
    db.commit()
    return len(rows)


# ---------- TikTok (official creator embed) ----------

def tiktok_seed(db) -> None:
    """Queues TikTok accounts to check: handles YouTube creators list in their bios, and each YouTube creator's
    own handle as a guess that has to be confirmed."""
    for r in db.execute("SELECT id, handle, tiktok, market, description FROM creators WHERE platform = 'youtube'").fetchall():
        listed = r["tiktok"] or next((a or b for a, b in C.TIKTOK.findall(r["description"] or "")), None)
        if listed:
            db.execute("INSERT OR IGNORE INTO tiktok_queue (handle, source, market_hint, linked) VALUES (?, 'bio', ?, ?)",
                       (listed.lower().rstrip("."), r["market"], r["id"]))
        elif r["handle"] and re.fullmatch(r"[A-Za-z0-9_.]{2,24}", r["handle"]):
            db.execute("INSERT OR IGNORE INTO tiktok_queue (handle, source, market_hint, linked) VALUES (?, 'guess', ?, ?)",
                       (r["handle"].lower(), r["market"], r["id"]))
    db.commit()


def tiktok_check(row: dict, linked: dict | None) -> dict:
    p = tiktok.profile(row["handle"])
    if not p:
        return {"status": "rejected", "reason": "not found or private"}
    u, vids = p["user"], p["videos"]
    if row["source"] == "guess" and not (linked and tiktok.same_person(p, linked["handle"], linked["name"])):
        return {"status": "rejected", "reason": "different person"}
    if row["source"] == "bio" and linked and not tiktok.plausibly_theirs(p, linked["handle"], linked["name"]):
        return {"status": "rejected", "reason": "linked account isn't theirs"}
    breakout = max((v["views"] for v in vids[:6]), default=0) >= BREAKOUT_VIEWS and u["followers"] >= 100
    if u["followers"] > MAX_FOLLOWERS or (u["followers"] < MIN_FOLLOWERS and not breakout):
        return {"status": "rejected", "reason": f"{u['followers']} followers"}
    if len(vids) < 6:
        return {"status": "rejected", "reason": f"only {len(vids)} videos"}
    latest = max((v["date"] for v in vids if v["date"]), default=None)
    if not latest or (datetime.now() - datetime.strptime(latest, "%Y-%m-%d")).days > ACTIVE_DAYS:
        return {"status": "rejected", "reason": f"inactive (latest {latest})"}
    if C.NOT_A_CREATOR.search(f"{u['name']} {u['handle']}"):
        return {"status": "rejected", "reason": "brand/media/clip channel"}
    captions = [v["description"] for v in vids]
    market, share = C.best_market(captions, u["bio"], row.get("market_hint"))
    if not market and linked:
        market = linked["market"]
    if not market:
        return {"status": "rejected", "reason": f"language (share {share:.2f})"}
    games = C.detect_games(captions + [u["bio"]])
    if not games and linked:
        games = json.loads(linked["games"])
    if not games:
        return {"status": "rejected", "reason": "not gaming"}
    info = C.contacts([u["bio"]] + captions, u["handle"])
    return {
        "status": "qualified",
        "mentions": sorted(tiktok.mentions(vids)),
        "likes_total": u["likes"],
        "creator": {
            "channelId": u["handle"], "platform": "tiktok", "handle": u["handle"], "name": u["name"], "market": market,
            "followers": u["followers"], "avatar": u["avatar"], "bio": u["bio"][:160], "description": u["bio"],
            "enriched": True, "email": info["email"] or (linked or {}).get("email"), "agency": info["agency"] or (linked or {}).get("agency"),
            "tiktok": None, "instagram": info["instagram"], "games": games, "linked": row.get("linked"),
            "pastPartner": C.norm(u["handle"]) in C.PAST_PARTNERS or C.norm(u["name"]) in C.PAST_PARTNERS,
            "source": f"tiktok-{row['source']}", "posts": vids,
        },
    }


def tiktok_step(db, limit: int = 40, workers: int = 3) -> int:
    """Checks queued TikTok accounts and snowballs through caption @mentions."""
    if LANES["tiktok"].paused():
        return 0
    tiktok_seed(db)
    rows = [dict(r) for r in db.execute(
        "SELECT * FROM tiktok_queue WHERE status = 'new' ORDER BY (market_hint IN ('DK', 'BE', 'AT', 'EE', 'LV')) DESC, (source = 'bio') DESC, (source IN ('mention', 'web')) DESC, (market_hint = 'SE') DESC LIMIT ?", (limit,))]
    linked = {r["id"]: dict(r) for r in db.execute("SELECT id, handle, name, market, games, email, agency FROM creators WHERE platform = 'youtube'")}
    done = 0
    with ThreadPoolExecutor(workers) as pool:
        futures = {pool.submit(tiktok_check, r, linked.get(r["linked"])): r for r in rows}
        for f in as_completed(futures):
            r = futures[f]
            try:
                res = f.result()
            except (Throttled, Transient):
                continue
            except Exception as e:  # noqa: BLE001
                res = {"status": "rejected", "reason": f"error: {str(e)[:80]}"}
            if res["status"] == "qualified":
                cr = res["creator"]
                store.save_creator(db, cr)
                db.execute("UPDATE creators SET likes_total = ? WHERE id = ?", (res["likes_total"], f"tt-{cr['channelId']}"))
                for m in res["mentions"]:
                    db.execute("INSERT OR IGNORE INTO tiktok_queue (handle, source, market_hint) VALUES (?, 'mention', ?)", (m.lower(), cr["market"]))
            db.execute("UPDATE tiktok_queue SET status = ?, reason = ?, checked_at = ? WHERE handle = ?",
                       (res["status"], res.get("reason"), store.now(), r["handle"]))
            db.commit()
            done += 1
    return done


def tiktok_snapshot(db, limit: int = 60) -> int:
    """Daily followers and fresh play counts for TikTok creators."""
    if LANES["tiktok"].paused():
        return 0
    today = store.now()[:10]
    rows = db.execute(
        "SELECT id, handle FROM creators c WHERE platform = 'tiktok' AND NOT EXISTS (SELECT 1 FROM snapshots s WHERE s.creator_id = c.id AND s.day = ?) LIMIT ?",
        (today, limit),
    ).fetchall()
    done = 0
    for r in rows:
        try:
            p = tiktok.profile(r["handle"])
        except (Throttled, Transient):
            break
        if not p:
            continue
        t = store.now()
        db.execute("UPDATE creators SET followers = ?, likes_total = ?, last_crawled = ? WHERE id = ?",
                   (p["user"]["followers"], p["user"]["likes"], t, r["id"]))
        store.save_posts(db, r["id"], p["videos"], t)
        store.snapshot(db, r["id"], p["user"]["followers"], [v["views"] for v in p["videos"]], today)
        db.commit()
        done += 1
    return done



SEARCH_SHARE = 0.7  # of the daily API budget: finding channels in the new markets is the bottleneck
SEARCH_RESERVE = 2500  # units always left for checking what the searches found
SEARCH_WHEN_QUEUE_BELOW = 400  # candidates waiting in the active markets
REGION_LANG = {"FI": "fi", "SE": "sv", "DE": "de", "DK": "da", "FR": "fr", "NL": "nl", "BE": "nl", "AT": "de",
               "PL": "pl", "EE": "et", "LV": "lv", "LT": "lt"}


def api_search(db, per_round: int = 7) -> int:
    """Targeted discovery through the API: each queued search runs for its own country and language, recent
    Shorts only. 100 units each, capped at SEARCH_SHARE of the day's budget."""
    if not ytapi.enabled():
        return 0
    row = db.execute("SELECT value FROM kv WHERE key = 'ytapi:search'").fetchone()
    state = json.loads(row[0]) if row else {}
    day = ytapi._day()
    n = state.get("n", 0) if state.get("day") == day else 0
    cap = int(ytapi.DAILY_BUDGET * len(ytapi._keys()) * SEARCH_SHARE / 100)
    done = 0
    # Checking what was found comes first: search again once the queue runs low.
    marks = ",".join("?" * len(ACTIVE_MARKETS))
    waiting = db.execute(f"SELECT COUNT(*) FROM frontier WHERE status = 'new' AND market_hint IN ({marks})", ACTIVE_MARKETS).fetchone()[0]
    if waiting > SEARCH_WHEN_QUEUE_BELOW:
        return 0
    # One query per active market a round (pick_queries interleaves markets), searched in parallel.
    todo = pick_queries(db, per_round)[: max(0, min(per_round, cap - n, (ytapi.QUOTA.left() - SEARCH_RESERVE) // 100))]
    if not todo:
        return 0

    def one(i_r):
        i, r = i_r
        text = r["query"].split(":", 1)[-1].split("|")[0]
        # Every other search sorts by upload date: small, active creators surface there, not under relevance.
        return r, ytapi.search(text, r["market"], REGION_LANG[r["market"]], order="date" if (n + i) % 2 else "relevance")

    results = []
    with ThreadPoolExecutor(4) as pool:
        for f in as_completed([pool.submit(one, x) for x in enumerate(todo)]):
            try:
                results.append(f.result())
            except Throttled as e:
                log(f"api search: {e}")
    for r, hits in results:
        n += 1
        new = 0
        by_channel: dict[str, dict] = {}
        for h in hits:
            by_channel.setdefault(h["channel_id"], {"name": h["channel"], "titles": []})["titles"].append(h["title"])
        for cid, h in by_channel.items():
            votes = dict(C.lang_votes(h["titles"]))
            new += store.enqueue(db, cid, h["name"], r["kind"], r["market"], votes, PRIORITY[r["kind"]] + 1.5, r["query"])
        store.finish_query(db, r["query"], len(by_channel), new)
        db.commit()
        done += 1
    db.execute(
        "INSERT INTO kv (key, value, updated_at) VALUES ('ytapi:search', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        (json.dumps({"day": day, "n": n}), store.now()),
    )
    ytapi.QUOTA.save()
    db.commit()
    return done


def api_featured(db, limit: int = 100) -> int:
    """Channels creators feature on their page: friends and collab partners, usually in the same scene (1 unit each)."""
    if not ytapi.enabled() or ytapi.QUOTA.left() < 300:
        return 0
    done = 0
    for r in db.execute(f"SELECT id, channel_id, market FROM creators WHERE platform = 'youtube' AND featured_at IS NULL ORDER BY {active_first()} LIMIT ?", (limit,)).fetchall():
        try:
            ids = ytapi.featured(r["channel_id"])
        except Throttled:
            break
        except Exception as e:  # noqa: BLE001
            log(f"featured failed {r['id']}: {str(e)[:80]}")
            ids = []
        for cid in ids:
            store.enqueue(db, cid, None, "featured", r["market"], priority=2.4, query=f"featured:{r['id']}")
        db.execute("UPDATE creators SET featured_at = ? WHERE id = ?", (store.now(), r["id"]))
        db.commit()
        done += 1
    ytapi.QUOTA.save()
    return done


# ---------- Enrich (descriptions for creators saved before they were kept) ----------

def enrich(db, limit: int, workers: int) -> int:
    if LANES["rss"].paused():
        return 0
    rows = db.execute("SELECT id, channel_id FROM creators WHERE platform = 'youtube' AND enriched_at IS NULL LIMIT ?", (limit,)).fetchall()
    done = 0
    with ThreadPoolExecutor(workers) as pool:
        futures = {pool.submit(rss_shorts, r["channel_id"]): r for r in rows}
        for f in as_completed(futures):
            r = futures[f]
            try:
                feed = f.result()
            except (Throttled, Transient):
                continue
            except Exception as e:  # noqa: BLE001
                log(f"enrich failed {r['channel_id']}: {str(e)[:80]}")
                continue
            if not feed:
                LANES["rss"].throttled()
                continue
            t = store.now()
            for p in feed:
                db.execute(
                    """UPDATE posts SET description = ?, likes = COALESCE(?, likes), date = COALESCE(date, ?),
                         views = MAX(views, ?), updated_at = ? WHERE id = ?""",
                    (p["description"], p["likes"], p["date"], p["views"], t, p["id"]),
                )
            db.execute("UPDATE creators SET enriched_at = ? WHERE id = ?", (t, r["id"]))
            db.commit()
            done += 1
    db.commit()
    return done


# ---------- Daily snapshots (growth) ----------

def snapshot_step(db, limit: int, workers: int) -> int:
    """Re-reads followers and recent views for creators without a snapshot today; growth comes from these."""
    if LANES["channel"].paused():
        return 0
    today = store.now()[:10]
    rows = db.execute(
        "SELECT id, channel_id FROM creators c WHERE platform = 'youtube' AND NOT EXISTS (SELECT 1 FROM snapshots s WHERE s.creator_id = c.id AND s.day = ?) LIMIT ?",
        (today, limit),
    ).fetchall()
    done = 0
    with ThreadPoolExecutor(workers) as pool:
        futures = {pool.submit(net.ydl, "channel", f"https://www.youtube.com/channel/{r['channel_id']}/shorts", {**FLAT, "playlistend": 30}): r for r in rows}
        for f in as_completed(futures):
            r = futures[f]
            try:
                ch = f.result()
            except (Throttled, Transient):
                continue
            except Exception as e:  # noqa: BLE001
                log(f"snapshot failed {r['channel_id']}: {str(e)[:80]}")
                continue
            followers = ch.get("channel_follower_count") or 0
            if not followers:
                continue
            entries = [e for e in (ch.get("entries") or []) if e.get("id")]
            t = store.now()
            db.execute("UPDATE creators SET followers = ?, last_crawled = ? WHERE id = ?", (followers, t, r["id"]))
            for i, e in enumerate(entries):
                # New Shorts get a row; known ones only refresh their view count.
                db.execute(
                    """INSERT INTO posts (id, creator_id, position, title, views, updated_at) VALUES (?, ?, ?, ?, ?, ?)
                       ON CONFLICT(id) DO UPDATE SET position = excluded.position, views = MAX(posts.views, excluded.views), updated_at = excluded.updated_at""",
                    (e["id"], r["id"], i, e.get("title") or "", e.get("view_count") or 0, t),
                )
            store.snapshot(db, r["id"], followers, [e.get("view_count") or 0 for e in entries], today)
            db.commit()
            done += 1
    return done


# ---------- Comments ----------

COMMENT_OPTS = {
    "quiet": True, "no_warnings": True, "skip_download": True, "getcomments": True, "ignore_no_formats_error": True,
    "extractor_args": {"youtube": {"max_comments": ["60", "60", "0", "0"], "comment_sort": ["top"]}},
}


def fetch_comments(video_id: str) -> list[dict]:
    info = net.ydl("video", f"https://www.youtube.com/shorts/{video_id}", COMMENT_OPTS)
    return [{"id": c.get("id"), "text": c.get("text") or "", "likes": c.get("like_count")} for c in info.get("comments") or [] if c.get("id")]


def comments_step(db, limit: int) -> int:
    """Two well-watched recent Shorts per creator. One at a time: this lane is the most sensitive."""
    if LANES["video"].paused():
        return 0
    rows = db.execute(
        # Commenters on a creator are mostly from the same country, so the thinnest markets go first.
        f"SELECT id FROM creators WHERE platform = 'youtube' AND comments_at IS NULL ORDER BY {active_first()}, (verdict = 'ok') DESC, followers DESC LIMIT ?", (limit,)
    ).fetchall()
    done = 0
    for r in rows:
        vids = [p["id"] for p in db.execute(
            "SELECT id FROM posts WHERE creator_id = ? AND position < 8 ORDER BY views DESC LIMIT 2", (r["id"],))]
        try:
            got = [(v, c) for v in vids for c in fetch_comments(v)]
        except Throttled:
            log(f"comments throttled; cooling down {round(LANES['video'].paused())}s")
            break
        except Transient:
            continue
        except Exception as e:  # noqa: BLE001
            # Comments turned off or the video is gone: nothing to read for this creator.
            log(f"comments unavailable for {r['id']}: {str(e)[:80]}")
            got = []
        t = store.now()
        db.executemany(
            "INSERT OR IGNORE INTO comments (id, creator_id, video_id, text, likes, fetched_at) VALUES (?, ?, ?, ?, ?, ?)",
            [(c["id"], r["id"], v, c["text"], c["likes"], t) for v, c in got],
        )
        db.execute("UPDATE creators SET comments_at = ? WHERE id = ?", (t, r["id"]))
        db.commit()
        done += 1
    return done


# ---------- Judge (local model reads comments and checks brand safety) ----------

def judge_step(db, limit: int) -> int:
    done = 0
    for r in db.execute(
        "SELECT id FROM creators WHERE comments_at IS NOT NULL AND intent_at IS NULL LIMIT ?", (limit,)
    ).fetchall():
        rows = db.execute("SELECT id, text FROM comments WHERE creator_id = ?", (r["id"],)).fetchall()
        cand = [c for c in rows if judge.PC_WORDS.search(c["text"] or "")]
        labels: dict[str, int] = {c["id"]: 0 for c in rows}
        try:
            for i in range(0, len(cand), 30):
                chunk = cand[i:i + 30]
                for j, yes in judge.label_intent([c["text"] for c in chunk]).items():
                    labels[chunk[j]["id"]] = int(yes)
        except Exception as e:  # noqa: BLE001
            log(f"judge skipped (local model unavailable: {str(e)[:60]})")
            return done
        db.executemany("UPDATE comments SET intent = ? WHERE id = ?", [(v, k) for k, v in labels.items()])
        db.execute("UPDATE creators SET intent_at = ? WHERE id = ?", (store.now(), r["id"]))
        db.commit()
        done += 1
    for r in db.execute(
        "SELECT id, name, description FROM creators WHERE enriched_at IS NOT NULL AND safety_at IS NULL LIMIT ?", (limit,)
    ).fetchall():
        posts = db.execute(
            "SELECT title, description FROM posts WHERE creator_id = ? AND position < 1000 ORDER BY position LIMIT 15", (r["id"],)
        ).fetchall()
        texts = [p["title"] for p in posts] + [p["description"] or "" for p in posts] + [r["description"] or ""]
        gambling = sorted({b for p in posts for b in sponsor.brands_in(f"{p['title']}\n{p['description'] or ''}") if sponsor.CATEGORY.get(b) == "gambling"})
        try:
            flags = judge.brand_safety(r["name"], texts, gambling)
        except Exception as e:  # noqa: BLE001
            log(f"brand safety skipped (local model unavailable: {str(e)[:60]})")
            return done
        db.execute("UPDATE creators SET safety = ?, safety_at = ? WHERE id = ?", (json.dumps(flags), store.now(), r["id"]))
        db.commit()
        done += 1
    return done


# ---------- Verify (local model) ----------

VERIFY_SCHEMA = {
    "type": "object",
    "properties": {"individual": {"type": "boolean"}, "gaming": {"type": "boolean"}, "reason": {"type": "string"}},
    "required": ["individual", "gaming", "reason"],
}


def verify(db, limit=200) -> int:
    """Asks the local model whether each new creator is an individual gaming creator (not a brand, media outlet,
    clip or fan channel). Skips quietly if Ollama isn't running."""
    done = 0
    rows = db.execute("SELECT id, name, handle, bio FROM creators WHERE verdict IS NULL LIMIT ?", (limit,)).fetchall()
    for r in rows:
        titles = [p["title"] for p in db.execute("SELECT title FROM posts WHERE creator_id = ? ORDER BY position LIMIT 8", (r["id"],))]
        prompt = (
            f"Channel name: {r['name']}\nHandle: @{r['handle']}\nBio: {r['bio']}\nRecent Shorts:\n- " + "\n- ".join(titles) +
            "\n\nIs this ONE individual creator (a person, duo or small friend group making their own videos) rather than "
            "a brand, company, media outlet, esports team, clip/compilation or fan channel? Is the content mostly about "
            "video games? Answer as JSON."
        )
        try:
            out = llm.ask_json(prompt, VERIFY_SCHEMA)
        except Exception as e:  # noqa: BLE001
            log(f"verify skipped (no language model reachable: {str(e)[:60]})")
            break
        ok = bool(out.get("individual")) and bool(out.get("gaming"))
        db.execute("UPDATE creators SET verdict = ?, verdict_reason = ? WHERE id = ?", ("ok" if ok else "reject", out.get("reason", "")[:200], r["id"]))
        db.commit()
        done += 1
    return done


# ---------- Export ----------

def game_of(text: str) -> str | None:
    return next((g for g in C.detect_games([text, text]) if g != "Variety gaming"), None)


def derived(db):
    """Per-creator fields computed from stored posts and comments, so a better detector re-applies to
    everything already crawled without fetching again."""
    def extra(r, posts):
        rows = db.execute(
            "SELECT id, title, description, date, views FROM posts WHERE creator_id = ? AND description IS NOT NULL ORDER BY position LIMIT 30",
            (r["id"],),
        ).fetchall()
        out = {}
        if rows:
            s = sponsor.summarize([dict(p) for p in rows], r["description"] or r["bio"] or "", (r["name"], r["handle"]), game_of)
            ids = set(s.pop("postIds"))
            for p in posts:
                p["sponsored"] = p["id"] in ids
            out["sponsorship"] = s
        if r["comments_at"]:
            cs = [dict(c) for c in db.execute("SELECT text, likes, intent FROM comments WHERE creator_id = ?", (r["id"],))]
            out["audience"] = CM.summarize(cs, r["market"])
        if r["safety_at"]:
            out["safety"] = {"flags": json.loads(r["safety"] or "[]")}
        return out
    return extra


def export(db) -> int:
    # Name filters re-apply to everyone, including creators saved before a filter existed.
    return store.export_json(db, derived(db), lambda text: bool(C.NOT_A_CREATOR.search(text)))


# ---------- Refresh ----------

def refresh(db):
    rows = db.execute("SELECT id, channel_id, name FROM creators WHERE platform = 'youtube'").fetchall()
    n = 0
    for r in rows:
        try:
            ch = net.ydl("channel", f"https://www.youtube.com/channel/{r['channel_id']}/shorts", {**FLAT, "playlistend": 30})
            feed = {p["id"]: p for p in rss_shorts(r["channel_id"])}
        except Throttled:
            log("throttled during refresh; stopping, try later")
            break
        except Exception as e:  # noqa: BLE001
            log(f"{r['name']}: {str(e)[:80]}")
            continue
        entries = [e for e in (ch.get("entries") or []) if e.get("id")]
        followers = ch.get("channel_follower_count") or 0
        posts = []
        for e in entries:
            f = feed.get(e["id"], {})
            posts.append({"id": e["id"], "title": e.get("title") or "", "views": f.get("views") or e.get("view_count") or 0,
                          "likes": f.get("likes"), "date": f.get("date"), "description": f.get("description")})
        t = store.now()
        db.execute("UPDATE creators SET followers = ?, last_crawled = ? WHERE id = ?", (followers, t, r["id"]))
        store.save_posts(db, r["id"], posts, t)
        store.snapshot(db, r["id"], followers, [p["views"] for p in posts], t[:10])
        db.commit()
        n += 1
    log(f"refreshed {n} of {len(rows)} creators; exported {export(db)}")


# ---------- Status / run ----------

def heartbeat(db, rounds: int, did: dict) -> None:
    state = {"at": store.now(), "round": rounds, "did": did, "lanes": net.lanes_state()}
    db.execute(
        "INSERT INTO kv (key, value, updated_at) VALUES ('crawler:state', ?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        (json.dumps(state), state["at"]),
    )
    db.commit()


def status(db):
    q1 = lambda sql: db.execute(sql).fetchone()[0]  # noqa: E731
    print("creators by market:", dict(db.execute("SELECT market, COUNT(*) FROM creators GROUP BY market").fetchall()))
    print("  verdicts:", dict(db.execute("SELECT COALESCE(verdict,'unverified'), COUNT(*) FROM creators GROUP BY 1").fetchall()))
    print(f"  enriched: {q1('SELECT COUNT(*) FROM creators WHERE enriched_at IS NOT NULL')} | comments read: "
          f"{q1('SELECT COUNT(*) FROM creators WHERE comments_at IS NOT NULL')} ({q1('SELECT COUNT(*) FROM comments')} comments)")
    print("frontier:", dict(db.execute("SELECT status, COUNT(*) FROM frontier GROUP BY status").fetchall()))
    print("top rejection reasons:")
    for reason, n in db.execute(
        "SELECT reason, COUNT(*) n FROM frontier WHERE status='rejected' GROUP BY reason ORDER BY n DESC LIMIT 8"
    ):
        print(f"  {n:5}  {reason}")
    q = db.execute("SELECT COUNT(*) FILTER (WHERE done_at IS NOT NULL), COUNT(*) FILTER (WHERE done_at IS NULL) FROM queries").fetchone()
    st = db.execute("SELECT COUNT(*) FILTER (WHERE done_at IS NOT NULL), COUNT(*) FILTER (WHERE done_at IS NULL) FROM stems").fetchone()
    print(f"queries: {q[0]} run, {q[1]} queued | autocomplete stems: {st[0]} done, {st[1]} queued")
    print("queries by kind (run, new channels, qualified):")
    for kind, n, new, ok in db.execute(
        "SELECT kind, COUNT(*), SUM(new_channels), SUM(qualified) FROM queries WHERE done_at IS NOT NULL GROUP BY kind ORDER BY 4 DESC"
    ):
        print(f"  {kind:11} {n:5} {new or 0:7} {ok or 0:5}")
    print("best queries by qualified creators:")
    for qid, m, ok, new in db.execute("SELECT query, market, qualified, new_channels FROM queries ORDER BY qualified DESC, new_channels DESC LIMIT 8"):
        print(f"  {ok:3} of {new or 0:4} new  {qid} ({m})")
    q = db.execute("SELECT value FROM kv WHERE key = 'ytapi:quota'").fetchone()
    if q:
        print(f"YouTube API: {json.loads(q[0])['used']} units used on {json.loads(q[0])['day']} (Pacific day)")
    row = db.execute("SELECT value FROM kv WHERE key = 'crawler:state'").fetchone()
    if row:
        s = json.loads(row["value"])
        print(f"last round {s['round']} at {s['at'][:19]}Z: {s['did']}")
        for name, ln in s["lanes"].items():
            print(f"  lane {name:8} gap {ln['gap']:5}s  paused {ln['paused_s']:5}s  ok {ln['ok']:5}  throttled {ln['throttled']:3}  retries {ln['transient']:3}")


def run(db, markets, args):
    """Rounds forever. Each step does what its lane allows; when nothing could run, it sleeps until the
    earliest lane reopens (or a few minutes), then tries again."""
    seed_queries(db, markets)
    repair(db)
    repair_offline(db)
    ytapi.QUOTA.bind(db)
    rounds = 0
    while True:
        rounds += 1
        wait_online()
        # With an API key, everything but discovery goes through the official API (no IP throttling).
        api = ytapi.enabled() and ytapi.QUOTA.left() >= 100
        steps = [
            ("suggest", lambda: suggest(db, 4, args.stems)),
            ("discover", lambda: discover(db, 2, args.queries)),
            ("api-search", lambda: api_search(db) if api and not args.no_search else 0),
            ("featured", lambda: api_featured(db) if api else 0),
            ("qualify", lambda: 0 if args.no_qualify else sum(api_qualify(db, 400, 12).values()) if api else sum(qualify(db, args.batch, args.workers).values())),
            ("enrich", lambda: api_enrich(db) if api else enrich(db, 60, 3)),
            ("snapshot", lambda: api_snapshot(db) if api else snapshot_step(db, 40, 2)),
            ("comments", lambda: api_comments(db) if api else comments_step(db, args.comments)),
            ("links", lambda: link_step(db)),
            ("tiktok", lambda: 0 if args.no_tiktok else tiktok_step(db)),
            ("tiktok-snapshot", lambda: tiktok_snapshot(db)),
            ("verify", lambda: verify(db)),
            ("judge", lambda: judge_step(db, 25)),
        ]
        did = {}
        for name, step in steps:
            try:
                did[name] = step()
            except Exception:  # noqa: BLE001
                log(f"{name} crashed; continuing\n{traceback.format_exc(limit=4)}")
                did[name] = 0
        try:
            n = export(db)
        except Exception:  # noqa: BLE001
            log(f"export crashed\n{traceback.format_exc(limit=4)}")
            n = -1
        heartbeat(db, rounds, did)
        total = dict(db.execute("SELECT market, COUNT(*) FROM creators GROUP BY market").fetchall())
        paused = {k: round(v.paused()) for k, v in LANES.items() if v.paused()}
        log(f"round {rounds}: {did} → {n} creators in the app {total}" + (f" | cooling: {paused}" if paused else ""))
        if not net.online():
            # Anything that failed in this round failed because of the connection; give it back its tries.
            wait_online()
            repair_offline(db)
            continue
        if not any(did.values()):
            pending = [v.paused() for v in LANES.values() if v.paused()]
            nap = min(300.0, max(30.0, min(pending))) if pending else 300.0
            log(f"nothing to do right now; sleeping {round(nap)}s")
            time.sleep(nap)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["run", "tiktok", "tiktokloop", "bdenrich", "suggest", "discover", "qualify", "apiqualify", "apisearch", "enrich", "comments", "verify", "judge", "refresh", "export", "status"])
    ap.add_argument("--markets", default=",".join(ACTIVE_MARKETS))
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--batch", type=int, default=120, help="channels qualified per round")
    ap.add_argument("--queries", type=int, default=16, help="searches per round")
    ap.add_argument("--stems", type=int, default=80, help="autocomplete stems per round")
    ap.add_argument("--comments", type=int, default=8, help="creators whose comments are read per round")
    ap.add_argument("--no-qualify", action="store_true", help="leave qualifying to another process (e.g. apiqualify)")
    ap.add_argument("--no-tiktok", action="store_true", help="leave TikTok checks to another process (tiktokloop)")
    ap.add_argument("--no-search", action="store_true", help="leave API searches to another process (apisearch)")
    args = ap.parse_args()
    markets = args.markets.split(",")
    db = store.connect()

    if args.command == "status":
        return status(db)
    if args.command == "export":
        return log(f"exported {export(db)} creators")
    if args.command == "refresh":
        return refresh(db)
    seed_queries(db, markets)
    repair(db)
    if args.command == "suggest":
        return log(f"autocomplete: {suggest(db, 4, args.stems)}")
    if args.command == "discover":
        return log(f"searches run: {discover(db, 2, args.queries)}")
    if args.command == "qualify":
        return log(f"qualify: {dict(qualify(db, args.batch, args.workers))}")
    if args.command == "enrich":
        return log(f"enriched {enrich(db, 1000, 3)}")
    if args.command == "comments":
        return log(f"comments read for {comments_step(db, args.comments)} creators")
    if args.command == "verify":
        return log(f"verified {verify(db)}")
    if args.command == "tiktok":
        return log(f"tiktok checked {tiktok_step(db, args.batch)}")
    if args.command == "bdenrich":
        return log(f"bright data enriched {bd_enrich(db, args.batch)} (records used {brightdata.used(db)})")
    if args.command == "tiktokloop":
        # Runs until stopped: checks queued TikTok accounts as fast as the embed lane allows.
        while True:
            try:
                n = web_tiktok_step(db)
                n += tiktok_step(db, 80, 4)
                n += bd_enrich(db)
                n += tiktok_snapshot(db)
            except Exception:  # noqa: BLE001
                log(f"tiktok loop error\n{traceback.format_exc(limit=3)}")
                n = 0
            if n:
                total = dict(db.execute("SELECT market, COUNT(*) FROM creators WHERE platform = 'tiktok' GROUP BY market").fetchall())
                log(f"tiktok: checked {n} → {export(db)} creators in the app | TikTok {total}")
            else:
                time.sleep(60)
    if args.command == "apisearch":
        # Runs until stopped: one search per active market a round until the day's search share is used.
        ytapi.QUOTA.bind(db)
        while True:
            try:
                n = api_search(db, len(ACTIVE_MARKETS))
            except ytapi.KeyProblem:
                n = 0
            if n:
                log(f"api search: {n} searches | quota left {ytapi.QUOTA.left()}")
            else:
                time.sleep(300)
    if args.command == "apiqualify":
        # Runs until stopped: checks whatever discovery adds, waits when the queue is empty or the day's quota is used.
        ytapi.QUOTA.bind(db)
        rounds = 0
        while True:
            if ytapi.QUOTA.rejected():
                log("!!! every YouTube API key was rejected; trying again in 10 min")
                time.sleep(ytapi.KEY_COOLDOWN)
                continue
            if ytapi.QUOTA.left() <= 100:
                log(f"!!! YouTube API quota used for {ytapi.QUOTA.day}; waiting for the reset (midnight Pacific)")
                while ytapi.QUOTA.left() <= 100:
                    time.sleep(300)
                continue
            rounds += 1
            try:
                st = api_qualify(db, args.batch, 16)
            except ytapi.KeyProblem:
                log("!!! YouTube API key rejected; waiting 10 min before trying again")
                time.sleep(600)
                continue
            if st:
                log(f"api round {rounds}: {dict(st)} → {export(db)} creators | quota left {ytapi.QUOTA.left()}")
            else:
                time.sleep(60)
    if args.command == "judge":
        return log(f"judged {judge_step(db, args.batch)}")

    # The loop only ends with the process; anything that escapes a round is logged and retried.
    while True:
        try:
            run(db, markets, args)
        except KeyboardInterrupt:
            raise
        except Exception:  # noqa: BLE001
            log(f"run loop crashed; restarting in 60s\n{traceback.format_exc(limit=6)}")
            time.sleep(60)
            db = store.connect()


if __name__ == "__main__":
    main()
