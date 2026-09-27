"""Reads a creator's comment section: which language the audience writes in, and how often viewers ask about
PCs (what the creator plays on, or that their own PC can't keep up). Those viewers are Prenew's buyers."""

import re

import common as C

# Asking about the creator's hardware, or saying they need a (new/better) PC. Bare mentions ("gaming PC") and
# "fps"/"lag" chatter are left out: they're about the video or the game more often than the viewer's machine.
INTENT = re.compile(
    r"("
    # Finnish
    r"mikä kone|millä koneella|mitä konetta|mitkä speksit|mitkä on speksit|speksit\?|mikä näyt(ön)?ohjain|mikä näyttis|"
    r"mikä prosessori|uu(si|s) kone|uuden koneen|tarviin koneen|tarvitsen (uuden )?koneen|kone ei jaksa|mun kone ei|"
    r"kone ei pyöri|mun läppäri ei|"
    # Swedish
    r"vilken dator|vad har du för dator|vad har du för (grafikkort|pc|setup)|vilket grafikkort|vad kör du på|"
    r"ny dator|min dator klarar inte|min dator orkar inte|min dator är för|"
    # German
    r"welche?n? pc|was für (einen|ein) pc|welche grafikkarte|welche gpu|was hast du für (einen|ein) pc|neue[nr]? pc|"
    r"mein pc schafft|mein pc packt|mein pc ist zu|mein laptop schafft|pc specs|setup\?|"
    # English
    r"what pc|which pc|what('s| is) your (pc|setup|gpu)|your specs|what specs|pc specs|what gpu|which gpu|"
    r"what graphics card|new pc|my pc can'?t|my pc cant|my laptop can'?t|need a pc|buy a pc"
    r")",
    re.I,
)
NOISE = re.compile(r"https?://\S+|@\S+|#\S+|[^\w\s?!.,']")


def language_of(text: str) -> str | None:
    """fi/sv/de/en or None when a comment is too short or unclear to call."""
    t = NOISE.sub(" ", text or "").strip()
    if len(t) < 12:
        return None
    for lang, rx in C.MARKERS.items():
        if rx.search(t):
            return lang
    try:
        guess = C.detect_langs(t)[0]
    except Exception:  # noqa: BLE001
        return None
    return guess.lang if guess.prob > 0.8 else None


def summarize(comments: list[dict], market: str) -> dict:
    """comments: [{text, likes}]. Shares are percentages; examples are the most-liked intent comments."""
    local = C.MARKET_LANG[market]
    langs = [language_of(c["text"]) for c in comments]
    known = [lg for lg in langs if lg]
    # The local model's reading wins where it ran (it tells a real question from a joke); regex otherwise.
    judged = any(c.get("intent") is not None for c in comments)
    intent = [c for c in comments if c.get("intent") == 1] if judged else [c for c in comments if INTENT.search(c["text"] or "")]
    intent.sort(key=lambda c: -(c.get("likes") or 0))
    return {
        "n": len(comments),
        "langN": len(known),
        "local": round(100 * sum(lg == local for lg in known) / len(known)) if len(known) >= 12 else None,
        "intent": round(100 * len(intent) / len(comments), 1) if len(comments) >= 20 else None,
        "intentN": len(intent),
        "examples": [re.sub(r"\s+", " ", c["text"]).strip()[:160] for c in intent[:3]],
        "judged": judged,
    }
