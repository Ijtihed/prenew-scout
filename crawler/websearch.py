"""Google Programmable Search (Custom Search JSON API): finds TikTok creators TikTok itself won't let us search.

Queries like `site:tiktok.com minecraft suomi` return TikTok profile and video pages indexed by Google; the
@handles in those links go into the TikTok queue, where the usual checks decide who qualifies. The free tier is
100 queries a day, metered here per Pacific day like the YouTube API.
"""

import json
import re
import urllib.error
import urllib.parse
import urllib.request

import ytapi
from net import Throttled

CSE = "https://www.googleapis.com/customsearch/v1"
DAILY = 95
HANDLE = re.compile(r"tiktok\.com/@([A-Za-z0-9_.]{2,24})", re.I)


def _cse_id() -> str | None:
    env = ytapi.ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("GOOGLE_CSE_ID="):
                return line.split("=", 1)[1].strip() or None
    return None


CX = _cse_id()


def enabled() -> bool:
    return bool(CX and ytapi.KEY)


class Blocked(Throttled):
    """The key isn't allowed to call Custom Search (API restriction or API not enabled)."""


class Closed(Blocked):
    """The project can't get Custom Search at all (closed to new customers)."""


def used_today(db) -> int:
    row = db.execute("SELECT value FROM kv WHERE key = 'cse:quota'").fetchone()
    state = json.loads(row[0]) if row else {}
    return state.get("n", 0) if state.get("day") == ytapi._day() else 0


def _count(db, n: int) -> None:
    db.execute(
        "INSERT INTO kv (key, value, updated_at) VALUES ('cse:quota', ?, datetime('now')) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        (json.dumps({"day": ytapi._day(), "n": n}),),
    )


def search(db, q: str, start: int = 1) -> list[dict]:
    """One query (10 results). [{handle, title, snippet}] for TikTok links found."""
    n = used_today(db)
    if n >= DAILY:
        raise Throttled("Custom Search quota for today used")
    url = CSE + "?" + urllib.parse.urlencode({"key": ytapi.KEY, "cx": CX, "q": q, "num": 10, "start": start})
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        if e.code == 403 and "does not have the access" in body:
            # Google closed this API to new projects; there's nothing to retry.
            print("!!! GOOGLE CUSTOM SEARCH is closed to new projects; web discovery for TikTok is off", flush=True)
            raise Closed(body[:200]) from e
        if e.code == 403 and ("blocked" in body or "not been used" in body or "disabled" in body):
            print("!!! GOOGLE CUSTOM SEARCH BLOCKED for this key: allow 'Custom Search API' under the key's API restrictions", flush=True)
            raise Blocked(body[:200]) from e
        if e.code in (403, 429) and ("quota" in body.lower() or "rateLimit" in body):
            _count(db, DAILY)
            raise Throttled("Custom Search quota for today used") from e
        raise
    finally:
        _count(db, n + 1)
    out = []
    for it in data.get("items", []) or []:
        for h in HANDLE.findall(it.get("link", "") + " " + it.get("formattedUrl", "")):
            out.append({"handle": h.lower().rstrip("."), "title": it.get("title", ""), "snippet": it.get("snippet", "")})
    return out
