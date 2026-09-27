// Deterministic mock data shaped like the future crawler output, so the UI can be built first.
import { GAMES, gameByName } from './games'
import { normalize, RECOMMENDED, type Weights } from './score-presets'
import type {
  BrandSafety, CommentInsights, Concept, Creator, FitScores, Lang, Market, MarketDay, Platform, Post, Range, Sponsorship, Tier,
} from './types'

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20260926)
const between = (a: number, b: number) => a + rand() * (b - a)
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
const gauss = () => {
  const u = Math.max(rand(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const i = (s.length - 1) * q
  const lo = Math.floor(i)
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)
}

export const TODAY = new Date('2026-09-26T12:00:00Z')
const dayOffset = (d: number) => new Date(TODAY.getTime() - d * 86400000).toISOString().slice(0, 10)

/** Market-level assumptions behind every estimate. Reasoning for each value: docs/METHODOLOGY.md, section 4. */
const CONVERSION = {
  /** Share of engaged viewers (likes ÷ views) who use a creator's discount code: low, typical, high. */
  redemption: [0.02, 0.035, 0.05] as Range,
  /** A €700–1,500 purchase converts at roughly a quarter of the rate of everyday electronics. */
  highTicket: 0.28,
  /** Shorts and TikToks have no clickable link, so viewers must remember the code or search for the shop. */
  noLink: 0.5,
  /** Typical engagement rate of gaming Shorts, used for the market-level figures below. */
  typicalEr: 0.04,
  /** Above this, engagement is usually a few viral posts rather than a buying audience. */
  maxEr: 0.12,
}

export const ASSUMPTIONS = {
  /** Default gross profit per PC sold (refurbishers run ~20% gross margin); editable in the app. */
  profitPerPc: 200,
  /** Retail prices of PCs Prenew can offer instead of cash. Cost to Prenew = retail − profit per PC. */
  pcOffers: [
    { name: 'Entry gaming PC', retail: 700 },
    { name: 'Mid-range gaming PC', retail: 1000 },
    { name: 'High-end gaming PC', retail: 1500 },
  ],
  conversion: CONVERSION,
  /** Buyers per 10,000 views for a typically engaged gaming audience: low, typical, high. */
  buyersPer10k: CONVERSION.redemption.map(r => 10_000 * CONVERSION.typicalEr * r * CONVERSION.highTicket * CONVERSION.noLink) as Range,
  /** Euros per 1,000 expected views: sponsored entertainment/gaming short video. */
  cpm: { tiktok: 5.5, youtube: 5 } as Record<Platform, number>,
  /** Euros per 1,000 followers: creators also price by audience size. */
  perThousandFollowers: 20,
  /** Germany prices close to the US; the smaller Nordic markets are cheaper. */
  market: { DE: 1, NL: 1, FR: 0.95, BE: 0.95, AT: 0.95, SE: 0.9, DK: 0.9, FI: 0.85, PL: 0.7, EE: 0.65, LV: 0.6, LT: 0.6, US: 1.05 } as Record<Market, number>,
  /** Sponsored posts reach slightly fewer people than organic ones, most for the smallest creators. */
  sponsoredReach: { nano: 0.91, micro: 0.94, mid: 0.96, macro: 0.98 } as Record<Tier, number>,
  /** Agencies take their cut from the creator's fee but negotiate harder, so quotes come in a little higher. */
  agencyMarkup: 0.1,
  minFee: 75,
}

/** What a creator is likely to charge for one sponsored post: half priced by expected views, half by audience
 * size (how creators actually quote), adjusted for market and agency, never below a minimum fee. */
export function feeFor(o: { followers: number; views: number; platform: Platform; market: Market; agency: boolean }) {
  const byViews = (o.views / 1000) * ASSUMPTIONS.cpm[o.platform]
  const byFollowers = (o.followers / 1000) * ASSUMPTIONS.perThousandFollowers
  const fee = (0.5 * byViews + 0.5 * byFollowers) * ASSUMPTIONS.market[o.market] * (o.agency ? 1 + ASSUMPTIONS.agencyMarkup : 1)
  return Math.max(ASSUMPTIONS.minFee, fee)
}

/** Buyers per 10,000 views for this creator: engaged viewers × code use × high-ticket and no-link discounts. */
export function buyersPer10kFor(engagementRate: number, which: 0 | 1 | 2 = 1) {
  const er = Math.min(CONVERSION.maxEr, Math.max(0.005, engagementRate))
  return 10_000 * er * CONVERSION.redemption[which] * CONVERSION.highTicket * CONVERSION.noLink
}

// Email language per market. Baltic business mail is commonly in English; Belgium defaults to Dutch (Flanders).
const MARKET_LANG: Record<Market, Lang> = {
  FI: 'fi', SE: 'sv', DE: 'de', DK: 'da', FR: 'fr', NL: 'nl', BE: 'nl', AT: 'de', PL: 'pl', EE: 'en', LV: 'en', LT: 'en', US: 'en',
}

/** Markets with real crawled creators. */
export const LIVE_MARKETS = ['FI', 'SE', 'DE', 'DK', 'FR', 'NL', 'BE', 'AT', 'PL', 'EE', 'LV', 'LT'] as const
export type LiveMarket = (typeof LIVE_MARKETS)[number]

const NAMES: Record<'FI' | 'SE' | 'DE', { pre: string[]; suf: string[] }> = {
  FI: {
    pre: ['Peli', 'Kaamos', 'Revontuli', 'Sisu', 'Lumi', 'Tuisku', 'Kipinä', 'Nuotio', 'Karhu', 'Routa', 'Myrsky', 'Hanki', 'Pakkas', 'Kuura'],
    suf: ['GG', 'Pelaa', 'TV', '_fi', 'Gaming', 'Klipit', 'Poika', 'Tyttö'],
  },
  SE: {
    pre: ['Norr', 'Viking', 'Fika', 'Blixt', 'Älg', 'Snö', 'Stuga', 'Kaos', 'Lagom', 'Skog', 'Frost', 'Storm', 'Glöd', 'Vind'],
    suf: ['Gaming', '_se', 'Spelar', 'TV', 'Klipp', 'GG', 'Kungen', 'Lirar'],
  },
  DE: {
    pre: ['Zocker', 'Pixel', 'Blockbau', 'Nacht', 'Turbo', 'Kiste', 'Lenny', 'Schrauber', 'Keks', 'Donner', 'Funke', 'Knall', 'Wolke', 'Brezel'],
    suf: ['TV', 'Games', '_de', 'Plays', 'HD', 'Live', 'Zone', 'Bude'],
  },
}

const pickGame = () => {
  const total = GAMES.reduce((s, g) => s + g.weight, 0)
  let r = rand() * total
  for (const g of GAMES) if ((r -= g.weight) <= 0) return g.name
  return GAMES[0].name
}

/** Niche fit from what the game says about the audience: PC players are closer to buying a gaming PC. */
const PLATFORM_FIT = { pc: 88, mixed: 72, console: 48, mobile: 40 } as const
function nicheFitFor(games: string[]) {
  const scores = games.map(n => {
    const g = gameByName(n)
    return g ? PLATFORM_FIT[g.platform] + (g.proven ? 10 : 0) : 60
  })
  return Math.min(98, Math.max(...scores) + gauss() * 3)
}

const TITLE_TPL: Record<Lang, string[]> = {
  fi: ['{g} mutta joka kuolema = uusi haaste', 'Rakensin {g}-tukikohdan 24h', 'Tämä {g}-temppu on laiton?', '{g} päivitys on sekaisin', 'Voitin {g} turnauksen??', 'Kokeilin {g} ensimmäistä kertaa'],
  sv: ['{g} men varje död = ny utmaning', 'Jag byggde en {g}-bas på 24h', 'Detta {g}-trick borde vara olagligt', '{g} uppdateringen är helt galen', 'Vann jag {g}-turneringen??', 'Testade {g} för första gången'],
  de: ['{g} aber jeder Tod = neue Challenge', 'Ich baue eine {g} Basis in 24h', 'Dieser {g} Trick ist verboten?', 'Das {g} Update ist komplett kaputt', 'Hab ich das {g} Turnier gewonnen??', 'Ich teste {g} zum ersten Mal'],
  da: ['{g} men hver død = ny udfordring', 'Jeg byggede en {g}-base på 24 timer', 'Det her {g}-trick burde være ulovligt', '{g}-opdateringen er helt skør', 'Vandt jeg {g}-turneringen??', 'Jeg prøver {g} for første gang'],
  fr: ['{g} mais chaque mort = nouveau défi', "J'ai construit une base {g} en 24h", 'Cette astuce {g} devrait être interdite', 'La mise à jour {g} est cassée', "J'ai gagné le tournoi {g} ??", "Je teste {g} pour la première fois"],
  nl: ['{g} maar elke dood = nieuwe uitdaging', 'Ik bouwde een {g}-basis in 24 uur', 'Deze {g}-truc zou verboden moeten zijn', 'De {g}-update is helemaal kapot', 'Heb ik het {g}-toernooi gewonnen??', 'Ik probeer {g} voor het eerst'],
  pl: ['{g} ale każda śmierć = nowe wyzwanie', 'Zbudowałem bazę w {g} w 24h', 'Ten trik w {g} powinien być nielegalny', 'Aktualizacja {g} jest totalnie zepsuta', 'Wygrałem turniej {g}??', 'Pierwszy raz gram w {g}'],
  en: ['{g} but every death = new challenge', 'I built a {g} base in 24h', 'This {g} trick should be illegal', 'The {g} update is broken', 'Did I win the {g} tournament??', 'Trying {g} for the first time'],
}

const BIO: Record<Lang, string> = {
  fi: 'Päivittäistä pelisisältöä 🎮 Yhteistyöt DM / sähköposti',
  sv: 'Dagligt spelinnehåll 🎮 Samarbeten via mejl',
  de: 'Tägliche Gaming-Videos 🎮 Kooperationen per Mail',
  da: 'Daglige gaming-videoer 🎮 Samarbejde via mail',
  fr: 'Vidéos gaming tous les jours 🎮 Partenariats par mail',
  nl: 'Dagelijks gaming-video’s 🎮 Samenwerken via mail',
  pl: 'Codzienne filmy o grach 🎮 Współpraca przez maila',
  en: 'Daily gaming videos 🎮 Business via email',
}

const AGENCIES: Record<'FI' | 'SE' | 'DE', string[]> = {
  FI: ['Tubumedia', 'Nordic Creators', 'Pelikanava Oy'],
  SE: ['Streamline Talent', 'Creator Collective SE', 'Nordic Creators'],
  DE: ['Pixelwerk Talents', 'Kanalfabrik', 'Creator Haus Berlin'],
}

export function concept(lang: Lang, game: string, platform: Platform): Concept {
  const c: Record<Lang, Concept> = {
    fi: {
      hook: 'Ostin käytetyn pelikoneen. Toimiiko se oikeasti?',
      caption: `Testasin Prenewin kunnostetun pelikoneen ${game}-sessiolla 👀 #mainos @prenew`,
      title: `Testasin KÄYTETYN pelikoneen ${game}issa (yllättävä tulos)`,
      beats: ['Unboxing + ensivaikutelma', `FPS-testi: ${game} täysillä asetuksilla`, 'Hinta vs. uusi kone', 'Koodi kuvauksessa'],
    },
    sv: {
      hook: 'Jag köpte en begagnad gamingdator. Funkar den ens?',
      caption: `Testade en renoverad gamingdator från Prenew i ${game} 👀 #reklam @prenew`,
      title: `Jag testade en BEGAGNAD gamingdator i ${game} (oväntat)`,
      beats: ['Uppackning + första intryck', `FPS-test: ${game} på max`, 'Pris jämfört med ny', 'Rabattkod i beskrivningen'],
    },
    de: {
      hook: 'Ich hab einen gebrauchten Gaming-PC gekauft. Taugt der was?',
      caption: `Refurbished Gaming-PC von Prenew in ${game} getestet 👀 #werbung @prenew`,
      title: `Ich teste einen GEBRAUCHTEN Gaming-PC in ${game} (krass)`,
      beats: ['Unboxing + erster Eindruck', `FPS-Test: ${game} auf Ultra`, 'Preis vs. Neu-PC', 'Code in der Beschreibung'],
    },
    da: {
      hook: 'Jeg købte en brugt gaming-PC. Er den noget værd?',
      caption: `Testede en istandsat gaming-PC fra Prenew i ${game} 👀 #reklame @prenew`,
      title: `Jeg testede en BRUGT gaming-PC i ${game} (overraskende)`,
      beats: ['Unboxing + første indtryk', `FPS-test: ${game} på max`, 'Pris vs. ny', 'Rabatkode i beskrivelsen'],
    },
    fr: {
      hook: "J'ai acheté un PC gamer reconditionné. Il vaut quoi ?",
      caption: `J'ai testé un PC gamer reconditionné Prenew sur ${game} 👀 #pub @prenew`,
      title: `J'ai testé un PC gamer RECONDITIONNÉ sur ${game} (surprenant)`,
      beats: ['Unboxing + première impression', `Test FPS : ${game} au max`, 'Prix vs. neuf', 'Code promo en description'],
    },
    nl: {
      hook: 'Ik kocht een tweedehands gaming-pc. Is die wat waard?',
      caption: `Een refurbished gaming-pc van Prenew getest in ${game} 👀 #adv @prenew`,
      title: `Ik testte een GEBRUIKTE gaming-pc in ${game} (verrassend)`,
      beats: ['Unboxing + eerste indruk', `FPS-test: ${game} op max`, 'Prijs vs. nieuw', 'Kortingscode in de beschrijving'],
    },
    pl: {
      hook: 'Kupiłem używany komputer do gier. Czy jest coś wart?',
      caption: `Testuję odnowiony komputer gamingowy od Prenew w ${game} 👀 #reklama @prenew`,
      title: `Testuję UŻYWANY komputer do gier w ${game} (zaskoczenie)`,
      beats: ['Unboxing + pierwsze wrażenie', `Test FPS: ${game} na maksa`, 'Cena vs. nowy', 'Kod rabatowy w opisie'],
    },
    en: {
      hook: 'I bought a used gaming PC. Is it any good?',
      caption: `Tested a refurbished gaming PC from Prenew in ${game} 👀 #ad @prenew`,
      title: `I tested a USED gaming PC in ${game} (surprising)`,
      beats: ['Unboxing + first impression', `FPS test: ${game} maxed out`, 'Price vs. new', 'Code in description'],
    },
  }
  const out = c[lang]
  return platform === 'youtube' ? out : { ...out, beats: out.beats.slice(0, 3) }
}

/** Public base URL of Scout's /r/<slug> redirect; must be a public domain (e.g. go.prenew.com) for real links. */
const LINK_BASE = process.env.NEXT_PUBLIC_LINK_BASE ?? 'http://localhost:3000'
export const trackedLinkFor = (slug: string) => `${LINK_BASE}/r/${slug}`

const tierOf = (f: number): Tier => (f < 10_000 ? 'nano' : f < 100_000 ? 'micro' : f < 500_000 ? 'mid' : 'macro')
const scale = (r: Range, k: number): Range => [r[0] * k, r[1] * k, r[2] * k]

function makeCreator(i: number, market: 'FI' | 'SE' | 'DE', used: Set<string>): Creator & { flags: string[] } {
  const lang = MARKET_LANG[market]
  const platform: Platform = rand() < 0.62 ? 'tiktok' : 'youtube'
  let handle = ''
  while (!handle || used.has(handle)) handle = pick(NAMES[market].pre) + pick(NAMES[market].suf)
  used.add(handle)

  // Log-uniform followers, skewed small: most creators Prenew wants are micro.
  const followers = Math.round(Math.exp(between(Math.log(500), Math.log(rand() < 0.85 ? 150_000 : 900_000))))
  const main = pickGame()
  const games = [main, ...(rand() < 0.5 ? [pickGame()] : [])].filter((g, k, a) => a.indexOf(g) === k)

  // YouTube means Shorts only, so both platforms behave like short vertical video.
  const viewRatio = platform === 'tiktok' ? between(0.12, 1.4) : between(0.08, 1.0)
  const medianTarget = Math.max(400, followers * viewRatio)
  const er = platform === 'tiktok' ? between(0.03, 0.12) : between(0.025, 0.09)
  const postsPerWeek = platform === 'tiktok' ? between(1.5, 9) : between(1.2, 7)
  const sigma = between(0.35, 0.9)
  // Momentum: positive means recent posts outperform older ones.
  const trend = gauss() * 0.35 + (followers < 20_000 ? 0.1 : 0)

  const posts: Post[] = []
  let day = Math.floor(between(0, 3))
  for (let k = 0; k < 30; k++) {
    const viral = rand() < 0.05 ? between(3, 8) : 1
    const views = Math.round(medianTarget * Math.exp(gauss() * sigma + trend * (1 - k / 15)) * viral)
    const e = views * er * between(0.7, 1.3)
    posts.push({
      id: `${handle}-${k}`,
      date: dayOffset(day),
      title: pick(TITLE_TPL[lang]).replace('{g}', pick(games)),
      views,
      likes: Math.round(e * 0.86),
      comments: Math.round(e * 0.08),
      shares: Math.round(e * 0.06),
      video: `/samples/clip-${([...handle].reduce((a, ch) => a + ch.charCodeAt(0), 0) + k) % 6}.mp4`,
    })
    day += Math.max(1, Math.round(7 / postsPerWeek + gauss() * 1.2))
  }

  const vs = posts.map(p => p.views)
  const medianViews = quantile(vs, 0.5)
  const engagementRate = posts.reduce((s, p) => s + p.likes + p.comments + p.shares, 0) / vs.reduce((s, v) => s + v, 0)
  const agency = rand() < 0.4 ? pick(AGENCIES[market]) : null

  const nicheFit = nicheFitFor(games)
  const viewsTrend = quantile(vs.slice(0, 10), 0.5) / quantile(vs.slice(10), 0.5) - 1
  const views: Range = scale([quantile(vs, 0.2), medianViews, quantile(vs, 0.8)], ASSUMPTIONS.sponsoredReach[tierOf(followers)])
  const fee = feeFor({ followers, views: views[1], platform, market, agency: !!agency })
  const price: Range = [fee * 0.85, fee, fee * 1.2]

  const cv = Math.sqrt(vs.reduce((s, v) => s + (v - medianViews) ** 2, 0) / vs.length) / medianViews
  const growth7d = trend * 5 + gauss() * 0.8 + (followers < 20_000 ? 0.8 : 0.3)
  const growth30d = growth7d * between(2.5, 4) + gauss() * 2

  return {
    id: `${market.toLowerCase()}-${platform[0]}-${i}`,
    handle,
    name: handle.replace(/[_]/g, ' '),
    platform,
    market,
    lang,
    followers,
    tier: tierOf(followers),
    games,
    bio: BIO[lang],
    hue: Math.floor(between(0, 360)),
    agency,
    email: rand() < (agency ? 0.5 : 0.7) ? `${handle.toLowerCase().replace(/[^a-z0-9]/g, '')}@mail.example` : null,
    agencyEmail: agency ? `talent@${agency.toLowerCase().replace(/[^a-z]/g, '')}.example` : null,
    trackedLink: trackedLinkFor(handle.toLowerCase().replace(/[^a-z0-9]/g, '')),
    results: makeResults(fee, views[1], engagementRate),
    flags: rand() < 0.03 ? ['gambling'] : rand() < 0.02 ? ['adult'] : [],
    postsPerWeek,
    medianViews,
    engagementRate,
    growth7d,
    growth30d,
    viewsTrend,
    posts,
    fit: {
      niche: nicheFit,
      engagement: 0,
      consistency: Math.max(10, Math.min(98, 100 - cv * 60 + (postsPerWeek > 2 ? 8 : -10))),
      audience: between(55, 95),
      cost: 0,
      growth: 0,
    },
    score: 0,
    helped: [],
    hurt: [],
    prediction: {
      views,
      engagements: scale(views, engagementRate),
      price,
      cpm: fee / (views[1] / 1000),
    },
    negotiation: {
      opener: Math.round(fee * 0.8 / 10) * 10,
      ask: Math.round(fee * (agency ? 1.2 : 1.1) / 10) * 10,
      walkaway: Math.round(fee * 1.25 / 10) * 10,
    },
    concept: concept(lang, main, platform),
    hiddenGem: false,
  }
}

function percentileRank(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return (v: number) => (sorted.findIndex(x => x >= v) / Math.max(1, sorted.length - 1)) * 100
}

function makeResults(fee: number, views: number, er: number) {
  if (rand() > 0.12) return []
  return Array.from({ length: 1 + Math.floor(rand() * 3) }, (_, i) => {
    const v = Math.round(views * between(0.5, 1.6))
    const clicks = Math.round(v * between(0.004, 0.012) * (er / 0.06))
    const payment = rand() < 0.3 ? ('pc' as const) : ('cash' as const)
    return {
      date: dayOffset(20 + i * 45 + Math.floor(rand() * 20)),
      payment,
      cost: payment === 'pc' ? 800 : Math.round(fee / 10) * 10,
      views: v,
      clicks,
      pcsSold: Math.round(clicks * between(0.005, 0.03) * 10) / 10,
    }
  })
}

export function scoreOf(f: FitScores, w: Weights) {
  const n = normalize(w)
  return Math.round(
    n.growth * f.growth + n.niche * f.niche + n.audience * f.audience + n.engagement * f.engagement + n.cost * f.cost + n.consistency * f.consistency,
  )
}

/** Scores rank creators against their own market: raw weighted sum → percentile, so 80 means better than
 * ~80% of that market's creators. A plain weighted sum of percentiles bunches everyone around 50. */
export function rankScores(list: Creator[], w: Weights) {
  for (const m of LIVE_MARKETS) {
    const cs = list.filter(c => c.market === m)
    // Brand-safety risks and gambling sponsors are a requirement, not a trade-off: they drop well down the ranking.
    const raw = cs.map(c => scoreOf(c.fit, w) * (c.safety?.flags.length || c.sponsorship?.gambling ? 0.6 : 1))
    const rank = percentileRank(raw)
    cs.forEach((c, i) => {
      c.score = Math.max(1, Math.min(99, Math.round(rank(raw[i]))))
      c.hiddenGem = (c.tier === 'nano' || c.tier === 'micro') && c.fit.engagement >= 70 && c.score >= 68
    })
  }
}

/** Momentum from views alone: are recent Shorts beating older ones, and reaching past their follower count? */
function viewMomentum(c: Creator) {
  const recent = quantile(c.posts.slice(0, 6).map(p => p.views), 0.5)
  const reach = Math.log10(Math.max(1, recent) / Math.max(100, c.followers))
  return 0.5 * Math.log(Math.max(0.05, 1 + c.viewsTrend)) + 0.5 * reach
}

/** Niche fit from the game alone; finalize adds evidence on top, so it must start from this each time. */
const BASE_NICHE = new WeakMap<Creator, number>()
const BASE_CONSISTENCY = new WeakMap<Creator, number>()

/** Typical engagement (likes per view) by size: nano creators engage far more than big accounts. */
const TIER_ENGAGEMENT: Record<Tier, number> = { nano: 0.05, micro: 0.04, mid: 0.025, macro: 0.015 }
const relativeEngagement = (c: Creator) => c.engagementRate / TIER_ENGAGEMENT[c.tier]

/** Expected profit per euro of their fee, from the buyer model in lib/engine.ts (without the comment signal). */
function roiOf(c: Creator) {
  const pcs = (c.prediction.views[1] * buyersPer10kFor(c.engagementRate) * (c.fit.niche / 80)) / 10_000
  return (pcs * ASSUMPTIONS.profitPerPc) / Math.max(1, c.prediction.price[1])
}

function finalize(all: Creator[]) {
  for (const m of LIVE_MARKETS) {
    const cs = all.filter(c => c.market === m)
    // Engagement falls as accounts grow, so each creator is judged against their own size tier.
    const erRank = percentileRank(cs.map(relativeEngagement))
    // Value for money = expected profit per euro of their fee (price is set from views, so views per euro barely varies).
    const roiRank = percentileRank(cs.map(roiOf))
    const known = cs.map(c => c.comments?.local).filter((x): x is number => x != null)
    const audienceMid = known.length ? quantile(known, 0.5) : 60
    const g7 = percentileRank(cs.map(c => c.growth7d))
    const g30 = percentileRank(cs.map(c => c.growth30d))
    const mo = percentileRank(cs.map(viewMomentum))
    for (const c of cs) {
      c.helped = []
      c.hurt = []
      c.fit.engagement = Math.max(5, erRank(relativeEngagement(c)))
      c.fit.cost = Math.max(5, roiRank(roiOf(c)))
      // Share of the audience in the market; unmeasured creators sit at the market's median.
      c.fit.audience = c.comments?.local ?? audienceMid
      // Feeds heavy with sponsored posts lose their audience's trust.
      if (!BASE_CONSISTENCY.has(c)) BASE_CONSISTENCY.set(c, c.fit.consistency)
      const sponsoredShare = c.sponsorship && c.sponsorship.checked ? c.sponsorship.sponsored / c.sponsorship.checked : 0
      c.fit.consistency = Math.max(5, BASE_CONSISTENCY.get(c)! - Math.max(0, sponsoredShare - 0.3) * 100)
      // Follower growth counts once snapshots exist; until then momentum comes from views.
      c.fit.growth = Math.max(5, c.growthKnown === false ? mo(viewMomentum(c)) : 0.45 * g7(c.growth7d) + 0.15 * g30(c.growth30d) + 0.4 * mo(viewMomentum(c)))
      // Viewers asking about PCs, and past PC or hardware sponsors, are direct evidence of fit.
      const intent = c.comments?.intent != null && c.comments.intentN >= 2 ? Math.min(20, c.comments.intent * 4) : 0
      const affinity = c.sponsorship?.brands.some(b => b.category === 'pc' || b.category === 'hardware') ? 8 : 0
      if (!BASE_NICHE.has(c)) BASE_NICHE.set(c, c.fit.niche)
      c.fit.niche = Math.min(100, BASE_NICHE.get(c)! + intent + affinity)
      const f: FitScores = c.fit

      // Real signals from their posts and comments come first: they're the strongest evidence we have.
      const sp = c.sponsorship
      const named = (xs: string[]) => xs.slice(0, 2).join(' and ')
      const pcBrands = sp?.brands.filter(b => b.category === 'pc' && b.name !== 'Prenew').map(b => b.name) ?? []
      const paidBy = sp?.brands.filter(b => b.posts > 0).map(b => b.name) ?? []
      if (pcBrands.length) c.helped.push(`Already promotes PCs for ${named(pcBrands)}`)
      else if (sp && sp.sponsored > 0)
        c.helped.push(`Did ${sp.sponsored} sponsored Short${sp.sponsored > 1 ? 's' : ''} recently${paidBy.length ? ` (${named(paidBy)})` : ''}`)
      const ci = c.comments
      if (ci?.intent != null && ci.intentN >= 2 && ci.intent >= 1) c.helped.push(`${ci.intent}% of comments ask about PCs or specs`)
      const RISK: Record<string, string> = { gambling: 'gambling', adult: 'adult content', hate: 'hateful language', drugs: 'drugs', alcohol: 'drinking', violence: 'real violence', scam: 'scams' }
      const risks = c.safety?.flags.map(f => RISK[f.category] ?? f.category) ?? []
      const gambling = sp?.brands.filter(b => b.category === 'gambling').map(b => b.name) ?? []
      if (risks.length) c.hurt.push(`Brand safety: ${[...new Set(risks)].join(', ')}${gambling.length ? ` (${named(gambling)})` : ''}`)
      else if (gambling.length) c.hurt.push(`Promotes gambling (${named(gambling)})`)
      const erTop = Math.round(100 - f.engagement)
      if (f.engagement >= 70) c.helped.push(`Engagement ${(c.engagementRate * 100).toFixed(1)}%, top ${Math.max(1, erTop)}% for their size in ${m}`)
      const main = gameByName(c.games[0])
      if (main?.proven) c.helped.push(`Plays ${c.games[0]}, a game Prenew has done collabs in`)
      else if (main?.platform === 'pc') c.helped.push(`${c.games[0]} is played on PC, close to Prenew's buyers`)
      if (c.viewsTrend > 0.25) c.helped.push(`Views rising: recent posts +${Math.round(c.viewsTrend * 100)}%`)
      if (f.cost >= 70) c.helped.push('Good expected return for their fee')
      if (f.consistency >= 70) c.helped.push(`Steady views, posts ${c.postsPerWeek.toFixed(1)}×/week`)
      if (c.growthKnown !== false && c.growth7d > 2) c.helped.push(`Growing fast: +${c.growth7d.toFixed(1)}% followers this week`)
      if (c.audienceKnown !== false && f.audience >= 80) c.helped.push(`Audience mostly ${m === 'FI' ? 'Finnish' : m === 'SE' ? 'Swedish' : 'German'}-speaking`)
      if (c.audienceKnown && f.audience < 40) c.hurt.push(`Most comments aren't in ${m === 'FI' ? 'Finnish' : m === 'SE' ? 'Swedish' : 'German'}`)
      if (f.engagement < 35) c.hurt.push(`Low engagement for their size (${(c.engagementRate * 100).toFixed(1)}%)`)
      if (c.sponsorship && c.sponsorship.checked && c.sponsorship.sponsored / c.sponsorship.checked > 0.3)
        c.hurt.push(`${Math.round((100 * c.sponsorship.sponsored) / c.sponsorship.checked)}% of recent posts are ads`)
      if (main?.platform === 'mobile' || main?.platform === 'console')
        c.hurt.push(`${c.games[0]} is mostly played on ${main.platform}, further from PC buyers`)
      if (c.viewsTrend < -0.25) c.hurt.push(`Views falling: recent posts ${Math.round(c.viewsTrend * 100)}%`)
      if (f.consistency < 45) c.hurt.push('Views swing a lot between posts')
      if (c.postsPerWeek < 1) c.hurt.push('Posts less than once a week')
      if (c.agency) c.hurt.push(`Managed by ${c.agency}, expect a ~10% higher fee`)
      if (f.cost < 30) c.hurt.push('Low expected return for their fee')
      if (c.growthKnown !== false && c.growth7d < -1) c.hurt.push(`Losing followers (${c.growth7d.toFixed(1)}% this week)`)
      if (!c.email) c.hurt.push('No public contact email found')
      c.helped = c.helped.slice(0, 4)
      c.hurt = c.hurt.slice(0, 3)
    }
  }
  rankScores(all, RECOMMENDED)
}

// ---------- Real creators from the crawler ----------

interface CrawledPost { id: string; title: string; views: number; likes: number | null; comments: number | null; date: string | null; sponsored?: boolean }
export interface Crawled {
  channelId: string; handle: string; name: string; market: LiveMarket; platform: Platform; followers: number
  avatar: string | null; bio: string; email: string | null; agency: string | null; games: string[]; pastPartner: boolean; posts: CrawledPost[]
  /** From daily snapshots; null until a week (or month) of history exists. */
  growth7d?: number | null; growth30d?: number | null
  sponsorship?: Sponsorship
  /** From sampled comments; absent until read. */
  audience?: CommentInsights
  safety?: BrandSafety
  likesTotal?: number | null
  linked?: string | null
}

/** League, clip, highlight and community channels are not creators we can book. */
const NOT_A_CREATOR = /\b(series|league|liiga|clips?|klipit|highlights?|esports?|community|official|news|buildtheearth|tv network)\b/i

/** Builds a Creator from crawled public data with the same formulas as everything else. */
function fromCrawl(r: Crawled): Creator & { flags: string[] } {
  const lang = MARKET_LANG[r.market]
  const dated = r.posts.filter(p => p.date)
  // Older Shorts have views only: estimate their dates from the posting rhythm of the dated ones.
  const span = dated.length > 1 ? (Date.parse(dated[0].date!) - Date.parse(dated[dated.length - 1].date!)) / 86400000 : 7
  const gap = Math.max(1, span / Math.max(1, dated.length - 1))
  const withStats = dated.filter(p => p.likes !== null && p.views > 0)
  const er = withStats.length
    ? withStats.reduce((s, p) => s + (p.likes ?? 0) + (p.comments ?? 0), 0) / withStats.reduce((s, p) => s + p.views, 0)
    : 0.04
  const lastDate = dated.length ? Date.parse(dated[dated.length - 1].date!) : TODAY.getTime()
  const posts: Post[] = r.posts.map((p, k) => ({
    id: p.id,
    ...(r.platform === 'tiktok' ? { tiktokId: p.id } : { youtubeId: p.id }),
    title: p.title,
    views: p.views,
    likes: p.likes ?? Math.round(p.views * er * 0.95),
    comments: p.comments ?? Math.round(p.views * er * 0.05),
    shares: 0,
    date: p.date ?? new Date(lastDate - (k - dated.length + 1) * gap * 86400000).toISOString().slice(0, 10),
    sponsored: p.sponsored,
  }))
  const vs = posts.map(p => p.views)
  const medianViews = quantile(vs, 0.5)
  const postsPerWeek = Math.min(14, 7 / gap)
  const views: Range = scale([quantile(vs, 0.2), medianViews, quantile(vs, 0.8)], ASSUMPTIONS.sponsoredReach[tierOf(r.followers)])
  const fee = feeFor({ followers: r.followers, views: views[1], platform: r.platform, market: r.market, agency: !!r.agency })
  const cv = Math.sqrt(vs.reduce((s, v) => s + (v - medianViews) ** 2, 0) / vs.length) / Math.max(1, medianViews)
  const games = r.games.length ? r.games : ['Gaming news']
  const niche = Math.min(98, Math.max(...games.map(n => {
    const g = gameByName(n)
    return g ? PLATFORM_FIT[g.platform] + (g.proven ? 10 : 0) : 60
  })))
  const hue = [...r.handle].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360
  const slug = r.handle.toLowerCase().replace(/[^a-z0-9]/g, '')
  return {
    id: `${r.platform === 'tiktok' ? 'tt' : 'yt'}-${r.channelId}`,
    real: true,
    avatar: r.avatar ?? undefined,
    profileUrl: r.platform === 'tiktok' ? `https://www.tiktok.com/@${r.handle}` : `https://www.youtube.com/@${r.handle}/shorts`,
    likesTotal: r.likesTotal ?? undefined,
    linkedId: r.linked ?? undefined,
    pastPartner: r.pastPartner,
    growthKnown: r.growth7d != null,
    audienceKnown: r.audience?.local != null,
    sponsorship: r.sponsorship,
    comments: r.audience,
    safety: r.safety,
    handle: r.handle,
    name: r.name,
    platform: r.platform,
    market: r.market,
    lang,
    followers: r.followers,
    tier: tierOf(r.followers),
    games,
    bio: r.bio,
    hue,
    agency: r.agency,
    email: r.agency ? null : r.email,
    agencyEmail: r.agency ? r.email : null,
    trackedLink: trackedLinkFor(slug),
    results: [],
    flags: NOT_A_CREATOR.test(`${r.name} ${r.handle}`) ? ['not-a-creator'] : [],
    postsPerWeek,
    medianViews,
    engagementRate: er,
    growth7d: r.growth7d ?? 0,
    growth30d: r.growth30d ?? 0,
    // Newest six vs the ones before; too few older posts means no trend yet.
    viewsTrend: vs.length >= 9 ? quantile(vs.slice(0, 6), 0.5) / Math.max(1, quantile(vs.slice(6), 0.5)) - 1 : 0,
    posts,
    fit: { niche, engagement: 0, consistency: Math.max(10, Math.min(98, 100 - cv * 60 + (postsPerWeek > 2 ? 8 : -10))), audience: r.audience?.local ?? 60, cost: 0, growth: 0 },
    score: 0,
    helped: [],
    hurt: [],
    prediction: { views, engagements: scale(views, er), price: [fee * 0.85, fee, fee * 1.2], cpm: fee / (views[1] / 1000) },
    negotiation: {
      opener: Math.round(fee * 0.8 / 10) * 10,
      ask: Math.round(fee * (r.agency ? 1.2 : 1.1) / 10) * 10,
      walkaway: Math.round(fee * 1.25 / 10) * 10,
    },
    concept: concept(lang, games[0], 'youtube'),
    hiddenGem: false,
  }
}

/** About the real (crawled) data currently loaded. */
export const DATA = { crawledAt: null as string | null, real: 0, realOnly: false }
/** With at least this many real creators, lists show only real ones; generated ones stay for the sample conversations. */
const REAL_ONLY_MIN = 100

const used = new Set<string>()
const ALL: (Creator & { flags: string[] })[] = []
for (const [m, n] of [['FI', 70], ['SE', 76], ['DE', 98]] as const) {
  for (let i = 0; i < n; i++) ALL.push(makeCreator(i, m, used))
}
finalize(ALL)
/** Every generated creator, whether or not lists currently show them. */
export const GENERATED: readonly Creator[] = ALL.filter(c => !c.real)
const daysSinceLastPost = (c: Creator) => (TODAY.getTime() - Date.parse(c.posts[0]?.date ?? '2000-01-01')) / 86400000
const isExcluded = (c: Creator & { flags: string[] }) => c.growth30d < 0 || c.flags.length > 0 || daysSinceLastPost(c) > 60
/** Hidden from every list: shrinking over 30 days, adult/gambling content, not a creator, or no post in 60 days. */
export const EXCLUDED: Creator[] = []
/** What every list shows. Arrays are refilled in place when real data loads, so imports stay valid. */
export const CREATORS: Creator[] = []
function rebuildLists() {
  EXCLUDED.splice(0, EXCLUDED.length, ...ALL.filter(isExcluded))
  const visible = ALL.filter(c => !isExcluded(c) && (!DATA.realOnly || c.real))
  CREATORS.splice(0, CREATORS.length, ...visible.sort((a, b) => b.score - a.score))
}
rebuildLists()

/** Looks in everything, so sample conversations keep working when lists show only real creators. */
export const creatorById = (id: string): Creator | undefined => ALL.find(c => c.id === id)

/** Adds crawled creators (app/public/data/creators.json) and re-ranks everything. */
/** Bumped whenever crawl data is (re)loaded, so open pages can recompute. */
let dataVersion = 0
const dataListeners = new Set<() => void>()
export const DATA_VERSION = {
  get: () => dataVersion,
  subscribe: (l: () => void) => {
    dataListeners.add(l)
    return () => {
      dataListeners.delete(l)
    }
  },
}

/** Applies a crawl export: updates creators we have, adds new ones, drops ones the crawler removed. */
export function loadRealCreators(data: { crawledAt: string | null; creators: Crawled[] }) {
  const incoming = new Map(data.creators.map(r => [`${r.platform === 'tiktok' ? 'tt' : 'yt'}-${r.channelId}`, r]))
  for (let i = ALL.length - 1; i >= 0; i--) {
    const c = ALL[i]
    if (!c.real) continue
    const r = incoming.get(c.id)
    if (r) {
      ALL[i] = fromCrawl(r)
      incoming.delete(c.id)
    } else ALL.splice(i, 1)
  }
  for (const r of incoming.values()) ALL.push(fromCrawl(r))
  DATA.crawledAt = data.crawledAt
  DATA.real = ALL.filter(c => c.real).length
  DATA.realOnly = DATA.real >= REAL_ONLY_MIN
  finalize(ALL)
  rebuildLists()
  rebuildHistory()
  dataVersion++
  dataListeners.forEach(l => l())
}

/** Real counts from Prenew's collaboration sheet (69 bookings, 2026). */
export const PAST_COLLABS: Record<string, number> = {
  FI: 17, SE: 16, DE: 10, HU: 8, EE: 6, PL: 3, FR: 3, NL: 2, DK: 2, LV: 1, LT: 1,
}

export const MARKET_META: Record<Market, { name: string; flag: string; live: boolean }> = {
  FI: { name: 'Finland', flag: '🇫🇮', live: true },
  SE: { name: 'Sweden', flag: '🇸🇪', live: true },
  DE: { name: 'Germany', flag: '🇩🇪', live: true },
  DK: { name: 'Denmark', flag: '🇩🇰', live: true },
  FR: { name: 'France', flag: '🇫🇷', live: true },
  NL: { name: 'Netherlands', flag: '🇳🇱', live: true },
  BE: { name: 'Belgium', flag: '🇧🇪', live: true },
  AT: { name: 'Austria', flag: '🇦🇹', live: true },
  PL: { name: 'Poland', flag: '🇵🇱', live: true },
  EE: { name: 'Estonia', flag: '🇪🇪', live: true },
  LV: { name: 'Latvia', flag: '🇱🇻', live: true },
  LT: { name: 'Lithuania', flag: '🇱🇹', live: true },
  US: { name: 'United States', flag: '🇺🇸', live: false },
}

function buildHistory(m: LiveMarket): MarketDay[] {
  const cs = CREATORS.filter(c => c.market === m)
  const er = cs.reduce((s, c) => s + c.engagementRate, 0) / cs.length
  const cpms = cs.map(c => c.prediction.cpm)
  const cpm = quantile(cpms, 0.5)
  const ppd = cs.reduce((s, c) => s + c.postsPerWeek, 0) / 7
  const days: MarketDay[] = []
  // Placeholder history: starts small and reaches today's real count in uneven steps, like a real crawl
  // (quiet days, ordinary days, the odd big jump when a new search pays off).
  const rnd = mulberry32(m.charCodeAt(0) * 131 + m.charCodeAt(1))
  const steps = Array.from({ length: 29 }, (_, k) => {
    const r = rnd()
    const base = 0.5 + (k / 29) * 1.5
    return r < 0.2 ? 0 : r > 0.88 ? base * (3 + rnd() * 5) : base * (0.2 + rnd() * 1.1)
  })
  const start = Math.round(cs.length * 0.08)
  const stepSum = steps.reduce((a, b) => a + b, 0) || 1
  const cumulative = steps.reduce<number[]>((acc, st) => [...acc, acc[acc.length - 1] + (st / stepSum) * (cs.length - start)], [start])
  for (let d = 29; d >= 0; d--) {
    const t = (29 - d) / 29
    const wobble = Math.sin((d + m.charCodeAt(0)) / 3) * 0.04
    const creators = Math.round(cumulative[29 - d])
    const avgEngagement = er * (0.96 + 0.06 * t + wobble)
    const avgCpm = cpm * (1.06 - 0.08 * t - wobble / 2)
    days.push({
      date: dayOffset(d),
      creators,
      avgEngagement,
      avgCpm,
      postsPerDay: ppd * (0.6 + 0.4 * t) * (1 + wobble),
      opportunity: 0,
    })
  }
  return days
}

export const MARKET_HISTORY = Object.fromEntries(LIVE_MARKETS.map(m => [m, [] as MarketDay[]])) as Record<LiveMarket, MarketDay[]>
function rebuildHistory() {
  for (const m of LIVE_MARKETS) MARKET_HISTORY[m].splice(0, MARKET_HISTORY[m].length, ...buildHistory(m))
  // Opportunity: engagement per euro of CPM, indexed so the best market-day is 100.
  const all = Object.values(MARKET_HISTORY).flat()
  const raw = (d: MarketDay) => d.avgEngagement / d.avgCpm
  const max = Math.max(...all.map(raw))
  for (const d of all) d.opportunity = Math.round((raw(d) / max) * 100)
}
rebuildHistory()



/** Re-score every creator with the team's weights (Settings). Mutates in place so every view agrees. */
export function applyWeights(w: Weights) {
  rankScores(ALL, w)
}
