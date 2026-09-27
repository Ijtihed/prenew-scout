'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader, PageToolbar } from '@/components/layout/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendLine } from '@/components/creators/charts';
import { CreatorAvatar } from '@/components/creators/creator-avatar';
import { WorldMap, type Hover } from '@/components/markets/world-map';
import { CREATORS, LIVE_MARKETS, MARKET_HISTORY, MARKET_META, PAST_COLLABS, type LiveMarket } from '@/lib/data/mock';
import { useDataVersion } from '@/lib/data/use-data-version';
import type { Creator, Tier } from '@/lib/data/types';
import { compact, eur, shortDate } from '@/lib/format';
import { useScout, useUi } from '@/lib/store';
import { useMounted } from '@/hooks/use-mounted';

type Live = LiveMarket;
const LIVE: readonly Live[] = LIVE_MARKETS;
const TIER_LABEL: Record<Tier, string> = { nano: 'Nano · 500–10K', micro: 'Micro · 10K–100K', mid: 'Mid · 100K–500K', macro: 'Macro · 500K+' };

const median = (xs: number[]) => {
   if (!xs.length) return 0;
   const s = [...xs].sort((a, b) => a - b);
   return s[Math.floor(s.length / 2)];
};

function marketStats(m: Live) {
   const cs = CREATORS.filter((c) => c.market === m);
   const tiers = (['nano', 'micro', 'mid', 'macro'] as Tier[]).map((t) => {
      const ts = cs.filter((c) => c.tier === t);
      return {
         tier: t,
         count: ts.length,
         price: median(ts.map((c) => c.prediction.price[1])),
         views: median(ts.map((c) => c.prediction.views[1])),
      };
   });
   const games = new Map<string, number>();
   cs.forEach((c) => games.set(c.games[0], (games.get(c.games[0]) ?? 0) + 1));
   return {
      creators: cs,
      tiers,
      games: [...games.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      picks: [...cs].sort((a, b) => b.score - a.score).slice(0, 5),
   };
}

function Block({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
   return (
      <section>
         <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">{title}</h3>
            {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
         </div>
         {children}
      </section>
   );
}

export default function MarketsPage() {
   return (
      <Suspense>
         <MarketsView />
      </Suspense>
   );
}

function MarketsView() {
   const params = useSearchParams();
   const mounted = useMounted();
   const setPeek = useUi((s) => s.setPeek);
   const { outreach, saved } = useScout();
   const [sel, setSel] = useState<Live>('FI');
   // The sidebar's market links open this page on that market, like clicking it on the map.
   useEffect(() => {
      const m = params.get('market');
      if (m && (LIVE_MARKETS as readonly string[]).includes(m)) setSel(m as Live);
   }, [params]);
   const [view, setView] = useState<'world' | 'europe'>('europe');
   const [hover, setHover] = useState<Hover | null>(null);

   const version = useDataVersion();
   const stats = useMemo(() => marketStats(sel), [sel, version]);
   const values = useMemo(() => Object.fromEntries(LIVE.map((m) => [m, CREATORS.filter((c) => c.market === m).length])), []);
   const hist = MARKET_HISTORY[sel];
   const growth = hist[hist.length - 1].creators - hist[hist.length - 8].creators;
   const trend = hist.map((d) => ({ label: shortDate(d.date), creators: d.creators }));

   const inMarket = (id: string) => stats.creators.some((c) => c.id === id);
   const mine = mounted ? outreach.filter((o) => inMarket(o.creatorId)) : [];
   const savedHere = mounted ? saved.filter(inMarket).length : 0;

   return (
      <>
         <PageHeader title="Markets" />
         <PageToolbar>
            <Tabs value={sel} onValueChange={(v) => setSel(v as Live)}>
               <TabsList className="h-7">
                  {LIVE.map((m) => (
                     <TabsTrigger key={m} value={m} className="text-xs">
                        {MARKET_META[m].flag} {MARKET_META[m].name}
                     </TabsTrigger>
                  ))}
               </TabsList>
            </Tabs>
            <div className="ml-auto flex items-center gap-2">
               <Tabs value={view} onValueChange={(v) => setView(v as 'world' | 'europe')}>
                  <TabsList className="h-7">
                     <TabsTrigger value="europe" className="text-xs">Europe</TabsTrigger>
                     <TabsTrigger value="world" className="text-xs">World</TabsTrigger>
                  </TabsList>
               </Tabs>
            </div>
         </PageToolbar>

         <div className="flex min-h-0 flex-1">
            <div className="relative min-w-0 flex-1">
               <WorldMap
                  view={view}
                  values={values}
                  selected={sel}
                  onSelect={(code) => setSel(code as Live)}
                  onHover={setHover}
               />
               {hover && <MapTip hover={hover} />}
            </div>

            <aside className="hidden w-96 shrink-0 flex-col gap-6 overflow-y-auto border-l p-4 lg:flex">
               <div>
                  <div className="text-xs text-muted-foreground">
                     {MARKET_META[sel].flag} {MARKET_META[sel].name}
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-2">
                     <span className="text-2xl font-semibold tabular-nums">{stats.creators.length}</span>
                     <span className="text-sm text-muted-foreground">creators we can work with</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                     {growth > 0 ? `${growth} new this week` : 'No new creators this week'}
                  </div>
                  <TrendLine data={trend} dataKey="creators" fmt={(v) => `${Math.round(v)} creators`} height={70} />
               </div>

               <Block title="What a post costs here" sub="typical, per size">
                  <div className="overflow-hidden rounded-lg border text-sm">
                     <div className="flex border-b px-3 py-1.5 text-xs text-muted-foreground">
                        <span className="flex-1">Size</span>
                        <span className="w-12 text-right">Found</span>
                        <span className="w-16 text-right">Price</span>
                        <span className="w-16 text-right">Views</span>
                     </div>
                     {stats.tiers.map((t) => (
                        <div key={t.tier} className="flex border-b border-muted-foreground/5 px-3 py-2 last:border-0">
                           <span className="flex-1">{TIER_LABEL[t.tier]}</span>
                           <span className="w-12 text-right tabular-nums text-muted-foreground">{t.count}</span>
                           <span className="w-16 text-right tabular-nums">{t.count ? eur(t.price) : '–'}</span>
                           <span className="w-16 text-right tabular-nums">{t.count ? compact(t.views) : '–'}</span>
                        </div>
                     ))}
                  </div>
               </Block>

               <Block title="What they play" sub="main game">
                  <div className="flex flex-col gap-1.5">
                     {stats.games.map(([g, n]) => (
                        <div key={g} className="flex items-center gap-2 text-sm">
                           <span className="w-24 shrink-0 truncate">{g}</span>
                           <div className="h-1.5 flex-1 rounded bg-muted">
                              <div className="h-full rounded bg-foreground/70" style={{ width: `${(n / stats.games[0][1]) * 100}%` }} />
                           </div>
                           <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">{n}</span>
                        </div>
                     ))}
                  </div>
               </Block>

               <Block title="Prenew here">
                  <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-center">
                     {[
                        ['Past collabs', PAST_COLLABS[sel] ?? 0],
                        ['Contacted', mine.length],
                        ['Saved', savedHere],
                     ].map(([l, v]) => (
                        <div key={l} className="bg-container px-2 py-2.5">
                           <div className="text-lg font-semibold tabular-nums">{v}</div>
                           <div className="text-xs text-muted-foreground">{l}</div>
                        </div>
                     ))}
                  </div>
               </Block>

               <Block title="Best picks" sub="by score">
                  {stats.picks.map((c: Creator) => (
                     <button
                        key={c.id}
                        onClick={() => setPeek(c.id)}
                        className="flex w-full items-center gap-2.5 border-b border-muted-foreground/5 py-2 text-left text-sm last:border-0 hover:bg-sidebar/50"
                     >
                        <CreatorAvatar c={c} />
                        <span className="min-w-0 flex-1 truncate">{c.handle}</span>
                        <span className="text-xs text-muted-foreground">{c.games[0]}</span>
                        <span className="w-12 text-right tabular-nums">{eur(c.prediction.price[1])}</span>
                     </button>
                  ))}
               </Block>
            </aside>
         </div>
      </>
   );
}

function MapTip({ hover }: { hover: Hover }) {
   const live = LIVE.includes(hover.code as Live);
   const soon = ['US', 'CA', 'SG', 'CN'].includes(hover.code);
   const past = PAST_COLLABS[hover.code];
   if (!live && !soon && !past) return null;
   return (
      <div
         className="pointer-events-none absolute z-10 min-w-44 rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md"
         style={{ left: hover.x + 14, top: hover.y + 14 }}
      >
         <div className="mb-1 font-medium">{hover.name}</div>
         {live && (
            <div className="flex justify-between gap-4">
               <span className="text-muted-foreground">Creators found</span>
               <span className="tabular-nums">{CREATORS.filter((c) => c.market === hover.code).length}</span>
            </div>
         )}
         {soon && <div className="text-muted-foreground">Coming soon</div>}
         {past ? (
            <div className="flex justify-between gap-4">
               <span className="text-muted-foreground">Past Prenew collabs</span>
               <span className="tabular-nums">{past}</span>
            </div>
         ) : null}
         {live && <div className="mt-1 text-muted-foreground">Click to see details</div>}
      </div>
   );
}
