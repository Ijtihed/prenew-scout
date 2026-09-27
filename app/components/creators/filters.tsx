'use client';

import { useMemo, useState } from 'react';
import { ArrowUpDown, CheckIcon, ChevronLeft, ChevronRight, Gamepad2, Globe2, ListFilter, Ruler, Tv } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { GAME_NAMES, GENRE_LABEL, playsGenres } from '@/lib/data/games';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Creator, Market, Platform, Tier } from '@/lib/data/types';
import { ASSUMPTIONS, LIVE_MARKETS, MARKET_META, creatorById } from '@/lib/data/mock';
import { lookalikes } from '@/lib/lookalike';
import { compact } from '@/lib/format';

export type Sort = 'score' | 'growth' | 'views' | 'price' | 'cpm' | 'er';
export const SORTS: Record<Sort, { label: string; fn: (a: Creator, b: Creator) => number }> = {
   score: { label: 'Score', fn: (a, b) => b.score - a.score },
   growth: { label: 'Rising fastest', fn: (a, b) => b.growth7d - a.growth7d },
   views: { label: 'Predicted views', fn: (a, b) => b.prediction.views[1] - a.prediction.views[1] },
   price: { label: 'Lowest price', fn: (a, b) => a.prediction.price[1] - b.prediction.price[1] },
   cpm: { label: 'Most views per euro', fn: (a, b) => a.prediction.cpm - b.prediction.cpm },
   er: { label: 'Engagement rate', fn: (a, b) => b.engagementRate - a.engagementRate },
};

export interface Filters {
   markets: Market[];
   platforms: Platform[];
   tiers: Tier[];
   games: string[];
   /** Genre tags from games.ts; a creator must play a game carrying all of them. */
   genres: string[];
   gemsOnly: boolean;
   directOnly: boolean;
   /** Only creators found by the crawler, not generated samples. */
   realOnly: boolean;
   maxPrice: number | null;
   minViews: number | null;
   /** Free text matched against handles. */
   text: string;
   sort: Sort;
   /** Has posted sponsored Shorts recently. */
   sponsored?: boolean;
   /** Has promoted a PC seller or builder (a Prenew competitor). */
   competitor?: boolean;
   /** Show creators most like this one, most similar first. */
   likeId?: string | null;
   /** At most this many PCs to sell before their fee pays back. */
   maxBreakEven?: number | null;
   /** Follower or subscriber count bounds. */
   minFollowers?: number | null;
   maxFollowers?: number | null;
}

export const DEFAULT_FILTERS: Filters = {
   markets: [],
   platforms: [],
   tiers: [],
   games: [],
   genres: [],
   gemsOnly: false,
   directOnly: false,
   realOnly: false,
   maxPrice: null,
   minViews: null,
   text: '',
   sort: 'score',
};

export const activeCount = (f: Filters) =>
   f.markets.length + f.platforms.length + f.tiers.length + f.games.length + f.genres.length + +f.gemsOnly + +f.directOnly +
   +(f.maxPrice !== null) + +(f.minViews !== null) + +!!f.text + +f.realOnly + +!!f.sponsored + +!!f.competitor + +!!f.likeId + +(f.maxBreakEven != null) +
   +(f.minFollowers != null) + +(f.maxFollowers != null);

export function applyFilters(list: Creator[], f: Filters) {
   const kept = list.filter(
         (c) =>
            (!f.markets.length || f.markets.includes(c.market)) &&
            (!f.platforms.length || f.platforms.includes(c.platform)) &&
            (!f.tiers.length || f.tiers.includes(c.tier)) &&
            // Named games and genres widen each other: "shooters and Minecraft" shows both.
            (!(f.games.length || f.genres.length) ||
               c.games.some((g) => f.games.includes(g)) ||
               (f.genres.length > 0 && playsGenres(c.games, f.genres))) &&
            (!f.gemsOnly || c.hiddenGem) &&
            (!f.directOnly || !c.agency) &&
            (!f.realOnly || !!c.real) &&
            (f.maxPrice === null || c.prediction.price[1] <= f.maxPrice) &&
            (f.minViews === null || c.prediction.views[1] >= f.minViews) &&
            (!f.text || c.handle.toLowerCase().includes(f.text.toLowerCase())) &&
            (!f.sponsored || (c.sponsorship?.sponsored ?? 0) > 0) &&
            (!f.competitor || !!c.sponsorship?.competitor) &&
            (f.maxBreakEven == null || c.prediction.price[1] / ASSUMPTIONS.profitPerPc <= f.maxBreakEven) &&
            (f.minFollowers == null || c.followers >= f.minFollowers) &&
            (f.maxFollowers == null || c.followers < f.maxFollowers)
   );
   const like = f.likeId ? creatorById(f.likeId) : undefined;
   // "More like X" keeps its own order (most similar first) unless another sort was asked for.
   if (like && f.sort === 'score') return lookalikes(like, kept, 40).map((x) => x.creator);
   if (like) return lookalikes(like, kept, 40).map((x) => x.creator).sort(SORTS[f.sort].fn);
   return kept.sort(SORTS[f.sort].fn);
}

const TIERS: { id: Tier; label: string }[] = [
   { id: 'nano', label: 'Nano · 500–10K' },
   { id: 'micro', label: 'Micro · 10K–100K' },
   { id: 'mid', label: 'Mid · 100K–500K' },
   { id: 'macro', label: 'Macro · 500K+' },
];

type Sub = 'market' | 'platform' | 'size' | 'game' | 'sort';

function toggle<T>(xs: T[], x: T) {
   return xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];
}

export function FilterButton({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
   const [open, setOpen] = useState(false);
   const [sub, setSub] = useState<Sub | null>(null);
   const active = activeCount(value);

   const Row = ({ on, label, onSelect }: { on: boolean; label: React.ReactNode; onSelect: () => void }) => (
      <CommandItem onSelect={onSelect} className="flex cursor-pointer items-center justify-between">
         <span className="flex items-center gap-2">{label}</span>
         {on && <CheckIcon className="size-4" />}
      </CommandItem>
   );

   return (
      <Popover
         open={open}
         onOpenChange={(o) => {
            setOpen(o);
            if (!o) setSub(null);
         }}
      >
         <PopoverTrigger asChild>
            <Button size="xs" variant="ghost" className="relative">
               <ListFilter className="size-4" />
               <span className="ml-1 hidden sm:inline">Filter</span>
               {active > 0 && (
                  <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                     {active}
                  </span>
               )}
            </Button>
         </PopoverTrigger>
         <PopoverContent className="w-64 p-0" align="start">
            <Command>
               {sub && (
                  <div className="flex items-center border-b p-2">
                     <Button variant="ghost" size="icon" className="size-6" onClick={() => setSub(null)}>
                        <ChevronLeft className="size-4" />
                     </Button>
                     <span className="ml-2 text-sm font-medium capitalize">{sub}</span>
                  </div>
               )}
               {sub === 'game' && <CommandInput placeholder="Search games…" />}
               <CommandList>
                  {sub === 'game' && (
                     <>
                        <CommandEmpty>No game found.</CommandEmpty>
                        <CommandGroup>
                           {[...value.games, ...GAME_NAMES.filter((g) => !value.games.includes(g))].map((g) => (
                              <Row key={g} on={value.games.includes(g)} label={g} onSelect={() => onChange({ ...value, games: toggle(value.games, g) })} />
                           ))}
                        </CommandGroup>
                     </>
                  )}
                  {sub === null && (
                     <>
                        <CommandGroup>
                           {(
                              [
                                 ['market', 'Market', Globe2, value.markets.length],
                                 ['platform', 'Platform', Tv, value.platforms.length],
                                 ['size', 'Size', Ruler, value.tiers.length],
                                 ['game', 'Game', Gamepad2, value.games.length],
                                 ['sort', 'Sort by', ArrowUpDown, 0],
                              ] as const
                           ).map(([id, label, Icon, n]) => (
                              <CommandItem
                                 key={id}
                                 onSelect={() => setSub(id)}
                                 className="flex cursor-pointer items-center justify-between"
                              >
                                 <span className="flex items-center gap-2">
                                    <Icon className="size-4 text-muted-foreground" />
                                    {label}
                                 </span>
                                 <span className="flex items-center text-xs text-muted-foreground">
                                    {n > 0 && <span className="mr-1">{n}</span>}
                                    <ChevronRight className="size-4" />
                                 </span>
                              </CommandItem>
                           ))}
                        </CommandGroup>
                        <CommandSeparator />
                        <CommandGroup>
                           <Row
                              on={value.gemsOnly}
                              label="Hidden gems only"
                              onSelect={() => onChange({ ...value, gemsOnly: !value.gemsOnly })}
                           />
                           <Row
                              on={value.directOnly}
                              label="No agency"
                              onSelect={() => onChange({ ...value, directOnly: !value.directOnly })}
                           />
                           <Row
                              on={value.realOnly}
                              label="Real creators only"
                              onSelect={() => onChange({ ...value, realOnly: !value.realOnly })}
                           />
                           <Row
                              on={!!value.sponsored}
                              label="Did sponsored posts"
                              onSelect={() => onChange({ ...value, sponsored: !value.sponsored })}
                           />
                           <Row
                              on={!!value.competitor}
                              label="Promoted a competitor"
                              onSelect={() => onChange({ ...value, competitor: !value.competitor })}
                           />
                        </CommandGroup>
                        {active > 0 && (
                           <>
                              <CommandSeparator />
                              <CommandGroup>
                                 <CommandItem
                                    className="cursor-pointer"
                                    onSelect={() => onChange({ ...DEFAULT_FILTERS, sort: value.sort })}
                                 >
                                    Clear all filters
                                 </CommandItem>
                              </CommandGroup>
                           </>
                        )}
                     </>
                  )}
                  {sub === 'market' && (
                     <CommandGroup>
                        {(LIVE_MARKETS as readonly Market[]).map((m) => (
                           <Row
                              key={m}
                              on={value.markets.includes(m)}
                              label={`${MARKET_META[m].flag} ${MARKET_META[m].name}`}
                              onSelect={() => onChange({ ...value, markets: toggle(value.markets, m) })}
                           />
                        ))}
                        <CommandItem disabled className="justify-between opacity-50">
                           🇺🇸 United States <span className="text-xs">Soon</span>
                        </CommandItem>
                     </CommandGroup>
                  )}
                  {sub === 'platform' && (
                     <CommandGroup>
                        {(['tiktok', 'youtube'] as Platform[]).map((p) => (
                           <Row
                              key={p}
                              on={value.platforms.includes(p)}
                              label={p === 'tiktok' ? 'TikTok' : 'YouTube Shorts'}
                              onSelect={() => onChange({ ...value, platforms: toggle(value.platforms, p) })}
                           />
                        ))}
                     </CommandGroup>
                  )}
                  {sub === 'size' && (
                     <CommandGroup>
                        {TIERS.map((t) => (
                           <Row
                              key={t.id}
                              on={value.tiers.includes(t.id)}
                              label={t.label}
                              onSelect={() => onChange({ ...value, tiers: toggle(value.tiers, t.id) })}
                           />
                        ))}
                     </CommandGroup>
                  )}
                  {sub === 'sort' && (
                     <CommandGroup>
                        {(Object.keys(SORTS) as Sort[]).map((s) => (
                           <Row
                              key={s}
                              on={value.sort === s}
                              label={SORTS[s].label}
                              onSelect={() => onChange({ ...value, sort: s })}
                           />
                        ))}
                     </CommandGroup>
                  )}
               </CommandList>
            </Command>
         </PopoverContent>
      </Popover>
   );
}

/** Removable chips for active filters, shown next to the Filter button. */
export function ActiveFilters({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
   const chips = useMemo(() => {
      const out: { key: string; label: string; clear: () => Filters }[] = [];
      value.markets.forEach((m) =>
         out.push({ key: m, label: MARKET_META[m].name, clear: () => ({ ...value, markets: value.markets.filter((x) => x !== m) }) })
      );
      value.platforms.forEach((p) =>
         out.push({ key: p, label: p === 'tiktok' ? 'TikTok' : 'YouTube Shorts', clear: () => ({ ...value, platforms: value.platforms.filter((x) => x !== p) }) })
      );
      value.tiers.forEach((t) =>
         out.push({ key: t, label: t[0].toUpperCase() + t.slice(1), clear: () => ({ ...value, tiers: value.tiers.filter((x) => x !== t) }) })
      );
      if (value.genres.length)
         out.push({ key: 'genres', label: value.genres.map((g) => GENRE_LABEL[g] ?? g).join(' + '), clear: () => ({ ...value, genres: [] }) });
      value.games.forEach((g) =>
         out.push({ key: `g-${g}`, label: g, clear: () => ({ ...value, games: value.games.filter((x) => x !== g) }) })
      );
      if (value.maxPrice !== null) out.push({ key: 'price', label: `Price ≤ €${value.maxPrice}`, clear: () => ({ ...value, maxPrice: null }) });
      if (value.minViews !== null) out.push({ key: 'views', label: `Views ≥ ${compact(value.minViews)}`, clear: () => ({ ...value, minViews: null }) });
      if (value.text) out.push({ key: 'text', label: `Handle “${value.text}”`, clear: () => ({ ...value, text: '' }) });
      if (value.sort !== 'score') out.push({ key: 'sort', label: `Sorted: ${SORTS[value.sort].label}`, clear: () => ({ ...value, sort: 'score' }) });
      if (value.realOnly) out.push({ key: 'real', label: 'Real creators', clear: () => ({ ...value, realOnly: false }) });
      if (value.gemsOnly) out.push({ key: 'gems', label: 'Hidden gems', clear: () => ({ ...value, gemsOnly: false }) });
      if (value.directOnly) out.push({ key: 'direct', label: 'No agency', clear: () => ({ ...value, directOnly: false }) });
      if (value.sponsored) out.push({ key: 'sponsored', label: 'Did sponsored posts', clear: () => ({ ...value, sponsored: false }) });
      if (value.maxFollowers != null)
         out.push({ key: 'maxfollowers', label: `Followers < ${compact(value.maxFollowers)}`, clear: () => ({ ...value, maxFollowers: null }) });
      if (value.minFollowers != null)
         out.push({ key: 'minfollowers', label: `Followers ≥ ${compact(value.minFollowers)}`, clear: () => ({ ...value, minFollowers: null }) });
      if (value.maxBreakEven != null)
         out.push({ key: 'breakeven', label: `Pays back in ≤ ${value.maxBreakEven} PCs`, clear: () => ({ ...value, maxBreakEven: null }) });
      if (value.competitor) out.push({ key: 'competitor', label: 'Promoted a competitor', clear: () => ({ ...value, competitor: false }) });
      if (value.likeId) {
         const like = creatorById(value.likeId);
         out.push({ key: 'like', label: `Like ${like?.handle ?? 'creator'}`, clear: () => ({ ...value, likeId: null }) });
      }
      return out;
   }, [value]);
   return (
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
         {chips.map((c) => (
            <button
               key={c.key}
               onClick={() => onChange(c.clear())}
               className="flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-xs text-muted-foreground hover:text-foreground"
            >
               {c.label} <span aria-hidden>×</span>
            </button>
         ))}
      </div>
   );
}
