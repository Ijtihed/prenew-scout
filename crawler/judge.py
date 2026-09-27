"""Checks that need reading comprehension, done by the local model (Ollama qwen3:8b).

Both are grounded: the model only labels text we give it, and a brand-safety flag counts only when the quoted
evidence really appears in the creator's titles or descriptions. If the model is down, nothing is labelled and
the regex-based numbers stand.
"""

import json
import re
import urllib.request

import llm

OLLAMA = "http://localhost:11434/api/chat"
MODEL = "qwen3:8b"

# Comments worth asking about: they mention hardware at all. Everything else can't be a PC question.
PC_WORDS = re.compile(
    r"\b(pc|pcs|kone\w*|tietokone\w*|läppäri\w*|dator\w*|rechner|laptop\w*|setup|specs?|speksit|gpu|grafik\w*|"
    r"näyt(ön)?ohjain|näyttis|rtx|gtx|radeon|fps|prosessori|processor|cpu|ram)\b",
    re.I,
)


def ask(prompt: str, schema: dict, timeout: float = 120) -> dict:
    return llm.ask_json(prompt, schema, timeout)


YES_NO = {"type": "object", "properties": {"answer": {"type": "string", "enum": ["yes", "no"]}}, "required": ["answer"]}

INTENT_EXAMPLES = """Examples:
"Mikä kone sulla on?" -> yes (asks what PC they use)
"welche Grafikkarte hast du?" -> yes (asks about their GPU)
"vilken dator kör du?" -> yes
"mun läppäri ei pyöritä tätä" -> yes (own laptop can't run it)
"I need a new pc so bad" -> yes (wants a PC)
"haha your pc is a potato" -> no (a joke)
"Bruh spielt vor seinem Gaming PC mit Handy lol" -> no (mocking)
"nice fps in this clip" -> no (about the video)
"pc gamers be like" -> no"""


def label_intent(comments: list[str]) -> dict[int, bool]:
    """{index: is buyer signal}. One narrow question per comment: small models judge single items far better
    than long numbered lists."""
    out = {}
    for i, c in enumerate(comments):
        prompt = (
            "A viewer wrote this comment under a gaming creator's YouTube Short. Is the viewer asking what PC, specs, "
            "GPU or setup the creator uses, saying their own PC or laptop is too weak, or saying they want or need a PC? "
            f"Jokes, mocking and talk about the video don't count.\n\n{INTENT_EXAMPLES}\n\nComment: \"{c[:300]}\""
        )
        out[i] = ask(prompt, YES_NO, timeout=60).get("answer") == "yes"
    return out


# Words that make a snippet worth a closer look, per risk. Game words (kill, shoot) are deliberately absent.
RISK_WORDS = {
    "gambling": r"casino|kasino|kasiino|betting|vedonly\w*|\bbet\b|wetten|spelbolag|slots?\b|roulette|jackpot|"
                r"deposit|talletus\w*|insättning|einzahlung|case ?opening|skin ?(site|gambling)|free ?(case|coins)|\$ ?ilmai\w*|bonus",
    "adult": r"onlyfans|\bnsfw\b|18\+|\bporn\w*|\bsex\w*|nude|fansly",
    "drugs": r"\bweed\b|kannabis|cannabis|\bthc\b|\bcbd\b|kokain|cocaine|vape|snus|nuuska",
    "alcohol": r"\bkalja|\bviina|\böl\b|\bbier\b|\bbeer\b|vodka|\bshot(s)?\b.{0,10}(alko|drink)|kännissä|besoffen|full(a)? ?(på|av)",
    "hate": r"\bn[i1]gg|\bneger|\bschwuchtel|\bhomo\b|\bretard",
    "scam": r"crypto ?giveaway|free ?(robux|v-?bucks)|double your|airdrop",
}
RISK_RX = {k: re.compile(v, re.I) for k, v in RISK_WORDS.items()}
RISK_QUESTION = {
    "gambling": "promoting or linking gambling, betting, casino or skin/case-opening sites",
    "adult": "sexual or adult content",
    "drugs": "promoting drugs, vaping or snus",
    "alcohol": "promoting drinking alcohol",
    "hate": "slurs or hateful content",
    "scam": "a scam or fake giveaway",
}


def snippets(texts: list[str]) -> list[tuple[str, str]]:
    """(category, snippet) around each risky keyword, deduplicated."""
    out, seen = [], set()
    for t in texts:
        for line in (t or "").splitlines():
            for cat, rx in RISK_RX.items():
                if rx.search(line):
                    key = (cat, line.strip().lower()[:120])
                    if key not in seen:
                        seen.add(key)
                        out.append((cat, line.strip()[:240]))
    return out


def brand_safety(name: str, texts: list[str], gambling_brands: list[str] = ()) -> list[dict]:
    """Risks a PC brand with teenage buyers should know about. Keywords find candidates; the model confirms each
    one on its own snippet, so every flag carries the creator's own words as evidence."""
    flags = [{"category": "gambling", "evidence": f"Sponsored by {b}"} for b in gambling_brands]
    done = {f["category"] for f in flags}
    for cat, snip in snippets(texts)[:12]:
        if cat in done:
            continue
        prompt = (
            f"From the YouTube channel \"{name}\": \"{snip}\"\n\nIs this text {RISK_QUESTION[cat]}? "
            "Things that happen inside video games (shooting, killing, horror) don't count."
        )
        if ask(prompt, YES_NO, timeout=60).get("answer") == "yes":
            flags.append({"category": cat, "evidence": snip[:160]})
            done.add(cat)
    return flags
