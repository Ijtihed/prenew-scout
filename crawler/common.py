"""Shared helpers: game detection from the app's catalog, language voting, filters and contact extraction."""

import json
import re
from collections import Counter
from pathlib import Path

from langdetect import DetectorFactory, detect_langs

DetectorFactory.seed = 0
ROOT = Path(__file__).resolve().parents[1]

# Belgium and Austria share their languages with bigger neighbours, so those two markets are only ever set
# from the channel's own country (see scout.api_check), never from language.
MARKET_LANG = {"FI": "fi", "SE": "sv", "DE": "de", "DK": "da", "FR": "fr", "NL": "nl", "BE": "nl", "AT": "de",
               "PL": "pl", "EE": "et", "LV": "lv", "LT": "lt"}
COUNTRY_ONLY = {"BE", "AT"}
LANG_MARKET = {v: k for k, v in MARKET_LANG.items() if k not in COUNTRY_ONLY}

# Prenew's past partners (normalised) and search seeds come from the team's collab sheet, kept out of the repo
# in data/partners.json. Without it the crawler simply has no seeds and flags no one as a past partner.
_partners = json.loads((ROOT / "data/partners.json").read_text()) if (ROOT / "data/partners.json").exists() else {}
PAST_PARTNERS = set(_partners.get("past_partners", []))
SEED_NAMES: dict[str, list[str]] = _partners.get("seed_names", {})

# Local words people put in titles, used to build searches.
MARKET_WORDS = {
    "FI": ["suomi", "suomeksi", "suomalainen", "pelaa", "tubettaja", "pelataan"],
    "SE": ["svenska", "på svenska", "svensk", "spelar", "svensk youtuber", "sverige", "lirar", "svensk gamer", "spelar på svenska"],
    "DE": ["deutsch", "zocken", "auf deutsch", "deutscher youtuber", "lets play deutsch"],
    "DK": ["dansk", "på dansk", "danmark", "spiller", "dansk youtuber", "danske gamere"],
    "FR": ["français", "en français", "france", "je joue", "youtubeur français", "gameplay fr"],
    "NL": ["nederlands", "nederland", "ik speel", "nederlandse youtuber", "in het nederlands"],
    "BE": ["belgië", "belgique", "vlaams", "belgische youtuber", "belge"],
    "AT": ["österreich", "österreichisch", "wien", "austria gaming", "österreicher"],
    "PL": ["po polsku", "polska", "gram w", "polski youtuber", "polskie"],
    "EE": ["eesti", "eesti keeles", "mängin", "eesti youtuber"],
    "LV": ["latviski", "latvija", "spēlēju", "latviešu"],
    "LT": ["lietuviškai", "lietuva", "žaidžiu", "lietuvių"],
}
GENERIC_GAMING = {
    "FI": ["pelit", "pelivideo", "gaming suomi", "pelaan"],
    "SE": ["spel", "gaming sverige", "spelvideo", "jag spelar", "svenska gamers", "svenska youtubers", "roligt spel", "svensk streamer"],
    "DE": ["gaming deutsch", "spiele", "zocken shorts", "ich zocke"],
    "DK": ["gaming danmark", "spil", "jeg spiller", "dansk gamer", "sjove spil"],
    "FR": ["gaming france", "jeux vidéo", "gamer français", "jeu vidéo drôle", "streamer français"],
    "NL": ["gaming nederland", "spelletjes", "nederlandse gamer", "grappige game"],
    "BE": ["gaming belgië", "belgische gamer", "gamer belge", "vlaamse gamer"],
    "AT": ["gaming österreich", "österreichischer gamer", "zocken österreich"],
    "PL": ["gry", "polski gamer", "granie", "śmieszne gry", "gaming polska"],
    "EE": ["mängud", "eesti gamer", "mängimine"],
    "LV": ["spēles", "latviešu geimeris", "spēlēšana"],
    "LT": ["žaidimai", "lietuvių žaidėjas", "žaidimas"],
}

NOT_A_CREATOR = re.compile(
    r"\b(series|league|liiga|clips?|klipit|highlights?|esports?|community|official|news|nyheter|nachrichten|"
    r"buildtheearth|media|magazine|magazin|studios?|records|tv network|fanpage|fan page|compilation|kompilaatio|"
    r"pc games|gamestar|gamepro|pcgh|computer ?bild|games ?wirtschaft|elite series|prime ?video|netflix|disney|hbo|viaplay|"
    r"yle|svt|ard|zdf|funk|rtl|prosieben|telia|elisa|twitch ?(de|fi|se)?|tv ?2|dr (tv|nyheder|ultra)|canal\+?|tf1|"
    r"france ?tv|arte|jeuxvideo|gamekult|ign|eurogamer|millenium|npo|vrt|rtbf|orf|tvp|polsat|tvn|err|ltv|lrt|"
    r"gry-online|gamezilla|tweakers)\b",
    re.I,
)
GAMING_WORDS = re.compile(r"\b(gaming|gameplay|let'?s ?play|peli\w*|pelaa\w*|spel\w*|zock\w*|spiel\w*|stream\w*|twitch)\b", re.I)
FREE_MAIL = {
    "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "live.com", "gmx.de", "web.de", "hotmail.fi",
    "hotmail.se", "outlook.fi", "live.se", "protonmail.com", "proton.me", "t-online.de", "gmx.net",
}
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[a-z]{2,}(?:\.[a-z]{2,})?", re.I)
MENTION = re.compile(r"(?<![\w@])@([A-Za-z0-9][\w.-]{2,30})")
TIKTOK = re.compile(r"tiktok\.com/@([\w.]{2,30})|\btik ?tok\s*[:\-–|]\s*@?([\w.]{2,24})", re.I)
INSTAGRAM = re.compile(r"instagram\.com/([\w.]{2,30})", re.I)


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def load_games():
    """Game names and alias regexes straight from the app's catalog, so both sides agree."""
    src = (ROOT / "app/lib/data/games.ts").read_text()
    out = []
    for name, aliases in re.findall(r"name: '([^']+)', aliases: '([^']+)'", src):
        out.append((name, re.compile(r"\b(" + aliases.replace("\\\\", "\\") + r")\b", re.I)))
    return out


GAMES = load_games()
GAME_NAMES = [g for g, _ in GAMES]
# Games worth searching for first (bigger weight in the catalog = more creators).
SEARCH_GAMES = [
    "minecraft", "fortnite", "roblox", "gta", "cs2", "valorant", "league of legends", "call of duty", "apex legends",
    "ea fc", "rocket league", "brawl stars", "clash royale", "marvel rivals", "battlefield 6", "rust", "ark",
    "elden ring", "world of warcraft", "genshin impact", "pokemon", "the sims 4", "arc raiders", "overwatch 2",
    "dead by daylight", "r6 siege", "pubg", "tarkov", "lethal company", "schedule i", "euro truck simulator",
    "farming simulator", "mario kart", "clash of clans", "dota 2", "helldivers 2", "phasmophobia", "peak",
]

# Words that are not names: when an autocomplete suggestion adds a word outside this set, it is often a creator.
VOCAB = {w for text in GAME_NAMES + SEARCH_GAMES for w in text.lower().split()} | {
    w for m in MARKET_WORDS for text in MARKET_WORDS[m] + GENERIC_GAMING[m] for w in text.lower().split()
} | set(
    "shorts short gameplay lets let's play plays playing survival server smp pvp mod mods update tips tricks funny moments "
    "live stream new best game games gaming online multiplayer map maps skin skins build hardcore horror trailer season "
    "ranked tutorial guide challenge 2024 2025 2026 edition mobile pc ps5 xbox switch download free video videos "
    "kauhu parhaat uusi hauska opas peli pelit pelaa pelaaminen ja tai vs osa "
    "rolig bästa ny spela och eller del svenska "
    "lustig beste neu spielen und oder teil folge deutsch".split()
)


def detect_games(texts: list[str]) -> list[str]:
    counts = Counter()
    for t in texts:
        for name, rx in GAMES:
            if rx.search(t):
                counts[name] += 1
    top = [g for g, n in counts.most_common(2) if n >= 2] or [g for g, _ in counts.most_common(1)]
    if top:
        return top
    # No named game but clearly a gaming channel.
    return ["Variety gaming"] if sum(bool(GAMING_WORDS.search(t)) for t in texts) >= 3 else []


def lang_votes(texts: list[str]) -> Counter:
    """Counts which of fi/sv/de each text most likely is (texts too short or unclear don't vote)."""
    votes = Counter()
    for t in texts:
        t = re.sub(r"#\S+|@\S+|https?://\S+|[^\w\s]", " ", t or "").strip()
        if len(t) < 12:
            continue
        try:
            for guess in detect_langs(t):
                if guess.lang in LANG_MARKET and guess.prob > 0.5:
                    votes[guess.lang] += 1
                    break
        except Exception:
            pass
    return votes


# Words that only one of the three languages uses (avoids "on", "ja", "die" style overlaps with English).
MARKERS = {
    "fi": re.compile(r"\b(että|mutta|kun|minä|mitä|miten|kaikki|tosi|sitten|nyt|tää|mä|sä|kanssa|pelaa\w*|peli\w*|hauska|päivä\w*|suomi\w*|kaveri\w*|vitsi)\b", re.I),
    "sv": re.compile(r"\b(och|inte|jag|är|att|för|också|bara|när|spelar|kolla|vad|hur|svensk\w*|kompis\w*|roligt|idag)\b", re.I),
    "de": re.compile(r"\b(und|nicht|ich|ist|mit|auf|wie|bin|zocken|zocke|deutsch\w*|heute|mein\w*|spiele\w*|krass|digga|alter)\b", re.I),
    "da": re.compile(r"\b(og|ikke|jeg|hvad|hvordan|også|bare|når|spiller|dansk\w*|sjovt|venner|meget|nogen|det er)\b", re.I),
    "fr": re.compile(r"\b(et|je|est|pas|avec|pour|mais|joue|jouer|français|francais|trop|c'est|j'ai|mon|mes|dans|les|une)\b", re.I),
    "nl": re.compile(r"\b(het|een|niet|ik|je|wat|hoe|ook|maar|speel|spelen|nederlands\w*|heel|leuk|jongens|gewoon)\b", re.I),
    "pl": re.compile(r"\b(nie|jest|się|jak|co|ale|gram|gra|polsk\w*|bardzo|tylko|jestem|mój|czy)\b", re.I),
    "et": re.compile(r"\b(ja|ei|see|mina|mängin|mäng\w*|eesti|väga|kas|mis|kuidas|aga)\b", re.I),
    "lv": re.compile(r"\b(un|nav|es|kā|kas|bet|spēl\w*|latvi\w*|ļoti|tikai|mans)\b", re.I),
    "lt": re.compile(r"\b(ir|ne|aš|kaip|kas|bet|žaid\w*|lietuv\w*|labai|tik|mano)\b", re.I),
}
LETTERS = {"sv": re.compile("å", re.I), "de": re.compile("[ßü]", re.I), "da": re.compile("[æø]", re.I), "fr": re.compile("[çœ]|\\bà\\b", re.I), "pl": re.compile("[ąęłńśźż]", re.I), "et": re.compile("õ", re.I),
           "lv": re.compile("[āēīķļņģ]", re.I), "lt": re.compile("[ėįų]", re.I), "nl": re.compile("\\bij\\w|\\w+tje\\b", re.I)}


def best_market(texts: list[str], desc: str = "", hint: str | None = None) -> tuple[str | None, float]:
    """Picks FI/SE/DE from titles and the channel description.

    Evidence per text: its detected language, language-specific words, and telling letters. The description
    counts three times. Finnish and Swedish Gen-Z creators mix English into titles, so a market needs a clear
    lead rather than a majority."""
    score = Counter()
    informative = 0
    for i, t in enumerate(list(texts) + ([desc] if desc else [])):
        w = 3 if desc and i == len(texts) else 1
        hit = False
        for lang, n in lang_votes([t]).items():
            score[lang] += w * n
            hit = True
        for lang, rx in MARKERS.items():
            if rx.search(t or ""):
                score[lang] += w
                hit = True
        for lang, rx in LETTERS.items():
            if rx.search(t or ""):
                score[lang] += 0.5 * w
        informative += w if hit or len(re.sub(r"[^\w]", "", t or "")) >= 10 else 0
    if not score:
        return None, 0.0
    (lang, top), *rest = score.most_common(2) + [("", 0)]
    second = rest[0][1] if rest else 0
    share = top / max(1, informative)
    # A near tie with the query's market goes to that market.
    if hint and abs(score.get(MARKET_LANG.get(hint, ""), 0) - top) <= 1 and score.get(MARKET_LANG.get(hint, ""), 0) > 0:
        lang = MARKET_LANG[hint]
    ok = top >= 3 and share >= 0.2 and top >= 1.8 * max(second, 0.5)
    return (LANG_MARKET[lang] if ok else None), share


def contacts(texts: list[str], handle: str) -> dict:
    """Business email (agency if the domain isn't personal), TikTok/Instagram handles and @mentions."""
    blob = "\n".join(t for t in texts if t)
    emails = [e for e in EMAIL.findall(blob) if not e.lower().endswith((".png", ".jpg", ".gif"))]
    email = emails[0] if emails else None
    domain = email.split("@")[1].lower() if email else None
    agency = domain.split(".")[0].capitalize() if domain and domain not in FREE_MAIL and norm(domain.split(".")[0]) != norm(handle) else None
    tiktok = next((a or b for a, b in TIKTOK.findall(blob)), None)
    instagram = next((i for i in INSTAGRAM.findall(blob) if i.lower() not in {"p", "reel", "explore"}), None)
    mentions = {m.rstrip(".") for m in MENTION.findall(blob) if norm(m) != norm(handle) and "." not in m[-4:]}
    return {"email": email, "agency": agency, "tiktok": tiktok, "instagram": instagram, "mentions": sorted(mentions)}


LINK_PAGE = re.compile(r"https?://(?:www\.)?(linktr\.ee|beacons\.ai|lnk\.bio|linkin\.bio|solo\.to|campsite\.bio|bio\.link|msha\.ke)/[\w.\-/]+", re.I)


def link_pages(text: str) -> list[str]:
    """Link-in-bio pages in a description; they usually list the creator's TikTok."""
    return sorted({m.group(0).rstrip(".,)") for m in LINK_PAGE.finditer(text or "")})
