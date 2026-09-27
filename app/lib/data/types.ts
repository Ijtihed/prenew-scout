export type Market = 'FI' | 'SE' | 'DE' | 'DK' | 'FR' | 'NL' | 'BE' | 'AT' | 'PL' | 'EE' | 'LV' | 'LT' | 'US'
export type Platform = 'tiktok' | 'youtube'
export type Tier = 'nano' | 'micro' | 'mid' | 'macro'
export type Lang = 'fi' | 'sv' | 'de' | 'da' | 'fr' | 'nl' | 'pl' | 'en'

/** [low, mid, high] of an ~80% interval. */
export type Range = [number, number, number]

export interface Post {
  id: string
  date: string
  title: string
  views: number
  likes: number
  comments: number
  shares: number
  /** Playable video file (sample clips for generated creators). */
  video?: string
  /** Real YouTube Shorts id: the preview embeds the actual video. */
  youtubeId?: string
  /** Real TikTok video id: the preview uses TikTok's own embed player. */
  tiktokId?: string
  /** Carries an ad disclosure or promotes a brand with a code or shop link. */
  sponsored?: boolean
}

export interface FitScores {
  niche: number
  engagement: number
  consistency: number
  audience: number
  cost: number
  growth: number
}

export interface Prediction {
  /** Views on one sponsored post. */
  views: Range
  engagements: Range
  /** What the creator will likely charge for one post, in EUR. */
  price: Range
  /** Price per 1,000 predicted views, at the median. */
  cpm: number
}

export interface Negotiation {
  opener: number
  ask: number
  walkaway: number
}

export interface Concept {
  hook: string
  caption: string
  title: string
  beats: string[]
}

/** pc = sells or builds PCs, i.e. a Prenew competitor. */
export type BrandCategory = 'pc' | 'hardware' | 'game' | 'gambling' | 'other'

export interface SponsorBrand {
  name: string
  category: BrandCategory
  /** Recent Shorts promoting it; 0 when it's a standing partner named in their footer or channel description. */
  posts: number
  last: string | null
  channel: boolean
}

/** Read from the descriptions of their latest Shorts. */
export interface Sponsorship {
  checked: number
  sponsored: number
  last: string | null
  brands: SponsorBrand[]
  gambling: boolean
  competitor: boolean
  sponsoredMedianViews: number | null
  medianViews: number | null
}

/** Read from a sample of comments on two recent Shorts. */
export interface CommentInsights {
  n: number
  langN: number
  /** % of comments in the market's language; null with too few readable comments. */
  local: number | null
  /** % of comments asking about PCs or saying theirs can't keep up; null with too few comments. */
  intent: number | null
  intentN: number
  examples: string[]
  /** The local model read the hardware comments (otherwise keyword matching). */
  judged?: boolean
}

export type RiskCategory = 'gambling' | 'adult' | 'hate' | 'drugs' | 'alcohol' | 'violence' | 'scam'

/** Risks found in their recent titles and descriptions, each with the words that triggered it. */
export interface BrandSafety {
  flags: { category: RiskCategory; evidence: string }[]
}

export interface Creator {
  id: string
  /** From the crawler rather than generated. */
  real?: boolean
  avatar?: string
  profileUrl?: string
  /** Appears in Prenew's collab sheet; never recommended, used as a known success. */
  pastPartner?: boolean
  /** False until daily snapshots exist to measure follower growth. */
  growthKnown?: boolean
  /** False until comment languages have been measured; fit.audience is then a neutral placeholder. */
  audienceKnown?: boolean
  sponsorship?: Sponsorship
  comments?: CommentInsights
  safety?: BrandSafety
  /** Lifetime likes on the profile (TikTok shows this; YouTube doesn't). */
  likesTotal?: number
  /** The same person's account on the other platform. */
  linkedId?: string
  handle: string
  name: string
  platform: Platform
  market: Market
  lang: Lang
  followers: number
  tier: Tier
  games: string[]
  bio: string
  hue: number
  agency: string | null
  /** The creator's own public email. */
  email: string | null
  agencyEmail: string | null
  /** Unique tracked link for sales attribution. */
  trackedLink: string
  /** Past sponsored posts measured through the tracked link. */
  results: CollabResult[]
  postsPerWeek: number
  medianViews: number
  engagementRate: number
  /** Follower change, percent. */
  growth7d: number
  growth30d: number
  /** Median views of the last 10 posts vs the 20 before, as a fraction. */
  viewsTrend: number
  posts: Post[]
  fit: FitScores
  score: number
  helped: string[]
  hurt: string[]
  prediction: Prediction
  negotiation: Negotiation
  concept: Concept
  hiddenGem: boolean
}

export interface CollabResult {
  date: string
  payment: 'cash' | 'pc'
  /** Cash paid, or what the PC cost Prenew. */
  cost: number
  views: number
  clicks: number
  pcsSold: number
}

export interface MarketDay {
  date: string
  creators: number
  avgEngagement: number
  avgCpm: number
  postsPerDay: number
  opportunity: number
}

export type OutreachStatus = 'drafted' | 'sent' | 'replied' | 'deal' | 'declined'

export interface ThreadItem {
  id: string
  at: string
  /** 'us' = our message, 'them' = their reply pasted in, 'note' = internal note. */
  from: 'us' | 'them' | 'note'
  text: string
  /** A price mentioned in this message, e.g. their counter-offer. */
  amount?: number
  /** Written and sent by the negotiation agent. */
  by?: 'agent'
  /** A reply played by the demo creator, not a real person. */
  simulated?: boolean
}

export interface OutreachEntry {
  creatorId: string
  /** The agent answers their replies and negotiates up to `maxBudget`. */
  agent?: boolean
  /** The most Prenew will pay for this deal (cash, or the PC's retail value). */
  maxBudget?: number
  status: OutreachStatus
  offer: number
  deliverables: string[]
  lang: Lang
  message: string
  updatedAt: string
  thread: ThreadItem[]
  /** Planned or actual day the sponsored post goes live. */
  postDate?: string
  payment?: 'cash' | 'pc'
  /** What started the conversation (e.g. 'agent'), if not a person. */
  source?: string
  /** The simulated creator's part when the agent negotiates: settles, turns it down, or asks too much. */
  sim?: 'deal' | 'pass' | 'high'
  /** When the conversation was last opened; a reply after this is unread. */
  readAt?: string
}
