"""Bright Data's TikTok profiles dataset: real per-video likes, comments and shares for TikTok creators.

TikTok's own embed gives followers and plays but no engagement, so qualified TikTok creators are enriched here
once each. Records are paid from a limited allowance, so every record is counted and a hard cap stops use.
"""

import json
import urllib.error
import urllib.request

import ytapi
from net import Throttled, Transient

DATASET = "gd_l1villgoiiidt09ci"
SCRAPE = f"https://api.brightdata.com/datasets/v3/scrape?dataset_id={DATASET}&notify=false&include_errors=true"
CAP = 4500


def _key() -> str | None:
    env = ytapi.ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("BRIGHTDATA_API_KEY="):
                return line.split("=", 1)[1].strip() or None
    return None


KEY = _key()


def enabled() -> bool:
    return bool(KEY)


def used(db) -> int:
    row = db.execute("SELECT value FROM kv WHERE key = 'brightdata:used'").fetchone()
    return int(row[0]) if row else 0


def _add(db, n: int) -> None:
    db.execute(
        "INSERT INTO kv (key, value, updated_at) VALUES ('brightdata:used', ?, datetime('now')) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        (str(used(db) + n),),
    )
    db.commit()


def profiles(db, handles: list[str]) -> list[dict]:
    """Scrapes profiles (one record each). Returns the raw records that came back without errors."""
    if not handles:
        return []
    if used(db) + len(handles) > CAP:
        raise Throttled(f"Bright Data allowance reached ({used(db)} of {CAP} records used)")
    body = json.dumps({"input": [{"url": f"https://www.tiktok.com/@{h}", "country": ""} for h in handles]}).encode()
    req = urllib.request.Request(SCRAPE, data=body, headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            text = r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors="replace")[:200]
        if e.code in (401, 403) or "not active" in msg:
            print(f"!!! BRIGHT DATA refused the request: {msg}", flush=True)
            raise Throttled(msg) from e
        raise Transient(f"Bright Data {e.code}: {msg}") from e
    _add(db, len(handles))
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = [json.loads(line) for line in text.splitlines() if line.strip().startswith("{")]
    if isinstance(data, dict):
        # A long job comes back as a snapshot to collect later; treat it as not done yet.
        if "snapshot_id" in data:
            raise Transient(f"Bright Data queued the job ({data['snapshot_id']})")
        data = [data]
    return [d for d in data if isinstance(d, dict) and d.get("account_id") and not d.get("error")]
