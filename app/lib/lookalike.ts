import type { Creator } from '@/lib/data/types';
import { MARKET_META } from '@/lib/data/mock';

/**
 * "More like X": creators who make the same kind of content for a similar audience.
 * Similarity blends what they play, what their titles talk about (TF-IDF over recent titles),
 * size, typical views, market and engagement. Everything is computed from data already loaded.
 */

const WORD = /[\p{L}\p{N}]{3,}/gu;
const NOISE = new Set(['shorts', 'short', 'gaming', 'gameplay', 'the', 'and', 'und', 'och', 'ja', 'with', 'mit', 'med', 'for', 'für', 'you', 'this', 'das', 'der', 'die']);

type Vec = Map<string, number>;
let idf: Map<string, number> | null = null;
let idfFor: Creator[] | null = null;
const vectors = new WeakMap<Creator, Vec>();

function tokens(c: Creator): string[] {
   return c.posts
      .slice(0, 15)
      .flatMap((p) => p.title.toLowerCase().match(WORD) ?? [])
      .filter((w) => !NOISE.has(w));
}

function ensureIdf(pool: Creator[]) {
   if (idf && idfFor === pool) return;
   const df = new Map<string, number>();
   for (const c of pool) for (const w of new Set(tokens(c))) df.set(w, (df.get(w) ?? 0) + 1);
   idf = new Map([...df].map(([w, n]) => [w, Math.log((1 + pool.length) / (1 + n))]));
   idfFor = pool;
}

function vector(c: Creator): Vec {
   const cached = vectors.get(c);
   if (cached) return cached;
   const tf = new Map<string, number>();
   for (const w of tokens(c)) tf.set(w, (tf.get(w) ?? 0) + 1);
   const v: Vec = new Map();
   let norm = 0;
   for (const [w, n] of tf) {
      const x = (1 + Math.log(n)) * (idf!.get(w) ?? 0);
      if (x > 0) {
         v.set(w, x);
         norm += x * x;
      }
   }
   norm = Math.sqrt(norm) || 1;
   for (const [w, x] of v) v.set(w, x / norm);
   vectors.set(c, v);
   return v;
}

function cosine(a: Vec, b: Vec) {
   let s = 0;
   const [small, big] = a.size < b.size ? [a, b] : [b, a];
   for (const [w, x] of small) s += x * (big.get(w) ?? 0);
   return s;
}

const closeness = (x: number, y: number, span: number) => Math.max(0, 1 - Math.abs(Math.log10(Math.max(1, x)) - Math.log10(Math.max(1, y))) / span);

export interface Lookalike {
   creator: Creator;
   /** 0-100 */
   similarity: number;
   because: string;
}

export function lookalikes(target: Creator, pool: Creator[], k = 6): Lookalike[] {
   ensureIdf(pool);
   const tv = vector(target);
   const tg = new Set(target.games);
   const out: Lookalike[] = [];
   for (const c of pool) {
      // The same person on the other platform isn't a lookalike.
      if (c.id === target.id || c.id === target.linkedId || c.linkedId === target.id) continue;
      const shared = c.games.filter((g) => tg.has(g) && g !== 'Variety gaming');
      const games = shared.length / Math.max(1, new Set([...c.games, ...target.games]).size);
      const titles = cosine(tv, vector(c));
      const size = closeness(c.followers, target.followers, 2);
      const views = closeness(c.medianViews, target.medianViews, 2);
      const market = c.market === target.market ? 1 : 0;
      const er = Math.max(0, 1 - Math.abs(c.engagementRate - target.engagementRate) / 0.08);
      const s = 0.3 * games + 0.3 * titles + 0.12 * size + 0.12 * views + 0.1 * market + 0.06 * er;
      const why = [
         shared.length ? `Also ${shared.slice(0, 2).join(' and ')}` : titles > 0.25 ? 'Similar video topics' : null,
         size > 0.75 ? 'similar size' : null,
         market ? MARKET_META[c.market].name : null,
      ].filter(Boolean);
      out.push({ creator: c, similarity: Math.round(100 * s), because: why.join(' · ') || 'Similar audience' });
   }
   return out.sort((a, b) => b.similarity - a.similarity).slice(0, k);
}
