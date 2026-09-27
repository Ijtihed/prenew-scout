"""Finds sponsored posts and who paid for them, from titles and descriptions (FI/SV/DE/EN).

A post counts as sponsored when it carries an ad disclosure (#ad, #mainos, "i samarbete med", "Werbung"...) or
promotes a brand with a code or a shop link. Brands come from a catalog (so competitors and gambling sites are
labelled) and, failing that, from the disclosure itself ("sponsored by X") or the promoted link's domain.
Game creator codes (Fortnite's Support-A-Creator etc.) are not brand deals and are ignored.
"""

import re
from collections import Counter, defaultdict
from urllib.parse import urlparse

DISCLOSURE = re.compile(
    r"(#ad\b|#ads\b|#sponsored|\bsponsored by\b|\bpaid (partnership|promotion)\b|\bin (paid )?partnership with\b|"
    r"\bthanks to \S+ for sponsoring\b|\bsponsor(ed)?\b.{0,20}\bvideo\b|"
    r"#mainos|\bmainos\b|kaupallinen yhteistyö|kaupallisessa yhteistyössä|\bsponsoroi(tu|nut|ma)\b|"
    r"#reklam|\breklam\b|#annons|\bannons\b|\bi samarbete med\b|\bsponsrad\b|\breklamsamarbete\b|"
    r"#werbung|\bwerbung\b|#anzeige|\banzeige\b|\bin kooperation mit\b|\bgesponsert\b|\bunterstützt (durch|von)\b|"
    r"#reklame|\breklame\b|\bannonce\b|\bsponsoreret\b|\bi samarbejde med\b|\bbetalt partnerskab\b|"
    r"#pub\b|\bpublicité\b|#partenariat|\bpartenariat\b|\bsponsoris[ée]\w*|\ben collaboration avec\b|\bcollaboration commerciale\b|"
    r"#adv\b|\badvertentie\b|\bgesponsord\b|\bin samenwerking met\b|\bbetaalde samenwerking\b|"
    r"#reklama|\bwspółpraca reklamowa\b|\bmateriał sponsorowany\b|\bsponsorowan\w*|"
    r"\breklaam\b|\bkoostöös\b|\breklāma\b|\bsadarbībā ar\b|\breklama\b|\bbendradarbiaujant su\b)",
    re.I,
)
CODE = re.compile(
    r"(\b(promo|discount|rabatt|alennus|gutschein|voucher)[- ]?(code|kod|koodi)\b|\balennuskoodi\w*|\brabattkod\w*|"
    r"\brabattcode\w*|\bgutscheincode\w*|\bkoodilla\b|\bmed koden\b|\bmit dem code\b|\buse (my )?code\b|"
    r"\brabatkode\w*|\bcode promo\b|\bavec le code\b|\bcode r[ée]duction\b|\bkortingscode\w*|\bkod rabatowy\b|"
    r"\bz kodem\b|\bsooduskood\w*|\batlaižu kods\b|\bnuolaidos kodas\b)",
    re.I,
)
AFFILIATE = re.compile(r"(\baffiliate\b|\bprovision\b|\bprovisio\w*|\bamzn\.to\b|\bamazon\.[a-z.]+/(dp|gp)\b|\*\s*=\s*affiliate)", re.I)
CREATOR_CODE = re.compile(r"(support[- ]a[- ]creator|#epicpartner|item ?shop|creator code|creator network|\bsac\b|tekijäkoodi|skaparkod|creator-code)", re.I)

# (name, category, pattern). Ambiguous everyday words (Power, Alternate, Inet...) only match as a domain.
# Category "pc": sells or builds PCs, i.e. Prenew's competitors.
BRANDS = [
    # PC sellers and builders
    ("Komplett", "pc", r"komplett\.(fi|se|no|dk)|komplett ?(pc|gaming)|@komplett"), ("Proshop", "pc", r"proshop"), ("Verkkokauppa.com", "pc", r"verkkokauppa"),
    ("Jimm's PC-Store", "pc", r"jimms|jimm'?s pc"), ("Gigantti", "pc", r"gigantti"), ("Elgiganten", "pc", r"elgiganten"),
    ("Power", "pc", r"power\.(fi|se|dk|no)"), ("Dustin", "pc", r"dustin(home)?\.(fi|se|dk|no)|dustinhome"),
    ("Inet", "pc", r"inet\.se"), ("Webhallen", "pc", r"webhallen"), ("NetOnNet", "pc", r"netonnet"),
    ("Caseking", "pc", r"caseking"), ("Alternate", "pc", r"alternate\.(de|at|nl|be)"), ("Mindfactory", "pc", r"mindfactory"),
    ("MediaMarkt", "pc", r"media ?markt"), ("Saturn", "pc", r"saturn\.de"), ("notebooksbilliger", "pc", r"notebooksbilliger|nbb\.com"),
    ("Dubaro", "pc", r"dubaro"), ("MEMORY PC", "pc", r"memory ?pc"), ("Agando", "pc", r"agando"), ("Cyberport", "pc", r"cyberport"),
    ("Multitronic", "pc", r"multitronic"), ("Datatronic", "pc", r"datatronic"), ("Hyperdrive", "pc", r"hyperdrive\.(fi|se)"),
    ("Back Market", "pc", r"back ?market"), ("refurbed", "pc", r"refurbed"), ("Alienware", "pc", r"alienware"),
    ("Lenovo Legion", "pc", r"lenovo|legion ?(go|pro|tower)"), ("HP Omen", "pc", r"\bomen\b|hp\.com"), ("Acer Predator", "pc", r"acer|predator helios"),
    ("MSI", "pc", r"\bmsi\b|msi\.com"), ("ASUS ROG", "pc", r"\basus\b|\brog\b|republic of gamers"), ("Captiva", "pc", r"captiva-power|captiva pc"),
    ("XMG", "pc", r"\bxmg\b"), ("Megaport", "pc", r"megaport"), ("Prenew", "pc", r"prenew"),
    ("Mifcom", "pc", r"mifcom"), ("rebuy", "pc", r"rebuy\.(de|at|com)|\brebuy\b"), ("asgoodasnew", "pc", r"asgoodasnew"),
    ("Kiebel", "pc", r"kiebel"), ("Galaxus", "pc", r"galaxus|digitec"), ("Kjell & Company", "pc", r"kjell ?(&|och|and)? ?company|kjell\.com"),
    ("Coolshop", "pc", r"coolshop"), ("CDON", "pc", r"\bcdon\b"), ("Elkjøp", "pc", r"elkj[øo]p"), ("Planet PC", "pc", r"planet ?pc\b"),
    ("ARLT", "pc", r"\barlt\b"), ("One.de", "pc", r"\bone\.de\b"), ("Hardware Rat", "pc", r"hardware ?rat"), ("King Mod", "pc", r"king ?mod"),
    ("Tietokonekauppa.fi", "pc", r"tietokonekauppa"), ("PCSpecialist", "pc", r"pc ?specialist"), ("Corsair Vengeance PC", "pc", r"corsair (one|vengeance) ?(pc|i\d)"),
    ("Swappie", "other", r"swappie"),
    ("Computersalg", "pc", r"computersalg"), ("LDLC", "pc", r"\bldlc\b"), ("Materiel.net", "pc", r"materiel\.net"),
    ("Cdiscount", "pc", r"cdiscount"), ("Fnac", "pc", r"\bfnac\b"), ("Darty", "pc", r"\bdarty\b"), ("Top Achat", "pc", r"top ?achat"),
    ("Grosbill", "pc", r"grosbill"), ("Boulanger", "pc", r"boulanger\.com"), ("Infomax", "pc", r"infomax"), ("Rue du Commerce", "pc", r"rue ?du ?commerce"),
    ("Scan", "pc", r"scan\.co\.uk"), ("Overclockers UK", "pc", r"overclockers ?(uk|\.co\.uk)"), ("CCL", "pc", r"cclonline|ccl computers"),
    ("Currys", "pc", r"currys"), ("Box.co.uk", "pc", r"box\.co\.uk"), ("Ebuyer", "pc", r"ebuyer"), ("Chillblast", "pc", r"chillblast"),
    ("x-kom", "pc", r"x-?kom"), ("Morele", "pc", r"morele"), ("Komputronik", "pc", r"komputronik"), ("Media Expert", "pc", r"media ?expert"),
    ("RTV Euro AGD", "pc", r"euro ?agd|euro\.com\.pl"), ("Coolblue", "pc", r"coolblue"), ("Megekko", "pc", r"megekko"), ("Azerty", "pc", r"azerty\.nl"),
    ("Bol.com", "pc", r"bol\.com"), ("e-tec", "pc", r"e-tec\.at"), ("DiTech", "pc", r"ditech"), ("Arvutitark", "pc", r"arvutitark"),
    ("1a", "pc", r"\b1a\.(ee|lv|lt)\b"), ("Varle", "pc", r"varle\.lt"), ("Pigu", "pc", r"pigu\.lt"), ("Topocentras", "pc", r"topocentras"),
    ("Klick", "pc", r"klick\.ee"), ("Dateks", "pc", r"dateks"),
    # Hardware and peripherals
    ("NZXT", "hardware", r"nzxt"), ("Corsair", "hardware", r"corsair"), ("Razer", "hardware", r"razer"), ("Logitech", "hardware", r"logitech|logi g"),
    ("SteelSeries", "hardware", r"steelseries"), ("HyperX", "hardware", r"hyperx"), ("Nvidia", "hardware", r"nvidia|geforce"),
    ("AMD", "hardware", r"\bamd\b|radeon"), ("Intel", "hardware", r"\bintel\b"), ("Elgato", "hardware", r"elgato"),
    ("Samsung", "hardware", r"samsung"), ("Glorious", "hardware", r"glorious ?(gaming|pc)"), ("Endgame Gear", "hardware", r"endgame ?gear"),
    ("Cherry", "hardware", r"cherry ?(xtrfy|mx)|xtrfy"), ("Turtle Beach", "hardware", r"turtle ?beach|roccat"), ("be quiet!", "hardware", r"be ?quiet"),
    ("Sharkoon", "hardware", r"sharkoon"), ("Secretlab", "hardware", r"secretlab"), ("noblechairs", "hardware", r"noblechairs"),
    ("DXRacer", "hardware", r"dxracer"), ("Fractal Design", "hardware", r"fractal ?design"), ("Lian Li", "hardware", r"lian ?li"),
    ("Cooler Master", "hardware", r"cooler ?master"), ("Kingston", "hardware", r"kingston"), ("Gigabyte", "hardware", r"gigabyte|aorus"),
    ("BenQ Zowie", "hardware", r"benq|zowie"), ("Wooting", "hardware", r"wooting"), ("Pulsar", "hardware", r"pulsar ?(gaming|x2)"),
    ("Astro", "hardware", r"astro ?a\d0"), ("Trust", "hardware", r"trust\.com"), ("Fnatic Gear", "hardware", r"fnatic ?gear"),
    # Gambling, betting and skin-case sites
    ("Stake", "gambling", r"\bstake\.(com|us)|\bstake\b.{0,15}\b(code|casino)"), ("Veikkaus", "gambling", r"veikkaus"),
    ("Svenska Spel", "gambling", r"svenska ?spel"), ("Unibet", "gambling", r"unibet"), ("Hellcase", "gambling", r"hellcase"),
    ("Key-Drop", "gambling", r"key-?drop"), ("CSGOEmpire", "gambling", r"csgo ?empire|csgoempire"), ("CSGORoll", "gambling", r"csgo ?roll"),
    ("Clash.gg", "gambling", r"clash\.gg"), ("Farmskins", "gambling", r"farmskins"), ("Datdrop", "gambling", r"datdrop"),
    ("Skinclub", "gambling", r"skin ?club"), ("CaseHug", "gambling", r"casehug"), ("Gamdom", "gambling", r"gamdom"),
    ("Rollbit", "gambling", r"rollbit"), ("Duelbits", "gambling", r"duelbits"), ("Bet365", "gambling", r"bet365"),
    ("Betsson", "gambling", r"betsson"), ("Tipico", "gambling", r"tipico"), ("CSGOLuck", "gambling", r"csgoluck"),
    ("Hypedrop", "gambling", r"hypedrop"), ("Rustclash", "gambling", r"rustclash"), ("Bandit.camp", "gambling", r"bandit\.camp"),
    # Game publishers and platforms (paid game promotions)
    ("Apple", "game", r"\bapple (games|arcade)\b|apps\.apple"), ("Techland", "game", r"techland"), ("EA", "game", r"\bea\b|electronic arts|ea sports"),
    ("Ubisoft", "game", r"ubisoft"), ("PlayStation", "game", r"playstation|\bps5\b"), ("Xbox", "game", r"\bxbox\b"),
    ("Nintendo", "game", r"nintendo"), ("Riot Games", "game", r"riot ?games"), ("Supercell", "game", r"supercell"),
    ("HoYoverse", "game", r"hoyoverse|mihoyo"), ("Blizzard", "game", r"blizzard"), ("Activision", "game", r"activision"),
    ("Bethesda", "game", r"bethesda"), ("Wizards of the Coast", "game", r"wizards_magic|wizards of the coast"),
    ("Level Infinite", "game", r"level ?infinite|tencent"), ("NetEase", "game", r"netease"), ("Krafton", "game", r"krafton"),
    ("Bandai Namco", "game", r"bandai ?namco"), ("Square Enix", "game", r"square ?enix"), ("Capcom", "game", r"capcom"),
    ("CD Projekt", "game", r"cd ?projekt"), ("Paradox", "game", r"paradox ?interactive"), ("2K", "game", r"\b2k ?games\b"),
    ("Hypergryph", "game", r"hypergryph|arknights"), ("Startselect", "other", r"startselect|strt\.sl"),
    ("Amazon", "other", r"amazon\.|amzn\.to"),
    # Other frequent gaming sponsors
    ("NordVPN", "other", r"nordvpn"), ("Surfshark", "other", r"surfshark"), ("ExpressVPN", "other", r"expressvpn"),
    ("Raid: Shadow Legends", "other", r"raid[: ]+shadow"), ("Hero Wars", "other", r"hero ?wars"), ("AFK Journey", "other", r"afk ?journey"),
    ("Holy", "other", r"holy ?(energy|\.com)|weareholy"), ("G Fuel", "other", r"g ?fuel"), ("NOCCO", "other", r"nocco"),
    ("Manscaped", "other", r"manscaped"), ("HelloFresh", "other", r"hello ?fresh"), ("Audible", "other", r"audible"),
    ("Skinport", "other", r"skinport"), ("G2A", "other", r"\bg2a\b"), ("Instant Gaming", "other", r"instant-?gaming"),
    ("Kinguin", "other", r"kinguin"), ("Eneba", "other", r"eneba"), ("Mobile Legends", "other", r"mobile legends"),
    ("Telia", "other", r"\btelia\b"), ("Elisa", "other", r"\belisa\b"), ("DNA", "other", r"\bdna\.fi\b"), ("Tele2", "other", r"tele2"),
    ("Telenor", "other", r"telenor"), ("Vodafone", "other", r"vodafone"), ("Lidl", "other", r"\blidl\b"),
]
BRAND_RX = [(n, cat, re.compile(r"(?<![\w-])(" + p + r")", re.I)) for n, cat, p in BRANDS]
CATEGORY = {n: cat for n, cat, _ in BRANDS}

URL = re.compile(r"https?://[^\s)\]]+|\b[\w-]+\.(?:com|fi|se|de|net|gg|io|shop|store|eu)(?:/[^\s)\]]*)?", re.I)
NOT_BRANDS = {
    "youtube", "youtu", "tiktok", "instagram", "twitch", "discord", "twitter", "x", "facebook", "linktr", "patreon",
    "streamlabs", "streamelements", "throne", "ko-fi", "paypal", "spotify", "snapchat", "kick", "google", "gmail",
    "hotmail", "outlook", "yahoo", "icloud", "gmx", "web", "bit", "tinyurl", "linkin", "beacons", "fourthwall",
    "spreadshirt", "teespring", "epicgames", "fortnite", "minecraft", "roblox", "steam", "steampowered", "mojang",
    "curseforge", "modrinth", "planetminecraft", "pinterest", "reddit", "whatsapp", "telegram", "threads",
    # Link shorteners and trackers say nothing about who paid.
    "bit", "t", "ins", "gsght", "geni", "lnk", "smarturl", "rebrand", "shorturl", "cutt", "go", "click", "tidd",
    "s", "l", "amzn", "ow", "buff", "dlvr", "shor", "rb", "clck", "link",
    # Affiliate networks and giveaway tools sit between brand and creator; they aren't the sponsor.
    "adtraction", "awin", "tradedoubler", "partnerize", "impact", "gleam", "rakuten", "cj", "admitad", "digistore24",
}
NEGATIVE = re.compile(
    r"(hier könnte (deine|ihre|eure) werbung stehen|keine werbung|unbezahlte werbung|unbeauftragte werbung|"
    r"not sponsored|ei sponsoroitu|ej sponsrad|ingen reklam|werbung wegen (marken|namens)nennung|mehr anzeigen)",
    re.I,
)
# Trigger words are case-insensitive; the captured name must look like a name (capitalised or @handle).
NAMED = re.compile(
    r"(?i:sponsored by|in (?:paid )?partnership with|in collaboration with|i samarbete med|in kooperation mit|"
    r"unterstützt (?:durch|von)|kaupallinen yhteistyö:?|mainos:?|(?:i )?reklam (?:med|för):?|reklamsamarbete med|"
    r"werbung (?:für|mit):?|anzeige:?|i samarbejde med|reklame for|en (?:partenariat|collaboration) avec|sponsoris[ée] par|in samenwerking met|współpraca z|sadarbībā ar|koostöös)\s+@?([A-ZÅÄÖÜ0-9][\w.&'-]{1,24}(?: [A-ZÅÄÖÜ][\w&-]{1,15})?)"
)
NAMED_FI = re.compile(r"(?i:kaupallisessa yhteistyössä|yhteistyössä)\s+@?([A-ZÅÄÖ][\w.&-]{1,24}?)(?::n|n)?\s+(?i:kanssa)")
# Words that follow an ad marker but aren't names (German capitalises every noun).
STOP = set("""the my our a an this you me us all everyone for und ja och mit med den die der das ich jag mä minä i in im
freunde freund leute neues neue neuen neuer video videos kanal link links code spiel spiele game games partner danke
heute jetzt hier diesem dieses dieser unserem unseren unser meinem meinen mein euch dich dir alle einen eine ein
teil folge vielen herzlichen großes grosses tämä tässä videossa video, denna videon hela
mainos reklam werbung anzeige ad ads sponsored sponsor annons""".split())


def _domain_brand(url: str) -> str | None:
    host = urlparse(url if "://" in url else f"http://{url}").netloc.lower().removeprefix("www.")
    root = host.split(".")[0] if host else ""
    if not root or root in NOT_BRANDS or len(root) < 3:
        return None
    return root


def brands_in(text: str) -> list[str]:
    """Catalog brands named in the text or its links."""
    found = []
    for name, _, rx in BRAND_RX:
        if rx.search(text):
            found.append(name)
    return found


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def analyze_post(title: str, description: str, own: tuple[str, ...] = ()) -> dict:
    """{'sponsored', 'brands', 'affiliate', 'disclosed'} for one post. `own`: the creator's names, so their own
    shop or merch isn't taken for a sponsor."""
    text = f"{title}\n{description or ''}"
    clean = NEGATIVE.sub(" ", CREATOR_CODE.sub(" ", text))
    disclosed = bool(DISCLOSURE.search(clean))
    coded = bool(CODE.search(clean))
    affiliate = bool(AFFILIATE.search(clean))
    brands = brands_in(clean)
    if disclosed:
        for rx in (NAMED, NAMED_FI):
            for m in rx.finditer(clean):
                name = m.group(1).strip(" .,:;!-'")
                if name.lower() not in STOP and name.split()[0].lower() not in STOP and not any(name.lower() in b.lower() or b.lower() in name.lower() for b in brands):
                    brands.append(name)
        if not brands:
            for u in URL.findall(clean):
                d = _domain_brand(u)
                if d:
                    brands.append(d.capitalize())
                    break
    brands = [b for b in brands if _norm(b) not in NOT_BRANDS]
    owned = [o for o in (_norm(x) for x in own) if len(o) >= 3]
    brands = [b for b in brands if not any(o in _norm(b) or _norm(b) in o for o in owned)]
    # A brand plus a discount code or its shop link also counts, even without the word "ad".
    sponsored = disclosed or (coded and bool(brands))
    return {"sponsored": sponsored, "brands": sorted(set(brands)) if sponsored else [], "affiliate": affiliate, "disclosed": disclosed}


def boilerplate(descriptions: list[str]) -> set[str]:
    """Lines repeated in most of a creator's descriptions (footers: socials, setup links, standing codes)."""
    descs = [d for d in descriptions if d]
    if len(descs) < 4:
        return set()
    counts = Counter(line for d in descs for line in {ln.strip() for ln in d.splitlines() if len(ln.strip()) > 8})
    return {line for line, n in counts.items() if n >= max(3, len(descs) // 2)}


def summarize(posts: list[dict], channel_desc: str = "", own: tuple[str, ...] = (), game_of=None) -> dict:
    """Creator-level view. posts: [{title, description, date, views}] (only posts whose description is known).

    Per-post sponsorships are judged on the post's own text, with the creator's repeated footer removed; brands
    promoted in that footer or the channel description count as standing partners instead. `game_of(title)`
    names the game when a sponsored post doesn't name a brand (paid game promotions)."""
    footer = boilerplate([p.get("description") or "" for p in posts])
    per_brand = defaultdict(lambda: {"posts": 0, "last": None})
    sponsored = []
    for p in posts:
        body = "\n".join(ln for ln in (p.get("description") or "").splitlines() if ln.strip() not in footer)
        a = analyze_post(p.get("title") or "", body, own)
        if not a["sponsored"]:
            continue
        sponsored.append(p)
        names = a["brands"] or ([game_of(p.get("title") or "")] if game_of and game_of(p.get("title") or "") else [])
        for b in names:
            e = per_brand[b]
            e["posts"] += 1
            if p.get("date") and (e["last"] is None or p["date"] > e["last"]):
                e["last"] = p["date"]
    standing_text = "\n".join(sorted(footer)) + "\n" + channel_desc
    standing = analyze_post("", standing_text, own)
    channel = standing["brands"] if standing["sponsored"] or re.search(r"\bpartner", standing_text, re.I) else []
    channel = [b for b in channel if b in CATEGORY]
    for b in channel:
        per_brand[b]
    brands = [
        {"name": n, "category": CATEGORY.get(n, "game" if game_of and game_of(n) else "other"), "posts": v["posts"],
         "last": v["last"], "channel": n in channel}
        for n, v in sorted(per_brand.items(), key=lambda kv: (-kv[1]["posts"], kv[0]))
    ]
    views = sorted(p.get("views") or 0 for p in posts)
    sp_views = sorted(p.get("views") or 0 for p in sponsored)
    med = lambda xs: xs[len(xs) // 2] if xs else None  # noqa: E731
    return {
        "checked": len(posts),
        "sponsored": len(sponsored),
        "last": max((p["date"] for p in sponsored if p.get("date")), default=None),
        "brands": brands,
        "gambling": any(b["category"] == "gambling" for b in brands),
        "competitor": any(b["category"] == "pc" and b["name"] != "Prenew" for b in brands),
        "postIds": [p["id"] for p in sponsored if p.get("id")],
        "sponsoredMedianViews": med(sp_views),
        "medianViews": med(views),
    }
