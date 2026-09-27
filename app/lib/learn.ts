import { creatorById } from '@/lib/data/mock';
import type { Creator, Market, OutreachEntry } from '@/lib/data/types';

/**
 * How the agent improves. Two sources:
 * - Prenew's past collaborations (the team spreadsheet): what a creator Prenew actually books looks like.
 * - The agent's own settled negotiations: where deals close, who says no and why.
 * Everything here is recomputed from data on every call, so it improves as outcomes come in.
 */

// ---------- Past collaborations ----------

/** One booking from Prenew's collaboration sheet, loaded at runtime from a local file kept out of the repo. */
export interface PastCollab {
   creator: string;
   market: Market | 'HU';
   week: string | null;
   agency: boolean;
   platforms: ('tiktok' | 'youtube' | 'twitch')[];
   niche: string | null;
   games: string[];
   ytSubs: number | null;
   ttFollowers: number | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const median = (xs: number[]) => {
   const s = [...xs].sort((a, b) => a - b);
   return s.length ? s[Math.floor(s.length / 2)] : 0;
};

function summarisePast(rows: PastCollab[]) {
   const byCreator = new Map<string, number>();
   for (const r of rows) byCreator.set(norm(r.creator), (byCreator.get(norm(r.creator)) ?? 0) + 1);
   const creators = byCreator.size;
   const rebooked = [...byCreator.values()].filter((n) => n > 1).length;
   const bookingsFromRebooked = [...byCreator.values()].filter((n) => n > 1).reduce((a, n) => a + n, 0);
   const withPlatform = rows.filter((r) => r.platforms.length);
   const tiktok = withPlatform.filter((r) => r.platforms.includes('tiktok')).length / Math.max(1, withPlatform.length);
   const games = new Map<string, number>();
   for (const r of rows) for (const g of r.games) games.set(g, (games.get(g) ?? 0) + 1);
   const sizes = rows.map((r) => Math.max(r.ytSubs ?? 0, r.ttFollowers ?? 0)).filter((n) => n > 0);
   return {
      bookings: rows.length,
      creators,
      rebooked,
      rebookShare: rows.length ? bookingsFromRebooked / rows.length : 0,
      tiktokShare: tiktok,
      agencyShare: rows.length ? rows.filter((r) => r.agency).length / rows.length : 0,
      topGames: [...games.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g),
      gameWeight: games,
      sizeLow: sizes.length ? Math.min(...sizes) : 0,
      sizeMedian: median(sizes),
      sizeHigh: median(sizes.filter((n) => n > median(sizes))) * 2,
      partners: new Set(byCreator.keys()),
   };
}

export let PAST = summarisePast([]);
export const setPastCollabs = (rows: PastCollab[]) => {
   PAST = summarisePast(rows);
};

/** 0-1: how much a creator looks like the creators Prenew has booked before. */
export function lookalike(c: Creator) {
   const known = PAST.partners.has(norm(c.handle)) || PAST.partners.has(norm(c.name)) || c.pastPartner;
   const platform = c.platform === 'tiktok' ? PAST.tiktokShare : 1 - PAST.tiktokShare;
   const gameHits = c.games.reduce((a, g) => a + (PAST.gameWeight.get(g) ?? 0), 0);
   const game = Math.min(1, gameHits / 6);
   const size = c.followers >= PAST.sizeLow && c.followers <= PAST.sizeHigh ? 1 : 0.4;
   return Math.min(1, (known ? 0.35 : 0) + 0.25 * platform + 0.25 * game + 0.15 * size);
}

// ---------- The agent's own negotiations ----------

export type Outcome = 'deal' | 'too-expensive' | 'not-interested' | 'open';

const limitOf = (o: OutreachEntry) => o.maxBudget ?? creatorById(o.creatorId)?.negotiation.walkaway ?? o.offer;

/** What happened in a conversation, read from the thread the way the team sees it. */
export function outcomeOf(o: OutreachEntry): Outcome {
   if (o.status === 'deal') return 'deal';
   if (o.status !== 'declined') return 'open';
   const asked = (o.thread ?? []).filter((t) => t.from === 'them' && t.amount).map((t) => t.amount!);
   return asked.some((a) => a > limitOf(o)) ? 'too-expensive' : 'not-interested';
}

const paidOf = (o: OutreachEntry) => [...(o.thread ?? [])].reverse().find((t) => t.amount)?.amount ?? o.offer;
const ourRounds = (o: OutreachEntry) => (o.thread ?? []).filter((t) => t.from === 'us').length;

type Segment = 'agency' | 'direct' | 'tiktok' | 'youtube';
const segmentsOf = (c: Creator): Segment[] => [c.agency ? 'agency' : 'direct', c.platform === 'tiktok' ? 'tiktok' : 'youtube'];

export interface Playbook {
   settled: number;
   deals: number;
   tooExpensive: number;
   notInterested: number;
   open: number;
   hitRate: number | null;
   /** Deal price as a share of the agent's limit, on average. */
   closeAt: number | null;
   saved: number;
   spent: number;
   roundsToDeal: number | null;
   /** Learned: open at this share of the limit. */
   openRatio: number;
   /** Learned: counter-offers before stating our maximum. */
   concedeRounds: number;
   /** Learned: many creators ask above the limit, so skip anyone whose usual price is above it. */
   strictPrice: boolean;
   /** Learned chance that a creator in each segment says yes (starts from a 20% prior). */
   yes: Record<Segment, number>;
   notes: string[];
}

const PRIOR_YES = 0.2;
const PRIOR_N = 5;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function learnPlaybook(outreach: OutreachEntry[]): Playbook {
   const rows = outreach.map((o) => ({ o, c: creatorById(o.creatorId), out: outcomeOf(o) }));
   const settled = rows.filter((r) => r.out !== 'open');
   const deals = settled.filter((r) => r.out === 'deal');
   const count = (k: Outcome) => rows.filter((r) => r.out === k).length;

   const ratios = deals.map((r) => paidOf(r.o) / Math.max(1, limitOf(r.o)));
   const closeAt = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
   const rounds = deals.map((r) => ourRounds(r.o));
   const roundsToDeal = rounds.length ? rounds.reduce((a, b) => a + b, 0) / rounds.length : null;

   // Open 15 points below where deals have been closing, so there is room to meet in the middle.
   const openRatio = closeAt == null || deals.length < 2 ? 0.8 : clamp(closeAt - 0.15, 0.6, 0.85);
   // If deals close after one exchange, stating our maximum sooner loses nothing and saves a round.
   const concedeRounds = roundsToDeal != null && deals.length >= 2 && roundsToDeal <= 2.5 ? 1 : 2;

   const yes = {} as Record<Segment, number>;
   for (const s of ['agency', 'direct', 'tiktok', 'youtube'] as Segment[]) {
      const inSeg = settled.filter((r) => r.c && segmentsOf(r.c).includes(s));
      const won = inSeg.filter((r) => r.out === 'deal').length;
      yes[s] = (won + PRIOR_YES * PRIOR_N) / (inSeg.length + PRIOR_N);
   }

   const notes: string[] = [];
   notes.push(
      `From ${PAST.bookings} past bookings of ${PAST.creators} creators: ${Math.round(PAST.rebookShare * 100)}% of bookings were repeat partners, so proven partners are offered again first.`
   );
   notes.push(
      `Past bookings are ${Math.round(PAST.tiktokShare * 100)}% TikTok, mostly ${PAST.topGames.slice(0, 3).join(', ')}; campaigns rank creators like these higher.`
   );
   if (deals.length >= 2 && closeAt != null)
      notes.push(`Deals close at ${Math.round(closeAt * 100)}% of the limit on average, so first offers now open at ${Math.round(openRatio * 100)}%.`);
   else notes.push('First offers open at 80% of the limit until two deals show where prices settle.');
   if (concedeRounds === 1) notes.push(`Deals take about ${roundsToDeal!.toFixed(1)} of our messages, so the agent states its maximum after one counter.`);
   const te = count('too-expensive');
   const strictPrice = settled.length >= 3 && te / settled.length >= 0.3;
   if (strictPrice) notes.push(`${te} of ${settled.length} asked for more than the limit, so campaigns now skip creators whose usual price is above it.`);
   const bestSeg = (Object.entries(yes) as [Segment, number][]).sort((a, b) => b[1] - a[1])[0];
   if (settled.length >= 5) notes.push(`Most likely to say yes so far: ${bestSeg[0]} creators (${Math.round(bestSeg[1] * 100)}%).`);

   return {
      settled: settled.length,
      deals: deals.length,
      tooExpensive: te,
      notInterested: count('not-interested'),
      open: count('open'),
      hitRate: settled.length ? deals.length / settled.length : null,
      closeAt,
      saved: deals.reduce((a, r) => a + Math.max(0, limitOf(r.o) - paidOf(r.o)), 0),
      spent: deals.reduce((a, r) => a + paidOf(r.o), 0),
      roundsToDeal,
      openRatio,
      concedeRounds,
      strictPrice,
      yes,
      notes,
   };
}

/** Order for picking campaign creators: Score, adjusted by who tends to say yes and who looks like past wins. */
export function campaignRank(c: Creator, p: Playbook) {
   const yes = segmentsOf(c).reduce((a, s) => a * (p.yes[s] / PRIOR_YES), 1);
   return c.score * Math.sqrt(yes) * (0.85 + 0.3 * lookalike(c));
}
