'use client';

import { Minus, Plus } from 'lucide-react';
import type { Creator } from '@/lib/data/types';
import { MARKET_META } from '@/lib/data/mock';
import { compact, eur, pct, range } from '@/lib/format';
import { breakEven, useProfitPerPc } from '@/lib/store';
import { BreakEven, Growth } from './creators-list';
import { platformName, ProfileLink } from './creator-avatar';

export function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
   return (
      <div className="flex min-h-8 items-center gap-4">
         <span className="w-28 shrink-0 text-sm text-muted-foreground">{label}</span>
         <div className="flex min-w-0 items-center gap-1.5 text-sm">{children}</div>
      </div>
   );
}

export function Properties({ c }: { c: Creator }) {
   return (
      <div className="flex flex-col">
         <PropertyRow label="Market">
            {MARKET_META[c.market].flag} {MARKET_META[c.market].name}
         </PropertyRow>
         <PropertyRow label="Platform">{platformName(c.platform)}</PropertyRow>
         <PropertyRow label="Followers">
            <span className="tabular-nums">{compact(c.followers)}</span>
         </PropertyRow>
         <PropertyRow label="Growth">
            <span className="whitespace-nowrap">
               <Growth value={c.growth7d} known={c.growthKnown !== false} /> <span className="text-muted-foreground">7d</span> · <Growth value={c.growth30d} known={c.growthKnown !== false} />{' '}
               <span className="text-muted-foreground">30d</span>
            </span>
         </PropertyRow>
         <PropertyRow label="Engagement">
            <span className="tabular-nums">{pct(c.engagementRate)}</span>
         </PropertyRow>
         <PropertyRow label="Posts / week">
            <span className="tabular-nums">{c.postsPerWeek.toFixed(1)}</span>
         </PropertyRow>
         <PropertyRow label="Plays">{c.games.join(', ')}</PropertyRow>
         <PropertyRow label="Profile">
            <ProfileLink c={c} />
         </PropertyRow>
         <PropertyRow label="Contact">
            <span className="truncate">{c.agency ? `${c.agency} (agency)` : (c.email ?? 'Not found')}</span>
         </PropertyRow>
      </div>
   );
}

/** The four numbers a marketer decides on. */
export function KeyNumbers({ c }: { c: Creator; compact?: boolean }) {
   const profit = useProfitPerPc();
   const be = breakEven(c.prediction.price[1], profit);
   const items = [
      { label: 'Views per post', value: range(c.prediction.views), sub: 'most posts land here' },
      { label: 'Price', value: range(c.prediction.price, eur), sub: c.agency ? 'incl. agency fee' : 'direct deal' },
      {
         label: 'Break-even',
         value: <BreakEven value={be} />,
         sub: `PCs to sell to pay it back`,
      },
   ];
   return (
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
         {items.map((it) => (
            <div key={it.label} className="bg-container px-3 py-3 [aside_&]:bg-black">
               <div className="text-xs text-muted-foreground">{it.label}</div>
               <div className="mt-0.5 text-base font-semibold whitespace-nowrap tabular-nums">{it.value}</div>
               <div className="text-xs text-muted-foreground">{it.sub}</div>
            </div>
         ))}
      </div>
   );
}

export function Reasons({ c }: { c: Creator }) {
   return (
      <div className="grid gap-4 sm:grid-cols-2">
         <div>
            <div className="mb-2 text-xs text-muted-foreground">Why it fits</div>
            <ul className="flex flex-col gap-1.5 text-sm">
               {c.helped.length ? (
                  c.helped.map((h) => (
                     <li key={h} className="flex gap-2">
                        <Plus className="mt-0.5 size-3.5 shrink-0 text-good" />
                        {h}
                     </li>
                  ))
               ) : (
                  <li className="text-muted-foreground">Nothing stands out</li>
               )}
            </ul>
         </div>
         <div>
            <div className="mb-2 text-xs text-muted-foreground">Risks</div>
            <ul className="flex flex-col gap-1.5 text-sm">
               {c.hurt.length ? (
                  c.hurt.map((h) => (
                     <li key={h} className="flex gap-2">
                        <Minus className="mt-0.5 size-3.5 shrink-0 text-bad" />
                        {h}
                     </li>
                  ))
               ) : (
                  <li className="text-muted-foreground">None found</li>
               )}
            </ul>
         </div>
      </div>
   );
}
