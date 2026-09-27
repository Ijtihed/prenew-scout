'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { CreatorsList } from '@/components/creators/creators-list';
import { CATEGORY_LABEL } from '@/components/creators/insights';
import { CREATORS, MARKET_META } from '@/lib/data/mock';
import { useDataVersion } from '@/lib/data/use-data-version';
import { shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BrandCategory, Creator, Market } from '@/lib/data/types';

interface Brand {
   name: string;
   category: BrandCategory;
   creators: Creator[];
   posts: number;
   last: string | null;
   markets: Market[];
}

// Gambling sponsors aren't competitors; those creators are flagged on their own profiles instead.
const TABS: BrandCategory[] = ['pc', 'hardware', 'game', 'other'];
const TAB_LABEL: Record<BrandCategory, string> = { pc: 'PC sellers', hardware: 'Hardware', game: 'Games', other: 'Other', gambling: 'Gambling' };

/** Who else pays our creators: every brand found in sponsored Shorts, grouped by what they sell. */
export default function CompetitorsPage() {
   const version = useDataVersion();
   const brands = useMemo(() => {
      const by = new Map<string, Brand>();
      for (const c of CREATORS) {
         for (const b of c.sponsorship?.brands ?? []) {
            if (b.name === 'Prenew') continue;
            const e = by.get(b.name) ?? { name: b.name, category: b.category, creators: [], posts: 0, last: null, markets: [] };
            e.creators.push(c);
            e.posts += b.posts;
            if (b.last && (!e.last || b.last > e.last)) e.last = b.last;
            if (!e.markets.includes(c.market)) e.markets.push(c.market);
            by.set(b.name, e);
         }
      }
      return [...by.values()].sort((a, b) => b.creators.length - a.creators.length || b.posts - a.posts);
   }, [version]);
   const [tab, setTab] = useState<BrandCategory>('pc');
   const shown = brands.filter((b) => b.category === tab);
   const [selName, setSelName] = useState<string | null>(null);
   const sel = shown.find((b) => b.name === selName) ?? shown[0];
   const withCompetitor = CREATORS.filter((c) => c.sponsorship?.competitor).length;

   return (
      <>
         <PageHeader title="Competitors" count={withCompetitor} />
         <div className="flex h-9 shrink-0 items-center gap-1 border-b px-4">
            {TABS.map((t) => {
               const n = brands.filter((b) => b.category === t).length;
               return (
                  <button
                     key={t}
                     onClick={() => {
                        setTab(t);
                        setSelName(null);
                     }}
                     className={cn(
                        'h-6 rounded-md px-2 text-xs',
                        tab === t ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
                     )}
                  >
                     {TAB_LABEL[t]} <span className="text-muted-foreground">{n}</span>
                  </button>
               );
            })}
         </div>
         {shown.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
               No {TAB_LABEL[tab].toLowerCase()} found in sponsored Shorts yet.
            </div>
         ) : (
            <div className="flex min-h-0 flex-1">
               <div className="w-72 shrink-0 overflow-y-auto border-r">
                  {shown.map((b) => (
                     <button
                        key={b.name}
                        onClick={() => setSelName(b.name)}
                        className={cn(
                           'flex w-full items-center gap-2 border-b border-muted-foreground/5 px-4 py-2 text-left text-sm hover:bg-sidebar/50',
                           sel?.name === b.name && 'bg-accent/40'
                        )}
                     >
                        <span className={cn('min-w-0 flex-1 truncate', b.category === 'gambling' && 'text-bad')}>{b.name}</span>
                        <span className="shrink-0 text-xs">{b.markets.map((m) => MARKET_META[m].flag).join(' ')}</span>
                        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{b.creators.length}</span>
                     </button>
                  ))}
               </div>
               {sel && (
                  <div className="flex min-w-0 flex-1 flex-col">
                     <div className="flex h-9 shrink-0 items-center gap-2 border-b px-4 text-xs text-muted-foreground lg:px-6">
                        <span className="text-sm font-medium text-foreground">{sel.name}</span>
                        <span>{CATEGORY_LABEL[sel.category]}</span>
                        {sel.last && <span className="ml-auto">last {shortDate(sel.last)}</span>}
                     </div>
                     <div className="flex-1 overflow-y-auto">
                        <CreatorsList creators={sel.creators} compact />
                     </div>
                  </div>
               )}
            </div>
         )}
      </>
   );
}
