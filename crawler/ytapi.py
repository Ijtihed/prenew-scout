"""YouTube Data API v3: the official, quota-limited way to read channels, Shorts, stats and comments.

Scraping pages gets throttled per IP; the API doesn't, as long as we stay inside the free daily quota
(10,000 units, resetting at midnight Pacific time). Every call is metered here and stops at a safety margin.

Costs used: channels.list, playlistItems.list, videos.list and commentThreads.list are 1 unit per call
(up to 50 ids per channels/videos call). search.list (100 units) is deliberately not used; discovery stays
on the results page and autocomplete.
"""

import json
import re
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from net import Throttled, Transient, classify

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://www.googleapis.com/youtube/v3/"
DAILY_BUDGET = int(os.environ.get("YOUTUBE_API_BUDGET", "9500"))


KEY_NAME = re.compile(r"^YOUTUBE_API_KEY(?:_\d+)?$")
# Seconds a rejected key is left alone before it's tried again.
KEY_COOLDOWN = 600


def _keys() -> list[str]:
    """Every YouTube key (YOUTUBE_API_KEY, YOUTUBE_API_KEY_2, ...), each from a separate Google project
    with its own daily quota. Read each time, so a key pasted into .env is picked up by running workers."""
    found = {k: v.strip() for k, v in os.environ.items() if KEY_NAME.match(k)}
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            name, _, value = line.partition("=")
            if KEY_NAME.match(name.strip()) and name.strip() not in found:
                found[name.strip()] = value.strip()
    return [v for _, v in sorted(found.items(), key=lambda kv: (len(kv[0]), kv[0])) if v]


def enabled() -> bool:
    return bool(_keys())


class QuotaExhausted(Throttled):
    """Today's units are spent; the API reopens at midnight Pacific time."""


class KeyProblem(Throttled):
    """The API key was rejected (invalid, expired, revoked or the API is disabled for it)."""


def _day() -> str:
    return datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()


def _tag(key: str) -> str:
    """Enough of a key to tell keys apart in the saved state without storing the key itself."""
    return key[-6:]


class Quota:
    """Units spent today per key, persisted in the kv table so restarts don't forget them."""

    def __init__(self):
        self.db = None
        self.day, self.per = _day(), {}
        # Units spent since the last save; several workers share the saved totals.
        self.pending: dict[str, int] = {}
        self.bad: dict[str, float] = {}
        self.lock = threading.Lock()

    @property
    def used(self) -> int:
        return sum(self.per.values())

    def bind(self, db):
        self.db = db
        row = db.execute("SELECT value FROM kv WHERE key = 'ytapi:quota'").fetchone()
        if row:
            saved = json.loads(row[0])
            if saved.get("day") == _day():
                self.day, self.per = saved["day"], dict(saved.get("per", {}))
                keys = _keys()
                if not self.per and saved.get("used") and keys:
                    self.per = {_tag(keys[0]): saved["used"]}

    def _roll(self):
        if _day() != self.day:
            self.day, self.per, self.pending = _day(), {}, {}

    def rejected(self) -> bool:
        """Every key is resting after a rejection (as opposed to being out of quota)."""
        return bool(_keys()) and not self._live()

    def _live(self) -> list[str]:
        now = time.time()
        return [k for k in _keys() if self.bad.get(_tag(k), 0) <= now]

    def spend(self, units: int) -> str:
        """Books the units on the first live key with room left and returns that key."""
        with self.lock:
            self._roll()
            live = self._live()
            if not live and _keys():
                raise KeyProblem("every YouTube API key was rejected recently")
            # The key with the most room left, so parallel work spreads across keys.
            for k in sorted(live, key=lambda k: self.per.get(_tag(k), 0)):
                if self.per.get(_tag(k), 0) + units <= DAILY_BUDGET:
                    self.per[_tag(k)] = self.per.get(_tag(k), 0) + units
                    self.pending[_tag(k)] = self.pending.get(_tag(k), 0) + units
                    return k
            raise QuotaExhausted(f"API budget for {self.day} used on every key ({self.used} units)")

    def exhausted(self, key: str):
        with self.lock:
            self.per[_tag(key)] = DAILY_BUDGET

    def reject(self, key: str):
        with self.lock:
            self.bad[_tag(key)] = time.time() + KEY_COOLDOWN

    def save(self):
        if self.db is None:
            return
        with self.lock:
            self._roll()
            row = self.db.execute("SELECT value FROM kv WHERE key = 'ytapi:quota'").fetchone()
            saved = json.loads(row[0]) if row else {}
            per = dict(saved.get("per", {})) if saved.get("day") == self.day else {}
            for k, v in self.pending.items():
                per[k] = per.get(k, 0) + v
            for k, v in self.per.items():
                if v >= DAILY_BUDGET:
                    per[k] = v
            self.per, self.pending = per, {}
            self.db.execute(
                "INSERT INTO kv (key, value, updated_at) VALUES ('ytapi:quota', ?, datetime('now')) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                (json.dumps({"day": self.day, "used": self.used, "per": self.per}),),
            )

    def left(self) -> int:
        with self.lock:
            self._roll()
            return sum(max(0, DAILY_BUDGET - self.per.get(_tag(k), 0)) for k in self._live())


QUOTA = Quota()


def call(endpoint: str, cost: int = 1, **params) -> dict | None:
    """One API call (1 unit unless `cost` says otherwise). None when the resource doesn't exist (e.g. a channel
    without Shorts). A key that is out of quota or rejected hands the call to the next key."""
    while True:
        key = QUOTA.spend(cost)
        try:
            return _call(endpoint, key, params)
        except QuotaExhausted:
            QUOTA.exhausted(key)
            print(f"YouTube key …{_tag(key)[-4:]} is out of quota for today; trying the next key", flush=True)
        except KeyProblem:
            QUOTA.reject(key)
            print(f"!!! YOUTUBE API KEY PROBLEM: key …{_tag(key)[-4:]} rejected; trying the next key", flush=True)


def _call(endpoint: str, key: str, params: dict) -> dict | None:
    url = BASE + endpoint + "?" + urllib.parse.urlencode({**params, "key": key})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if e.code == 404:
                return None
            if e.code in (400, 403) and any(k in body for k in ("API_KEY_INVALID", "keyInvalid", "API key not valid", "API Key not found", "expired", "API_KEY_SERVICE_BLOCKED", "accessNotConfigured", "SERVICE_DISABLED")):
                raise KeyProblem("YouTube API key rejected") from e
            if e.code == 403 and "quotaExceeded" in body:
                raise QuotaExhausted("YouTube says today's quota is used") from e
            if e.code in (400, 403) and ("commentsDisabled" in body or "forbidden" in body.lower() and "comment" in body.lower()):
                return None
            if e.code in (429, 500, 503) and attempt < 2:
                time.sleep(2 * (attempt + 1))
                continue
            raise classify(RuntimeError(f"API {e.code} {endpoint}: {body[:200]}")) from e
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
                continue
            raise classify(e) from e
    raise Transient(f"API {endpoint} kept failing")


def channels(ids: list[str]) -> dict[str, dict]:
    """Up to 50 channel ids → {id: channel}; unknown or deleted channels are simply missing."""
    out = {}
    for i in range(0, len(ids), 50):
        data = call("channels", part="snippet,statistics,contentDetails", id=",".join(ids[i:i + 50]), maxResults=50)
        for c in (data or {}).get("items", []):
            out[c["id"]] = c
    return out


def channel_for_handle(handle: str) -> dict | None:
    data = call("channels", part="snippet,statistics,contentDetails", forHandle=handle.lstrip("@"))
    items = (data or {}).get("items") or []
    return items[0] if items else None


def shorts(channel_id: str, n: int = 30) -> list[dict] | None:
    """Latest Shorts, newest first: [{id, title, description, date}]. None if the channel has no Shorts."""
    data = call("playlistItems", part="snippet,contentDetails", playlistId="UUSH" + channel_id[2:], maxResults=min(50, n))
    if data is None:
        return None
    out = []
    for it in data.get("items", []):
        sn = it.get("snippet", {})
        vid = it.get("contentDetails", {}).get("videoId") or sn.get("resourceId", {}).get("videoId")
        if not vid:
            continue
        out.append({
            "id": vid,
            "title": sn.get("title") or "",
            "description": sn.get("description") or "",
            "date": (it.get("contentDetails", {}).get("videoPublishedAt") or sn.get("publishedAt") or "")[:10] or None,
        })
    return out


def video_stats(ids: list[str]) -> dict[str, dict]:
    """{id: {views, likes, comments}} for up to 50 ids per call."""
    out = {}
    for i in range(0, len(ids), 50):
        data = call("videos", part="statistics", id=",".join(ids[i:i + 50]), maxResults=50)
        for v in (data or {}).get("items", []):
            st = v.get("statistics", {})
            out[v["id"]] = {
                "views": int(st.get("viewCount", 0)),
                "likes": int(st["likeCount"]) if "likeCount" in st else None,
                "comments": int(st["commentCount"]) if "commentCount" in st else None,
            }
    return out


def search(q: str, region: str, lang: str, days: int = 60, order: str = "relevance") -> list[dict]:
    """Recent Shorts-length videos for a query, targeted at one country and language (100 units).
    [{channel_id, channel, title}]"""
    since = (datetime.now(ZoneInfo("UTC")) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    data = call("search", cost=100, part="snippet", q=q, type="video", videoDuration="short", regionCode=region,
                relevanceLanguage=lang, publishedAfter=since, order=order, maxResults=50)
    return [
        {"channel_id": it["snippet"]["channelId"], "channel": it["snippet"].get("channelTitle"), "title": it["snippet"].get("title") or ""}
        for it in (data or {}).get("items", []) if it.get("snippet", {}).get("channelId")
    ]


def featured(channel_id: str) -> list[str]:
    """Channels a creator features on their page (friends, collab partners, second channels)."""
    data = call("channelSections", part="contentDetails", channelId=channel_id)
    return [cid for sec in (data or {}).get("items", []) for cid in sec.get("contentDetails", {}).get("channels", []) or []]


def comments(video_id: str, n: int = 100) -> list[dict]:
    """Top-level comments, most relevant first: [{id, text, likes, author_channel}]. Empty if comments are off."""
    data = call("commentThreads", part="snippet", videoId=video_id, maxResults=min(100, n), order="relevance", textFormat="plainText")
    out = []
    for t in (data or {}).get("items", []):
        s = t["snippet"]["topLevelComment"]["snippet"]
        out.append({"id": t["snippet"]["topLevelComment"]["id"], "text": s.get("textDisplay") or "", "likes": s.get("likeCount"),
                    "author_channel": (s.get("authorChannelId") or {}).get("value")})
    return out
