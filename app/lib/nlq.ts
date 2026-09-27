import type { Market, Platform, Tier } from '@/lib/data/types';
import { GAMES, GENRE_WORDS } from '@/lib/data/games';
import { DEFAULT_FILTERS, type Filters, type Sort } from '@/components/creators/filters';
import { CREATORS } from '@/lib/data/mock';

/**
 * Turns a plain-English (or Finnish/Swedish/German) query into filters, e.g.
 * "micro minecraft tiktokers in finland under 300 euros, no agency".
 * Words it can't place are returned in `leftover` so the caller can ask the local LLM.
 */

const MARKETS: [RegExp, Market[]][] = [
   [/\b(nordics?|nordic countries|pohjoismaat|norden)\b/, ['FI', 'SE', 'DK']],
   [/\b(denmark|danish|danmark|dansk\w*|dk)\b/, ['DK']],
   [/\b(france|french|français|francais|française|fr)\b/, ['FR']],
   [/\b(netherlands|dutch|holland|nederland\w*|nl)\b/, ['NL']],
   [/\b(belgium|belgian|belgië|belgie|belgique|belge|flemish|vlaams)\b/, ['BE']],
   [/\b(benelux)\b/, ['NL', 'BE']],
   [/\b(austria|austrian|österreich\w*|osterreich)\b/, ['AT']],
   [/\b(dach)\b/, ['DE', 'AT']],
   [/\b(poland|polish|polska|polsk\w*|pl)\b/, ['PL']],
   [/\b(baltics?|baltic states)\b/, ['EE', 'LV', 'LT']],
   [/\b(estonia|estonian|eesti)\b/, ['EE']],
   [/\b(latvia|latvian|latvija|latvisk\w*)\b/, ['LV']],
   [/\b(lithuania|lithuanian|lietuva)\b/, ['LT']],
   [/\b(finland|finnish|suomi|suomalai\w*|fi)\b/, ['FI']],
   [/\b(sweden|swedish|sverige|svensk\w*|se)\b/, ['SE']],
   [/\b(germany|german|deutschland|deutsch\w*|de)\b/, ['DE']],
];
const PLATFORMS: [RegExp, Platform][] = [
   [/\b(tik ?tok\w*|tt)\b/, 'tiktok'],
   [/\b(youtube\w*|yt|shorts|youtubers?)\b/, 'youtube'],
];
const TIERS: [RegExp, Tier[]][] = [
   [/\b(small|smaller|tiny|little)\b/, ['nano', 'micro']],
   [/\bnano\b/, ['nano']],
   [/\bmicro\b/, ['micro']],
   [/\b(mid|mid-size|mid-sized|medium)\b/, ['mid']],
   [/\b(macro|big|large|huge)\b/, ['macro']],
];
// Longest aliases first so "counter strike 2" wins over "cs".
const GAME_RES: [RegExp, string][] = GAMES.map((g) => [new RegExp(`\\b(${g.aliases})\\b`), g.name] as [RegExp, string]).sort(
   (x, y) => y[0].source.length - x[0].source.length
);
const GENRE_RES: [RegExp, string][] = GENRE_WORDS.map(([w, genre]) => [new RegExp(`\\b(${w})\\b`), genre]);
const SORTS: [RegExp, Sort][] = [
   [/\b(rising|growing|trending|blowing up|up and coming|up-and-coming|fastest growing|momentum|hot right now|on the rise)\b/, 'growth'],
   [/\b(cheapest|cheap|affordable|low[- ]cost|budget)\b/, 'price'],
   [/\b(most views|biggest reach|most reach|reach|viral)\b/, 'views'],
   [/\b(value for money|bang for (?:the |your )?buck|best value)\b/, 'cpm'],
   [/\b(most engaged|engaged|engagement|loyal)\b/, 'er'],
];
const STOP = new Set(
   'a an the and or in on at of for from with who that which is are me show find get give list all any some creators creator influencers influencer streamers streamer gamers gamer people channels channel accounts account videos video content make makes making play plays playing players about like good great best top euros euro eur € price cost costs views followers under below less than max maximum over above more least min minimum budget please ones one only games game gaming'.split(
      ' '
   )
);

export interface Parsed {
   filters: Filters;
   leftover: string[];
}

export function parseQuery(input: string): Parsed {
   let t = ` ${input.toLowerCase().replace(/[,.!?;]/g, ' ')} `;
   const f: Filters = { ...DEFAULT_FILTERS, markets: [], platforms: [], tiers: [], games: [], genres: [] };
   const eat = (re: RegExp) => {
      const m = re.test(t);
      if (m) t = t.replace(new RegExp(re.source, 'g'), ' ');
      return m;
   };

   // "Reach out" is an action, not "sort by reach".
   t = t.replace(/\breach(?:ing)? out( to)?\b/g, ' ');
   // "break-even (score) under 1": how many PCs they must sell to pay back, not a price.
   const be = t.match(/break[- ]?even(?:\s*(?:score|point))?\D{0,20}?(\d+(?:[.,]\d+)?)\s*(?:pcs?|computers?)?/);
   if (be) {
      f.maxBreakEven = parseFloat(be[1].replace(',', '.'));
      t = t.replace(be[0], ' ');
   }
   // "less than 10k subscribers", "over 50k followers": audience size, not a price.
   const size = (n: string, k?: string) => Math.round(parseFloat(n.replace(',', '.')) * (k === 'm' ? 1e6 : k === 'k' ? 1e3 : 1));
   const FOLLOWERS = String.raw`\s*(\d+(?:[.,]\d+)?)\s*(k|m)?\s*(?:subs|subscribers?|followers?|fans)\b`;
   const fewer = t.match(new RegExp(String.raw`(?:under|below|less than|fewer than|at most|max(?:imum)?|up to|<)` + FOLLOWERS));
   if (fewer) {
      f.maxFollowers = size(fewer[1], fewer[2]);
      t = t.replace(fewer[0], ' ');
   }
   const more = t.match(new RegExp(String.raw`(?:over|above|more than|at least|min(?:imum)?|>)` + FOLLOWERS));
   if (more) {
      f.minFollowers = size(more[1], more[2]);
      t = t.replace(more[0], ' ');
   }
   // A number is a price only with a currency, or after "under/below/cheaper than" when it isn't
   // clearly something else ("max 5 a week", "under 10k views", "3%").
   const price =
      t.match(/(?:under|below|less than|max(?:imum)?|cheaper than|up to|budget(?: of)?|<)\s*€\s*(\d+(?:[.,]\d+)?)\s*(k)?/) ??
      t.match(/(?:under|below|less than|max(?:imum)?|cheaper than|up to|budget(?: of)?|<)\s*(\d+(?:[.,]\d+)?)\s*(k)?\s*(?:euros?|eur|€)/) ??
      t.match(/(?:under|below|less than|cheaper than|<)\s*(\d+(?:[.,]\d+)?)(?![\d.,])\s*(k)?(?!\s*(?:k\b|%|views|viewers|followers|subs|a week|per week|creators|pcs?\b))/);
   if (price) {
      f.maxPrice = Math.round(parseFloat(price[1].replace(',', '.')) * (price[2] ? 1000 : 1));
      t = t.replace(price[0], ' ');
   }
   const views = t.match(/(?:over|above|at least|more than|min(?:imum)?|>)\s*(\d+(?:[.,]\d+)?)\s*(k|m)?\s*views/);
   if (views) {
      f.minViews = Math.round(parseFloat(views[1].replace(',', '.')) * (views[2] === 'm' ? 1e6 : views[2] === 'k' ? 1e3 : 1));
      t = t.replace(views[0], ' ');
   }

   if (eat(/\b(no agenc(?:y|ies)|without (?:an )?agency|direct(?:ly)?|not managed)\b/)) f.directOnly = true;
   if (eat(/\b(hidden gems?|gems?|underrated|undervalued)\b/)) f.gemsOnly = true;
   if (eat(/\b(real|actual|live data|crawled)\b/)) f.realOnly = true;
   // "more like jyksedi", "similar to @tubu": find the creator by handle or name.
   const like = t.match(/\b(?:more like|similar to|lookalikes? (?:of|for)|like)\s+@?([\p{L}\p{N}_.-]{2,40})/u);
   if (like) {
      const needle = like[1].toLowerCase();
      const hit = CREATORS.find((c) => c.handle.toLowerCase() === needle || c.name.toLowerCase() === needle) ??
         CREATORS.find((c) => c.handle.toLowerCase().startsWith(needle) || c.name.toLowerCase().startsWith(needle));
      if (hit) {
         f.likeId = hit.id;
         t = t.replace(like[0], ' ');
      }
   }
   if (eat(/\b(competitors?|competition|rivals?|other pc (?:shops?|sellers?|brands?)|pc brands?)\b/)) f.competitor = true;
   if (eat(/\b(sponsored|sponsors?|sponsorships?|brand deals?|brand partners?|did ads|has done ads|takes? deals?)\b/)) f.sponsored = true;
   for (const [re, ms] of MARKETS) if (eat(re)) f.markets = [...new Set([...f.markets, ...ms])];
   for (const [re, p] of PLATFORMS) if (eat(re)) f.platforms = [...new Set([...f.platforms, p])];
   for (const [re, ts] of TIERS) if (eat(re)) f.tiers = [...new Set([...f.tiers, ...ts])];
   for (const [re, g] of GAME_RES) if (eat(re)) f.games = [...new Set([...f.games, g])];
   for (const [re, genre] of GENRE_RES) if (eat(re)) f.genres = [...new Set([...f.genres, genre])];
   for (const [re, s] of SORTS) if (eat(re)) f.sort = s;

   const handle = t.match(/@([\wÀ-ɏ]+)/);
   if (handle) {
      f.text = handle[1];
      t = t.replace(handle[0], ' ');
   }

   const leftover = t
      .split(/\s+/)
      .filter((w) => w && !STOP.has(w) && !/^\d+k?$/.test(w));
   return { filters: f, leftover };
}

type LlmFilters = Partial<Omit<Filters, 'text'>>;

/** Merge what the local LLM understood into the rule-based result, keeping rule-based picks. */
export function mergeLlm(rule: Filters, llm: LlmFilters, query: string): Filters {
   // Rule-based picks win; the LLM only fills fields the rules left empty.
   // Selecting every option is the same as no filter, and numbers need a number in the query.
   const fill = <T,>(a: T[], b: T[] | undefined, all: number) => (a.length ? a : b && b.length < all ? b : []);
   // Only trust a model-filled field when the query has words that could mean it.
   const says = (re: RegExp) => re.test(query.toLowerCase());
   const num = (v: number | null | undefined, cue: RegExp) => (says(cue) && v && v > 0 ? v : null);
   return {
      ...rule,
      markets: fill(rule.markets, llm.markets, 3),
      platforms: fill(rule.platforms, llm.platforms, 2),
      // Size words are fully covered by the rules; the model tends to invent sizes.
      tiers: rule.tiers,
      // A model-picked game must actually be named in the query.
      games: rule.genres.length
         ? rule.games
         : fill(
              rule.games,
              llm.games?.filter((g) => GAME_RES.some(([re, name]) => name === g && re.test(query.toLowerCase()))),
              GAMES.length
           ),
      maxPrice: rule.maxPrice ?? num(llm.maxPrice, /\d[^%]*?(€|eur|euro)|(€|price|cost|budget|under|below)\s*€?\d/),
      minViews: rule.minViews ?? num(llm.minViews, /\d\s*k?\s*(views|viewers)/),
      directOnly: rule.directOnly || (!!llm.directOnly && says(/agenc|direct/)),
      gemsOnly: rule.gemsOnly || (!!llm.gemsOnly && says(/gem|underrated|undervalued/)),
      sort: rule.sort !== 'score' ? rule.sort : (llm.sort ?? 'score'),
   };
}
