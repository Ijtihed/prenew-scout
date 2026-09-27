"""TikTok creators through TikTok's official public creator embed (tiktok.com/embed/@handle).

The embed is the widget TikTok offers for showing a creator's profile on other sites. Logged out and without
cookies it returns the profile (followers, total likes, bio, avatar, verified) and the latest ~13 videos
(caption, play count, cover). A video's upload time is encoded in its id. Per-video likes and comments are
not in the embed.

Discovery is cross-platform, since TikTok has no open search:
  - TikTok handles listed in YouTube creators' bios (a stated link: trusted);
  - each YouTube creator's own handle tried on TikTok (kept only if the TikTok profile points back to them);
  - @mentions in qualified TikTok creators' captions (collaborators, usually same market).
"""

import json
import re
from datetime import datetime, timezone

import net

EMBED = "https://www.tiktok.com/embed/@{}"
STATE = re.compile(r'<script[^>]*id="__FRONTITY_CONNECT_STATE__"[^>]*>(.*?)</script>', re.S)
MENTION = re.compile(r"(?<![\w@])@([A-Za-z0-9_.]{2,24})")

net.LANES.setdefault("tiktok", net.Lane("tiktok", 1.2))


def video_date(video_id: str) -> str | None:
    """TikTok ids are snowflakes: the top 32 bits are the upload time in Unix seconds."""
    try:
        return datetime.fromtimestamp(int(video_id) >> 32, tz=timezone.utc).date().isoformat()
    except (ValueError, OverflowError, OSError):
        return None


def profile(handle: str) -> dict | None:
    """{user: {...}, videos: [...]} or None if the account doesn't exist, is private or has no videos."""
    body = net.get("tiktok", EMBED.format(handle.lstrip("@")))
    if not body:
        return None
    m = STATE.search(body.decode("utf-8", errors="replace"))
    if not m:
        raise net.Transient(f"tiktok embed without data for @{handle}")
    data = json.loads(m.group(1))
    page = next((v for k, v in data.get("source", {}).get("data", {}).items() if k.startswith("/embed/@")), None)
    if not page or page.get("isError"):
        return None
    u = page.get("userInfo") or {}
    if not u.get("uniqueId") or u.get("privateAccount"):
        return None
    videos = [
        {
            "id": v["id"],
            "title": (v.get("desc") or "")[:150],
            "description": v.get("desc") or "",
            "views": int(v.get("playCount") or 0),
            "likes": None,
            "comments": None,
            "date": video_date(v["id"]),
            "cover": v.get("coverUrl"),
        }
        for v in page.get("videoList") or []
        if v.get("id") and not v.get("privateItem")
    ]
    videos.sort(key=lambda v: v["date"] or "", reverse=True)
    # Pinned videos can be months old; they would make a creator look like they rarely post.
    if videos and videos[0]["date"]:
        recent = [v for v in videos if v["date"] and (datetime.fromisoformat(videos[0]["date"]) - datetime.fromisoformat(v["date"])).days <= 120]
        if len(recent) >= 6:
            videos = recent
    return {
        "user": {
            "id": u.get("id"),
            "handle": u["uniqueId"],
            "name": u.get("nickname") or u["uniqueId"],
            "followers": int(u.get("followerCount") or 0),
            "likes": int(u.get("heartCount") or 0),
            "bio": u.get("signature") or "",
            "avatar": u.get("avatarThumbUrl"),
            "verified": bool(u.get("verified")),
        },
        "videos": videos,
    }


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def same_person(tt: dict, yt_handle: str, yt_name: str) -> bool:
    """A guessed TikTok account counts as the YouTube creator's only if it points back to them: their YouTube
    in the bio, or the same display name (not just the same handle, which anyone can register)."""
    bio = (tt["user"]["bio"] or "").lower()
    if "youtube" in bio or "yt" in bio.split() or norm(yt_handle) in norm(bio):
        return True
    return norm(tt["user"]["name"]) == norm(yt_name) and len(norm(yt_name)) >= 4


def plausibly_theirs(tt: dict, yt_handle: str, yt_name: str) -> bool:
    """A TikTok linked from a YouTube bio is theirs if it points back or the names overlap. Bios also link
    sponsors and friends, so a link alone isn't enough."""
    if same_person(tt, yt_handle, yt_name):
        return True
    t = norm(tt["user"]["handle"]) + " " + norm(tt["user"]["name"])
    return any(len(k) >= 4 and (k[:6] in t) for k in (norm(yt_handle), norm(yt_name)))


def mentions(videos: list[dict]) -> set[str]:
    return {m.rstrip(".") for v in videos for m in MENTION.findall(v["description"] or "")}
