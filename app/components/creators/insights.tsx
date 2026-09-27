'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { CreatorAvatar } from '@/components/creators/creator-avatar';
import { CREATORS, MARKET_META } from '@/lib/data/mock';
import { compact, shortDate } from '@/lib/format';

/** Dates from another year keep the year, so an old sponsorship doesn't read as recent. */
const when = (iso: string) => (iso.slice(0, 4) === new Date().toISOString().slice(0, 4) ? shortDate(iso) : `${shortDate(iso)} ${iso.slice(0, 4)}`);
import { lookalikes } from '@/lib/lookalike';
import { cn } from '@/lib/utils';
import type { BrandCategory, Creator } from '@/lib/data/types';

export const CATEGORY_LABEL: Record<BrandCategory, string> = {
   pc: 'PC seller',
   hardware: 'Hardware',
   game: 'Game',
   gambling: 'Gambling',
   other: 'Other',
};

const LANGUAGE = {
   FI: 'Finnish', SE: 'Swedish', DE: 'German', DK: 'Danish', FR: 'French', NL: 'Dutch', BE: 'Dutch or French', AT: 'German',
   PL: 'Polish', EE: 'Estonian', LV: 'Latvian', LT: 'Lithuanian',
} as const;

export function SponsorshipInsight({ c }: { c: Creator }) {
   const s = c.sponsorship!;
   const paid = s.brands.filter((b) => b.posts > 0);
   const standing = s.brands.filter((b) => b.posts === 0);
   const unit = c.platform === 'tiktok' ? 'video' : 'Short';
   return (
      <div className="flex flex-col gap-3 text-sm">
         <p className="text-muted-foreground">
            {s.sponsored
               ? `${s.sponsored} of their last ${s.checked} ${unit}s were sponsored${s.last ? `, most recently ${when(s.last)}` : ''}.`
               : `No sponsored ${unit}s in their last ${s.checked}.`}
            {s.sponsored >= 2 && s.sponsored < s.checked && s.sponsoredMedianViews != null && s.medianViews
               ? ` Sponsored ones got ${compact(s.sponsoredMedianViews)} median views vs ${compact(s.medianViews)} overall.`
               : ''}
         </p>
         {paid.length > 0 && (
            <div className="flex flex-col">
               {paid.map((b) => (
                  <div key={b.name} className="flex items-center gap-3 border-b border-muted-foreground/5 py-1.5 last:border-0">
                     <span className={cn('min-w-0 flex-1 truncate', b.category === 'gambling' && 'text-bad')}>{b.name}</span>
                     <span className={cn('w-20 text-xs', b.category === 'pc' ? 'text-foreground' : 'text-muted-foreground')}>
                        {CATEGORY_LABEL[b.category]}
                     </span>
                     <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                        {b.posts} {unit}
                        {b.posts > 1 ? 's' : ''}
                     </span>
                     <span className="w-20 text-right text-xs text-muted-foreground">{b.last ? when(b.last) : ''}</span>
                  </div>
               ))}
            </div>
         )}
         {standing.length > 0 && (
            <p className="text-xs text-muted-foreground">
               Standing partner{standing.length > 1 ? 's' : ''} in their descriptions: {standing.map((b) => b.name).join(', ')}
            </p>
         )}
      </div>
   );
}

export function AudienceInsight({ c }: { c: Creator }) {
   const a = c.comments!;
   const lang = LANGUAGE[c.market as keyof typeof LANGUAGE];
   return (
      <div className="flex flex-col gap-3 text-sm">
         <div className="grid grid-cols-2 gap-4">
            <div>
               <div className="text-xs text-muted-foreground">Comments in {lang ?? 'their language'}</div>
               <div className="text-lg font-semibold tabular-nums">{a.local != null ? `${a.local}%` : '–'}</div>
            </div>
            <div>
               <div className="text-xs text-muted-foreground">Asking about PCs or specs</div>
               <div className="text-lg font-semibold tabular-nums">{a.intent != null ? `${a.intent}%` : '–'}</div>
            </div>
         </div>
         {a.intentN >= 2 && a.examples.length > 0 && (
            <ul className="flex flex-col gap-1.5">
               {a.examples.map((e) => (
                  <li key={e} className="border-l-2 pl-2.5 text-xs text-muted-foreground">
                     “{e}”
                  </li>
               ))}
            </ul>
         )}
      </div>
   );
}

export function Lookalikes({ c }: { c: Creator }) {
   const list = useMemo(() => lookalikes(c, CREATORS, 6), [c]);
   if (!list.length) return <p className="text-sm text-muted-foreground">No similar creators yet.</p>;
   return (
      <div className="flex flex-col">
         {list.map(({ creator: o, similarity, because }) => (
            <Link
               key={o.id}
               href={`/creator/${o.id}`}
               className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40"
            >
               <CreatorAvatar c={o} className="size-6 text-[10px]" />
               <span className="shrink-0 font-medium">{o.handle}</span>
               <span className="shrink-0 text-xs">{MARKET_META[o.market].flag}</span>
               <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{because}</span>
               <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{similarity}% alike</span>
            </Link>
         ))}
      </div>
   );
}

const RISK_LABEL: Record<string, string> = {
   gambling: 'Gambling',
   adult: 'Adult content',
   hate: 'Hateful language',
   drugs: 'Drugs',
   alcohol: 'Drinking',
   violence: 'Real violence',
   scam: 'Scam',
};

export function SafetyInsight({ c }: { c: Creator }) {
   const flags = c.safety!.flags;
   if (!flags.length) return <p className="text-sm text-muted-foreground">Nothing risky in their recent Shorts.</p>;
   return (
      <div className="flex flex-col gap-2 text-sm">
         {flags.map((f) => (
            <div key={f.category + f.evidence}>
               <div className="text-bad">{RISK_LABEL[f.category] ?? f.category}</div>
               <div className="border-l-2 pl-2.5 text-xs text-muted-foreground">“{f.evidence}”</div>
            </div>
         ))}
      </div>
   );
}
