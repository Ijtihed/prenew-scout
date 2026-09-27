"""Polite, self-healing network access for the crawler.

Each kind of request (search, channel page, RSS, autocomplete, video/comments) is a *lane* with its own pace
and cool-down, because YouTube throttles them separately: search can be blocked while RSS works fine.

- Pace: a minimum gap between requests per lane plus jitter. It widens on trouble and slowly narrows back
  after a run of successes (additive increase, multiplicative decrease, like TCP).
- Cool-down: a throttle answer (403, 429, bot check) pauses only that lane, doubling each time (5 min up to
  2 h) and resetting after a success.
- Errors are sorted into throttled (retry after the cool-down), transient (retry a few times) and permanent
  (don't retry), so nothing is silently dropped.

It never tries to get around a block: no cookies, proxies or client spoofing; it waits.
"""

import random
import socket
import threading
import time
import urllib.error
import urllib.request

import yt_dlp

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
FLAT = {"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True}

THROTTLE_MARKS = ("HTTP Error 403", "HTTP Error 429", "Too Many Requests", "not a bot", "Sign in to confirm", "403: Forbidden")
TRANSIENT_MARKS = ("timed out", "Timeout", "URLError", "Connection reset", "Temporary failure", "HTTP Error 5",
                   "Remote end closed", "IncompleteRead", "SSL", "Name or service not known", "Unable to download API page")


class Throttled(Exception):
    """The platform asked us to slow down; the item should be retried after the lane's cool-down."""


class Transient(Exception):
    """Network hiccup; worth retrying a few times."""


class Offline(Throttled):
    """This machine has no connection (DNS fails). Nothing is YouTube's fault, so no retries are spent."""


OFFLINE_MARKS = ("Errno -3", "Errno -2", "Temporary failure in name resolution", "Name or service not known",
                 "Network is unreachable", "No address associated", "getaddrinfo failed")


def online() -> bool:
    try:
        socket.getaddrinfo("www.youtube.com", 443)
        return True
    except OSError:
        return False


class Lane:
    def __init__(self, name: str, gap: float, max_gap: float = 20.0):
        self.name, self.base, self.gap, self.max_gap = name, gap, gap, max_gap
        self.next_at = 0.0
        self.pause_until = 0.0
        self.cooldown = 300.0
        self.streak = 0
        self.stats = {"ok": 0, "throttled": 0, "transient": 0}
        self._lock = threading.Lock()

    def paused(self) -> float:
        """Seconds left in the cool-down (0 if open)."""
        return max(0.0, self.pause_until - time.time())

    def wait(self):
        """Blocks until this lane may send its next request; fails fast while the lane is cooling down."""
        if self.paused():
            raise Throttled(f"{self.name} cooling down for {round(self.paused())}s")
        with self._lock:
            now = time.time()
            start = max(now, self.next_at, self.pause_until)
            self.next_at = start + self.gap * random.uniform(0.7, 1.3)
        time.sleep(max(0.0, start - now))

    def ok(self):
        with self._lock:
            self.stats["ok"] += 1
            self.streak += 1
            self.cooldown = 300.0
            if self.streak >= 10:
                self.gap = max(self.base, self.gap * 0.8)
                self.streak = 0

    def throttled(self) -> float:
        with self._lock:
            self.stats["throttled"] += 1
            self.streak = 0
            self.gap = min(self.max_gap, self.gap * 2)
            wait = self.cooldown
            self.pause_until = max(self.pause_until, time.time() + wait)
            self.cooldown = min(7200.0, self.cooldown * 2)
            return wait

    def transient(self):
        with self._lock:
            self.stats["transient"] += 1
            self.streak = 0
            # A timeout isn't a request to slow down, so the pace only eases a little.
            self.gap = min(max(self.base * 4, 2.0), self.gap * 1.2)

    def state(self) -> dict:
        return {"gap": round(self.gap, 2), "paused_s": round(self.paused()), **self.stats}


LANES = {
    "search": Lane("search", 2.5),
    "channel": Lane("channel", 0.8),
    "rss": Lane("rss", 0.5),
    "suggest": Lane("suggest", 0.4),
    "video": Lane("video", 4.0, max_gap=60.0),
}


def classify(e: Exception) -> Exception:
    msg = f"{type(e).__name__}: {e}"
    if isinstance(e, (Throttled, Transient)):
        return e
    if any(k in msg for k in OFFLINE_MARKS):
        return Offline(msg[:200])
    if any(k in msg for k in THROTTLE_MARKS):
        return Throttled(msg[:200])
    if isinstance(e, (TimeoutError, ConnectionError, urllib.error.URLError)) or any(k in msg for k in TRANSIENT_MARKS):
        return Transient(msg[:200])
    return e


def _run(lane: str, fn):
    ln = LANES[lane]
    ln.wait()
    try:
        out = fn()
    except Exception as e:  # noqa: BLE001
        err = classify(e)
        if isinstance(err, Offline):
            pass
        elif isinstance(err, Throttled):
            ln.throttled()
        elif isinstance(err, Transient):
            ln.transient()
        raise err from e
    ln.ok()
    return out


def ydl(lane: str, url: str, opts: dict):
    """yt-dlp extraction through a lane."""
    def go():
        with yt_dlp.YoutubeDL(opts) as y:
            return y.extract_info(url, download=False)
    return _run(lane, go)


def get(lane: str, url: str, timeout: float = 20) -> bytes | None:
    """Plain GET through a lane. None on 404."""
    def go():
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": UA}), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise
    return _run(lane, go)


def lanes_state() -> dict:
    return {k: v.state() for k, v in LANES.items()}
