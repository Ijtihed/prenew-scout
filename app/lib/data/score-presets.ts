/** How much each part counts in the Score. Values are shares that sum to 1. */
export interface Weights {
   growth: number;
   niche: number;
   audience: number;
   engagement: number;
   cost: number;
   consistency: number;
}

export const WEIGHT_LABELS: Record<keyof Weights, { label: string; help: string }> = {
   growth: { label: 'Growth', help: 'Follower growth once measured; until then, recent Shorts vs older ones and vs follower count.' },
   niche: { label: 'Fits Prenew', help: 'PC games, games Prenew did collabs in, viewers asking about PCs, past PC or hardware sponsors.' },
   audience: { label: 'Audience in the country', help: 'Share of comments in the market’s language.' },
   engagement: { label: 'Audience reacts', help: 'Likes per view, compared with creators of the same size.' },
   cost: { label: 'Return per euro', help: 'Expected PCs sold × profit, divided by their likely fee.' },
   consistency: { label: 'Posts reliably', help: 'Steady views, regular posting, and not a feed full of ads.' },
};

export interface Preset {
   id: string;
   name: string;
   why: string;
   weights: Weights;
}

/**
 * Match between brand and creator (their games, their audience's country) predicts campaign results more than
 * anything else, so fit and audience carry the most weight. Engagement quality beats follower count, judged
 * against creators of the same size. Return on spend is how success is measured. Growth matters for booking
 * early but ranks below those. Brand safety is a requirement rather than a weight: risky creators are pushed
 * down the ranking and left out of agent campaigns. Reasoning: docs/METHODOLOGY.md, section 3.
 */
export const PRESETS: Preset[] = [
   {
      id: 'recommended',
      name: 'Recommended',
      why: 'Balanced for Prenew: the right audience that reacts, a good return per euro, and momentum.',
      weights: { growth: 0.12, niche: 0.25, audience: 0.2, engagement: 0.2, cost: 0.15, consistency: 0.08 },
   },
   {
      id: 'new-market',
      name: 'Enter a new market',
      why: 'Brand awareness: reach real local viewers. Audience in the country counts most.',
      weights: { growth: 0.12, niche: 0.18, audience: 0.35, engagement: 0.15, cost: 0.12, consistency: 0.08 },
   },
   {
      id: 'sales',
      name: 'Sell PCs',
      why: 'Conversions: PC players who trust the creator, at a good return per euro.',
      weights: { growth: 0.05, niche: 0.3, audience: 0.15, engagement: 0.2, cost: 0.25, consistency: 0.05 },
   },
   {
      id: 'rising',
      name: 'Catch rising stars',
      why: 'Book creators early, before their price goes up. Growth counts most.',
      weights: { growth: 0.4, niche: 0.2, audience: 0.12, engagement: 0.15, cost: 0.1, consistency: 0.03 },
   },
];

export const RECOMMENDED = PRESETS[0].weights;

export const SCORE_SOURCES = [
   { label: 'Influencer Marketing Hub: Benchmark Report 2026 (IAB 2025 survey data)', url: 'https://influencermarketinghub.com/influencer-marketing-benchmark-report/' },
   { label: 'The Cirqle: The science of influencer selection', url: 'https://thecirqle.com/blog-post/the-science-of-influencer-selection-how-to-pick-the-right-creators-for-maximum-impact' },
   { label: 'Statista: Key criteria for selecting TikTok influencers 2025', url: 'https://statista.com/statistics/1608685/key-criteria-influencers-tiktok-worldwide' },
];

export function normalize(w: Weights): Weights {
   const total = Object.values(w).reduce((s, v) => s + v, 0) || 1;
   return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / total])) as unknown as Weights;
}
