'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { CreatorAvatar, platformName } from '@/components/creators/creator-avatar';
import { SERIES, ValueMap } from '@/components/creators/charts';
import { BreakEven, Growth } from '@/components/creators/creators-list';
import { CREATORS, creatorById, MARKET_META } from '@/lib/data/mock';
import type { Creator } from '@/lib/data/types';
import { compact, eur, pct, range } from '@/lib/format';
import { breakEven, useProfitPerPc, useScout, useUi } from '@/lib/store';
import { useMounted } from '@/hooks/use-mounted';
import { cn } from '@/lib/utils';

type Row = {
   label: string;
   render: (c: Creator, profit: number) => React.ReactNode;
   key?: (c: Creator) => number;
   better?: 'high' | 'low';
};

const ROWS: Row[] = [
   { label: 'Score', render: (c) => c.score, key: (c) => c.score, better: 'high' },
   { label: 'Market', render: (c) => `${MARKET_META[c.market].flag} ${MARKET_META[c.market].name}` },
   { label: 'Platform', render: (c) => platformName(c.platform) },
   { label: 'Followers', render: (c) => compact(c.followers) },
   { label: 'Growth, 7 days', render: (c) => <Growth value={c.growth7d} known={c.growthKnown !== false} />, key: (c) => c.growth7d, better: 'high' },
   { label: 'Engagement', render: (c) => pct(c.engagementRate), key: (c) => c.engagementRate, better: 'high' },
   { label: 'Views per post', render: (c) => range(c.prediction.views), key: (c) => c.prediction.views[1], better: 'high' },
   { label: 'Price', render: (c) => range(c.prediction.price, eur), key: (c) => c.prediction.price[1], better: 'low' },
   { label: 'Break-even', render: (c, p) => <BreakEven value={breakEven(c.prediction.price[1], p)} /> },
   { label: 'Contact', render: (c) => c.agency ?? 'Direct' },
];

export default function ComparePage() {
   const mounted = useMounted();
   const { compare, toggleCompare } = useScout();
   const setPeek = useUi((s) => s.setPeek);
   const profit = useProfitPerPc();
   const creators = (mounted ? compare : []).map(creatorById).filter((c): c is Creator => !!c);

   if (creators.length < 2) {
      return (
         <>
            <PageHeader title="Compare" count={creators.length} />
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
               <p>Tick 2 to 4 creators in any list to compare them here.</p>
               <Button size="sm" variant="secondary" asChild>
                  <Link href="/discover">Open Discover</Link>
               </Button>
            </div>
         </>
      );
   }

   const best = (r: Row) => {
      if (!r.key || !r.better) return -1;
      const vals = creators.map(r.key);
      const target = r.better === 'high' ? Math.max(...vals) : Math.min(...vals);
      return vals.indexOf(target);
   };

   return (
      <>
         <PageHeader title="Compare" count={creators.length} />
         <div className="flex-1 overflow-y-auto">
            <div className="overflow-x-auto">
               <table className="w-full text-sm">
                  <thead>
                     <tr className="border-b">
                        <th className="w-40 px-6 py-3" />
                        {creators.map((c, i) => (
                           <th key={c.id} className="px-4 py-3 text-left font-normal">
                              <div className="flex items-center gap-2">
                                 <span className="h-4 w-0.5 rounded" style={{ background: SERIES[i] }} />
                                 <CreatorAvatar c={c} />
                                 <button className="truncate font-medium hover:underline" onClick={() => setPeek(c.id)}>
                                    {c.handle}
                                 </button>
                                 <button
                                    className="ml-auto text-muted-foreground hover:text-foreground"
                                    onClick={() => toggleCompare(c.id)}
                                    aria-label="Remove"
                                 >
                                    <X className="size-3.5" />
                                 </button>
                              </div>
                           </th>
                        ))}
                     </tr>
                  </thead>
                  <tbody>
                     {ROWS.map((r) => {
                        const b = best(r);
                        return (
                           <tr key={r.label} className="border-b border-muted-foreground/5">
                              <td className="px-6 py-2.5 text-muted-foreground">{r.label}</td>
                              {creators.map((c, i) => (
                                 <td key={c.id} className={cn('px-4 py-2.5 tabular-nums', b === i && 'text-good')}>
                                    {r.render(c, profit)}
                                 </td>
                              ))}
                           </tr>
                        );
                     })}
                  </tbody>
               </table>
            </div>
            <div className="grid gap-4 p-6">
               <section className="rounded-lg border p-4">
                  <div className="mb-1 flex items-baseline justify-between">
                     <h3 className="text-sm font-medium">Who makes Prenew the most money</h3>
                     <span className="text-xs text-muted-foreground">circle size = views they bring</span>
                  </div>
                  <ValueMap profit={profit} creators={creators} />
               </section>
            </div>
         </div>
      </>
   );
}
