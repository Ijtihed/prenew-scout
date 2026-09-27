'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Mail, Star } from 'lucide-react';
import type { Creator } from '@/lib/data/types';
import { MARKET_META } from '@/lib/data/mock';
import { compact, eur, pcs, range } from '@/lib/format';
import { breakEven, COMPARE_MAX, useProfitPerPc, useScout, useUi } from '@/lib/store';
import { useMounted } from '@/hooks/use-mounted';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CreatorAvatar, PlatformIcon } from './creator-avatar';

/** Break-even is the one number coloured: easy to recoup in green, hard in red. */
export function BreakEven({ value, className }: { value: number; className?: string }) {
   return (
      <span
         className={cn(
            'tabular-nums',
            value <= 1.5 ? 'text-good' : value >= 5 ? 'text-bad' : 'text-foreground',
            className
         )}
      >
         {pcs(value)} PCs
      </span>
   );
}

/** Follower growth; coloured only when it clearly moves. */
export function Growth({ value, known = true }: { value: number; known?: boolean }) {
   if (!known)
      return (
         <span className="text-muted-foreground" title="Needs a few days of daily crawls to measure">
            –
         </span>
      );
   return (
      <span className={cn('tabular-nums', value >= 2 ? 'text-good' : value <= -1 ? 'text-bad' : 'text-muted-foreground')}>
         {value > 0 ? '+' : value < 0 ? '−' : ''}
         {Math.abs(value).toFixed(1)}%
      </span>
   );
}

export const COLUMN_HELP = {
   score: 'How good a pick this creator is right now, 0–100, vs. creators in the same country. Recent growth counts most, then fit with Prenew, engagement and price.',
   growth: 'Follower change over the last 7 days.',
   followers: 'Followers or subscribers on their main platform.',
   views: 'Views we expect on one sponsored post. Most posts land in this range.',
   price: 'What we expect them to charge for one post.',
   breakEven: 'How many PCs this post must sell to pay back its price. Lower is safer.',
};

type SortKey = 'score' | 'growth' | 'followers' | 'views' | 'price' | 'breakEven';
type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null;

const SORT_VALUE: Record<SortKey, (c: Creator, profit: number) => number> = {
   score: (c) => c.score,
   growth: (c) => (c.growthKnown === false ? -Infinity : c.growth7d),
   followers: (c) => c.followers,
   views: (c) => c.prediction.views[1],
   price: (c) => c.prediction.price[1],
   breakEven: (c, p) => breakEven(c.prediction.price[1], p),
};
// Cheaper and easier to pay back are "better", so those start low-to-high.
const FIRST_DIR: Record<SortKey, 'asc' | 'desc'> = { score: 'desc', growth: 'desc', followers: 'desc', views: 'desc', price: 'asc', breakEven: 'asc' };

function Head({
   label,
   help,
   className,
   sortKey,
   sort,
   onSort,
}: {
   label: string;
   help: string;
   className?: string;
   sortKey: SortKey;
   sort: SortState;
   onSort: (k: SortKey) => void;
}) {
   const active = sort?.key === sortKey;
   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <button
               onClick={() => onSort(sortKey)}
               className={cn('flex items-center justify-end gap-1 hover:text-foreground', active && 'text-foreground', className)}
            >
               {label}
               {active && (sort!.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
            </button>
         </TooltipTrigger>
         <TooltipContent className="max-w-60">{help} Click to sort.</TooltipContent>
      </Tooltip>
   );
}

export function SaveButton({ id, className }: { id: string; className?: string }) {
   const mounted = useMounted();
   const { saved, toggleSaved } = useScout();
   const on = mounted && saved.includes(id);
   return (
      <button
         aria-label={on ? 'Unsave' : 'Save'}
         title={on ? 'Saved' : 'Save candidate'}
         onClick={(e) => {
            e.stopPropagation();
            toggleSaved(id);
         }}
         className={cn('text-muted-foreground hover:text-foreground', on && 'text-foreground', className)}
      >
         <Star className={cn('size-4', on && 'fill-current')} />
      </button>
   );
}

const PAGE = 60;

export function CreatorsList({ creators, compact: dense = false }: { creators: Creator[]; compact?: boolean }) {
   const profit = useProfitPerPc();
   const [sort, setSort] = useState<SortState>(null);
   const onSort = (key: SortKey) =>
      setSort((s) =>
         s?.key !== key ? { key, dir: FIRST_DIR[key] } : s.dir === FIRST_DIR[key] ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : null
      );
   const rows = useMemo(() => {
      if (!sort) return creators;
      const f = SORT_VALUE[sort.key];
      return [...creators].sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * (f(a, profit) - f(b, profit)));
   }, [creators, sort, profit]);
   const h = { sort, onSort };
   // Rows are drawn in pages as the list scrolls; thousands at once would freeze the page.
   const [limit, setLimit] = useState(PAGE);
   useEffect(() => setLimit(PAGE), [rows]);
   const more = useRef<HTMLDivElement>(null);
   useEffect(() => {
      const el = more.current;
      if (!el) return;
      const io = new IntersectionObserver((e) => e[0].isIntersecting && setLimit((l) => l + PAGE), { rootMargin: '600px' });
      io.observe(el);
      return () => io.disconnect();
   }, [limit, rows.length]);
   return (
      <div className="w-full">
         <div className="sticky top-0 z-10 flex items-center border-b bg-container px-4 py-1.5 text-sm text-muted-foreground lg:px-6">
            <div className="w-12 shrink-0" />
            <div className="min-w-0 flex-1">Creator</div>
            <Head {...h} sortKey="score" label="Score" help={COLUMN_HELP.score} className="hidden w-[64px] shrink-0 sm:flex" />
            <Head {...h} sortKey="growth" label="7d growth" help={COLUMN_HELP.growth} className="hidden w-[84px] shrink-0 md:flex" />
            {!dense && <Head {...h} sortKey="followers" label="Followers" help={COLUMN_HELP.followers} className="hidden w-[90px] shrink-0 md:flex" />}
            <Head {...h} sortKey="views" label="Views per post" help={COLUMN_HELP.views} className="w-[130px] shrink-0" />
            <Head {...h} sortKey="price" label="Price" help={COLUMN_HELP.price} className="hidden w-[90px] shrink-0 sm:flex" />
            <Head {...h} sortKey="breakEven" label="Break-even" help={COLUMN_HELP.breakEven} className="w-[110px] shrink-0" />
            <div className="w-9 shrink-0" />
         </div>
         {rows.slice(0, limit).map((c) => (
            <CreatorRow key={c.id} c={c} dense={dense} />
         ))}
         {limit < rows.length && <div ref={more} className="h-px" />}
      </div>
   );
}

function CreatorRow({ c, dense }: { c: Creator; dense: boolean }) {
   const mounted = useMounted();
   const { compare, toggleCompare, saved } = useScout();
   const profitPerPc = useProfitPerPc();
   const setPeek = useUi((s) => s.setPeek);
   const openComposer = useUi((s) => s.openComposer);
   const selected = mounted && compare.includes(c.id);
   const isSaved = mounted && saved.includes(c.id);
   const full = mounted && compare.length >= COMPARE_MAX && !selected;

   return (
      <div
         className={cn(
            'group flex w-full cursor-pointer items-center border-b border-muted-foreground/5 px-4 py-2.5 text-sm hover:bg-sidebar/50 lg:px-6',
            selected && 'bg-accent/30'
         )}
         onClick={() => setPeek(c.id)}
      >
         <div className="flex w-12 shrink-0 items-center gap-2">
            <button
               aria-label={selected ? 'Remove from compare' : 'Add to compare'}
               title={full ? `Compare holds ${COMPARE_MAX}` : 'Compare'}
               onClick={(e) => {
                  e.stopPropagation();
                  toggleCompare(c.id);
               }}
               className={cn(
                  'flex size-4 items-center justify-center rounded-[4px] border border-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100',
                  selected && 'border-foreground bg-foreground text-background opacity-100'
               )}
            >
               {selected && <Check className="size-3" strokeWidth={3} />}
            </button>
            <SaveButton id={c.id} className={cn('opacity-0 group-hover:opacity-100', isSaved && 'opacity-100')} />
         </div>
         <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <CreatorAvatar c={c} />
            <span className="shrink-0 font-medium">{c.handle}</span>
            {c.pastPartner && <span className="shrink-0 rounded border px-1 text-[10px] text-muted-foreground">Past partner</span>}
            <span className="hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
               <span>{MARKET_META[c.market].flag}</span>
               <PlatformIcon p={c.platform} className="size-3" />
               {!dense && <span className="hidden truncate xl:inline">{c.games.join(', ')}</span>}
            </span>
         </div>
         <div className="hidden w-[64px] shrink-0 text-right tabular-nums sm:block">{c.score}</div>
         <div className="hidden w-[84px] shrink-0 text-right md:block">
            <Growth value={c.growth7d} known={c.growthKnown !== false} />
         </div>
         {!dense && (
            <div className="hidden w-[90px] shrink-0 text-right tabular-nums text-muted-foreground md:block">
               {compact(c.followers)}
            </div>
         )}
         <div className="w-[130px] shrink-0 text-right tabular-nums">{range(c.prediction.views)}</div>
         <div className="hidden w-[90px] shrink-0 text-right tabular-nums sm:block">{eur(c.prediction.price[1])}</div>
         <div className="w-[110px] shrink-0 text-right">
            <BreakEven value={breakEven(c.prediction.price[1], profitPerPc)} />
         </div>
         <div className="flex w-9 shrink-0 justify-end">
            <button
               aria-label={`Email ${c.name}`}
               title="Write an email"
               onClick={(e) => {
                  e.stopPropagation();
                  openComposer(c.id);
               }}
               className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
            >
               <Mail className="size-4" />
            </button>
         </div>
      </div>
   );
}
