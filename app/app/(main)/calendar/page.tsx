'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Gamepad2, GraduationCap, MessageSquare, Rocket, Send, ShoppingBag, StickyNote, Wallet } from 'lucide-react';
import { PageHeader, PageToolbar } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { creatorById, LIVE_MARKETS, MARKET_META } from '@/lib/data/mock';
import { EVENTS, LEAD, paydays, type CalEvent, type EventKind } from '@/lib/data/events';
import type { Market } from '@/lib/data/types';
import { eurExact } from '@/lib/format';
import { useScout } from '@/lib/store';
import { useMounted } from '@/hooks/use-mounted';
import { cn } from '@/lib/utils';

type Layer = EventKind | 'activity';
const LAYERS: { id: Layer; label: string; icon: React.ElementType }[] = [
   { id: 'shopping', label: 'Shopping', icon: ShoppingBag },
   { id: 'country', label: 'School holidays', icon: GraduationCap },
   { id: 'gaming', label: 'Gaming', icon: Gamepad2 },
   { id: 'payday', label: 'Paydays', icon: Wallet },
   { id: 'activity', label: 'Our activity', icon: MessageSquare },
];

interface Item {
   key: string;
   day: string;
   label: string;
   icon: React.ElementType;
   layer: Layer;
   strong?: boolean;
   approx?: boolean;
   href?: string;
   note?: string;
   /** Date range shown in the day panel. */
   sub?: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
   const d = new Date(`${s}T00:00:00Z`);
   d.setUTCDate(d.getUTCDate() + n);
   return iso(d);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const fmt = (s: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
   new Date(`${s}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });

function eventDays(e: CalEvent) {
   const out: string[] = [];
   for (let d = e.start; d <= (e.end ?? e.start); d = addDays(d, 1)) out.push(d);
   return out;
}

export default function CalendarPage() {
   const mounted = useMounted();
   const outreach = useScout((s) => s.outreach);
   const today = iso(new Date());
   // Near the end of a month the next one is more useful to plan in.
   const [month, setMonth] = useState(() => {
      const d = new Date(`${today}T00:00:00Z`);
      const daysLeft = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() - d.getUTCDate();
      return daysLeft < 7 ? iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))).slice(0, 7) : today.slice(0, 7);
   });
   const [market, setMarket] = useState<Market | 'all'>('all');
   const [layers, setLayers] = useState<Layer[]>(['shopping', 'country', 'gaming', 'activity']);
   const [selected, setSelected] = useState(today);

   const [y, m] = month.split('-').map(Number);
   const events = useMemo(
      () => [...EVENTS, ...paydays(y, m - 1)].filter((e) => market === 'all' || !e.markets || e.markets.includes(market)),
      [y, m, market]
   );

   const items = useMemo(() => {
      const out: Item[] = [];
      const kindIcon = Object.fromEntries(LAYERS.map((l) => [l.id, l.icon])) as Record<Layer, React.ElementType>;
      for (const e of events) {
         if (!layers.includes(e.kind)) continue;
         const flags = e.markets && market === 'all' ? ` ${e.markets.map((x) => MARKET_META[x].flag).join('')}` : '';
         // Long events appear on their first day and each Monday, with the end date, instead of every day.
         const span = eventDays(e);
         for (const d of span) {
            const monday = new Date(`${d}T00:00:00Z`).getUTCDay() === 1;
            if (d !== e.start && !monday) continue;
            const until = span.length > 1 ? ` → ${fmt(e.end!)}` : '';
            out.push({ key: `${e.id}-${d}`, day: d, label: e.title + flags + until, icon: kindIcon[e.kind], layer: e.kind, strong: e.big, approx: e.approx, note: e.note });
         }
      }
      if (layers.includes('activity') && mounted) {
         for (const o of outreach) {
            const c = creatorById(o.creatorId);
            if (!c || (market !== 'all' && c.market !== market)) continue;
            for (const t of o.thread ?? []) {
               const label =
                  t.from === 'us' ? `Emailed ${c.handle}` : t.from === 'them' ? `${c.handle} replied${t.amount ? ` (${eurExact(t.amount)})` : ''}` : `Note: ${c.handle}`;
               out.push({ key: t.id, day: t.at.slice(0, 10), label, icon: t.from === 'us' ? Send : t.from === 'them' ? MessageSquare : StickyNote, layer: 'activity', href: '/outreach' });
            }
            if (o.postDate)
               out.push({ key: `post-${o.creatorId}`, day: o.postDate, label: `${c.handle} posts`, icon: Rocket, layer: 'activity', strong: true, href: '/outreach' });
         }
      }
      return out;
   }, [events, layers, outreach, mounted, market]);

   // Everything on the selected day, including every day of multi-day events.
   const dayDetails = useMemo(() => {
      const kindIcon = Object.fromEntries(LAYERS.map((l) => [l.id, l.icon])) as Record<Layer, React.ElementType>;
      const [sy, sm] = selected.split('-').map(Number);
      const evs = [...EVENTS, ...paydays(sy, sm - 1)].filter(
         (e) => layers.includes(e.kind) && e.start <= selected && (e.end ?? e.start) >= selected && (market === 'all' || !e.markets || e.markets.includes(market))
      );
      const out: Item[] = evs.map((e) => ({
         key: e.id,
         day: selected,
         label: `${e.title}${e.markets ? ` ${e.markets.map((x) => MARKET_META[x].flag).join('')}` : ''}`,
         icon: kindIcon[e.kind],
         layer: e.kind,
         strong: e.big,
         approx: e.approx,
         note: e.note,
         sub: e.end ? `${fmt(e.start)} – ${fmt(e.end)}` : undefined,
      }));
      return [...out, ...items.filter((it) => it.layer === 'activity' && it.day === selected)];
   }, [selected, layers, market, items]);

   const byDay = useMemo(() => {
      const map = new Map<string, Item[]>();
      for (const it of items) map.set(it.day, [...(map.get(it.day) ?? []), it]);
      return map;
   }, [items]);

   // Month grid, weeks starting Monday.
   const first = new Date(Date.UTC(y, m - 1, 1));
   const start = addDays(iso(first), -((first.getUTCDay() + 6) % 7));
   const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));

   const nextBig = EVENTS.filter((e) => e.big && e.start >= today && (market === 'all' || !e.markets || e.markets.includes(market))).sort((a, b) =>
      a.start.localeCompare(b.start)
   )[0];
   const upcoming = [...EVENTS]
      .filter((e) => e.start >= today && daysBetween(today, e.start) <= 90 && (market === 'all' || !e.markets || e.markets.includes(market)))
      .sort((a, b) => a.start.localeCompare(b.start));
   const history = mounted
      ? outreach
           .flatMap((o) => (o.thread ?? []).map((t) => ({ t, c: creatorById(o.creatorId) })))
           .filter((x) => x.c)
           .sort((a, b) => b.t.at.localeCompare(a.t.at))
           .slice(0, 8)
      : [];

   const shift = (n: number) => {
      const d = new Date(Date.UTC(y, m - 1 + n, 1));
      setMonth(iso(d).slice(0, 7));
   };

   return (
      <>
         <PageHeader title="Calendar">
            <Button size="icon" variant="ghost" className="size-7" onClick={() => shift(-1)} aria-label="Previous month">
               <ChevronLeft className="size-4" />
            </Button>
            <span className="w-32 text-center text-sm font-medium">{fmt(`${month}-01`, { month: 'long', year: 'numeric' })}</span>
            <Button size="icon" variant="ghost" className="size-7" onClick={() => shift(1)} aria-label="Next month">
               <ChevronRight className="size-4" />
            </Button>
            <Button size="xs" variant="secondary" onClick={() => setMonth(today.slice(0, 7))}>
               Today
            </Button>
         </PageHeader>
         <PageToolbar>
            <Tabs value={market} onValueChange={(v) => setMarket(v as Market | 'all')}>
               <TabsList className="h-7">
                  <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                  {(LIVE_MARKETS as readonly Market[]).map((x) => (
                     <TabsTrigger key={x} value={x} className="text-xs">
                        {MARKET_META[x].flag} {x}
                     </TabsTrigger>
                  ))}
               </TabsList>
            </Tabs>
            <div className="ml-auto flex items-center gap-1">
               {LAYERS.map((l) => {
                  const on = layers.includes(l.id);
                  return (
                     <Button
                        key={l.id}
                        size="xs"
                        variant={on ? 'secondary' : 'ghost'}
                        className={cn(!on && 'text-muted-foreground')}
                        onClick={() => setLayers(on ? layers.filter((x) => x !== l.id) : [...layers, l.id])}
                     >
                        <l.icon className="size-3.5" /> {l.label}
                     </Button>
                  );
               })}
            </div>
         </PageToolbar>

         <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
               {nextBig && (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b px-6 py-3 text-sm">
                     <span>
                        <span className="text-2xl font-semibold tabular-nums">{daysBetween(today, nextBig.start)}</span>
                        <span className="ml-1.5 text-muted-foreground">days until</span> <span className="font-medium">{nextBig.title}</span>
                        <span className="text-muted-foreground"> · {fmt(nextBig.start)}</span>
                     </span>
                     <span className="text-muted-foreground">
                        Reach out by <span className="text-foreground">{fmt(addDays(nextBig.start, -LEAD.outreachDays))}</span>, posts live by{' '}
                        <span className="text-foreground">{fmt(addDays(nextBig.start, -LEAD.postDays))}</span>
                     </span>
                     <Link href="/discover" className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                        Find creators →
                     </Link>
                  </div>
               )}
               <div className="grid grid-cols-7 border-b text-xs text-muted-foreground">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                     <div key={d} className="px-2 py-1.5">{d}</div>
                  ))}
               </div>
               <div className="grid flex-1 grid-cols-7 grid-rows-6">
                  {days.map((d) => {
                     const its = byDay.get(d) ?? [];
                     const inMonth = d.slice(0, 7) === month;
                     return (
                        <button
                           key={d}
                           onClick={() => setSelected(d)}
                           className={cn(
                              'flex min-h-24 flex-col items-stretch justify-start border-r border-b p-1.5 text-left transition-colors last:border-r-0 hover:bg-accent/30',
                              !inMonth && 'opacity-40',
                              d === selected && 'bg-accent/40 ring-1 ring-inset ring-foreground/30'
                           )}
                        >
                           <div className={cn('mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular-nums', d === today && 'bg-foreground font-semibold text-background')}>
                              {Number(d.slice(8))}
                           </div>
                           <div className="flex flex-col gap-0.5">
                              {its.slice(0, 2).map((it) => (
                                 <div
                                    key={it.key}
                                    className={cn(
                                       'flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px]',
                                       it.strong ? 'bg-accent text-foreground' : 'text-muted-foreground',
                                       it.layer === 'activity' && 'text-foreground'
                                    )}
                                 >
                                    <it.icon className="size-3 shrink-0" />
                                    <span className="truncate">{it.label}</span>
                                 </div>
                              ))}
                              {its.length > 2 && <span className="px-1 text-[11px] text-muted-foreground">+{its.length - 2} more</span>}
                           </div>
                        </button>
                     );
                  })}
               </div>
            </div>

            <aside className="hidden w-80 shrink-0 flex-col gap-6 overflow-y-auto border-l p-4 lg:flex">
               <section>
                  <div className="mb-2 flex items-baseline justify-between">
                     <h3 className="text-sm font-medium">
                        {selected === today ? 'Today' : fmt(selected, { weekday: 'long' })}
                        <span className="ml-1.5 font-normal text-muted-foreground">{fmt(selected, { day: 'numeric', month: 'long' })}</span>
                     </h3>
                     {selected !== today && (
                        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelected(today)}>
                           Back to today
                        </button>
                     )}
                  </div>
                  {dayDetails.length === 0 ? (
                     <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">Nothing on this day.</p>
                  ) : (
                     <div className="flex flex-col gap-1.5">
                        {dayDetails.map((it) => {
                           const body = (
                              <div className={cn('rounded-md border px-3 py-2', it.strong && 'border-foreground/30')}>
                                 <div className="flex items-center gap-2 text-sm">
                                    <it.icon className="size-3.5 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0 flex-1 font-medium">{it.label}</span>
                                 </div>
                                 {(it.sub || it.note || it.approx) && (
                                    <div className="mt-0.5 pl-5.5 text-xs text-muted-foreground">
                                       {[it.sub, it.note, it.approx ? 'Estimated date' : ''].filter(Boolean).join(' · ')}
                                    </div>
                                 )}
                              </div>
                           );
                           return it.href ? <Link key={it.key} href={it.href}>{body}</Link> : <div key={it.key}>{body}</div>;
                        })}
                     </div>
                  )}
               </section>
               <section>
                  <h3 className="mb-2 text-sm font-medium">Coming up · 90 days</h3>
                  {upcoming.map((e) => (
                     <button
                        key={e.id}
                        onClick={() => {
                           setSelected(e.start);
                           setMonth(e.start.slice(0, 7));
                        }}
                        className="flex w-full items-center gap-2 border-b border-muted-foreground/5 py-1.5 text-left text-sm last:border-0 hover:text-foreground"
                     >
                        <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{daysBetween(today, e.start)}d</span>
                        <span className={cn('min-w-0 flex-1 truncate', e.big && 'font-medium')}>
                           {e.approx ? '≈ ' : ''}
                           {e.title}
                        </span>
                        <span className="text-xs">{e.markets ? e.markets.map((x) => MARKET_META[x].flag).join('') : ''}</span>
                     </button>
                  ))}
               </section>
               <section>
                  <h3 className="mb-2 text-sm font-medium">Recent activity</h3>
                  {history.length === 0 ? (
                     <p className="text-xs text-muted-foreground">Emails, replies and notes from Outreach show up here and on the calendar.</p>
                  ) : (
                     history.map(({ t, c }) => (
                        <Link key={t.id} href="/outreach" className="block border-b border-muted-foreground/5 py-1.5 text-sm last:border-0 hover:text-foreground">
                           <span className="text-xs text-muted-foreground">{fmt(t.at.slice(0, 10))} · </span>
                           {t.from === 'us' ? `You emailed ${c!.handle}` : t.from === 'them' ? `${c!.handle} replied` : `Note on ${c!.handle}`}
                           {t.amount ? <span className="text-muted-foreground"> · {eurExact(t.amount)}</span> : null}
                        </Link>
                     ))
                  )}
               </section>
               <p className="text-[11px] text-muted-foreground">
                  ≈ means an estimated date: school holidays vary by region and sale dates by retailer. Check before planning.
               </p>
            </aside>
         </div>
      </>
   );
}
