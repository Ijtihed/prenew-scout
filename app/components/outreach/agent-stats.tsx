'use client';

import { useState } from 'react';
import { Maximize2, Minimize2, Monitor, Sparkles, X } from 'lucide-react';
import { creatorById } from '@/lib/data/mock';
import type { OutreachEntry } from '@/lib/data/types';
import { expectedPcs } from '@/lib/engine';
import { eurExact as eur } from '@/lib/format';
import { learnPlaybook, outcomeOf, PAST, type Outcome } from '@/lib/learn';
import { cn } from '@/lib/utils';

const PARTS: { key: Outcome; label: string; color: string; hint: string }[] = [
   { key: 'deal', label: 'Deal', color: 'var(--good)', hint: 'Agreed within the limit' },
   { key: 'too-expensive', label: 'Too expensive', color: 'var(--bad)', hint: 'Asked for more than the limit' },
   { key: 'not-interested', label: 'Not interested', color: 'color-mix(in oklch, var(--muted-foreground) 70%, transparent)', hint: 'Turned the offer down' },
   { key: 'open', label: 'In progress', color: 'color-mix(in oklch, var(--muted-foreground) 25%, transparent)', hint: 'Still negotiating' },
];

const R = 54;
const STROKE = 12;
const C = 2 * Math.PI * R;
// A small surface gap between segments keeps neighbouring colours apart.
const GAP = 3;

function Ring({ counts, hitRate, big }: { counts: Record<Outcome, number>; hitRate: number | null; big?: boolean }) {
   const [hover, setHover] = useState<Outcome | null>(null);
   const total = PARTS.reduce((a, p) => a + counts[p.key], 0);
   let at = 0;
   const segs = PARTS.filter((p) => counts[p.key] > 0).map((p) => {
      const len = (counts[p.key] / total) * C;
      const s = { ...p, start: at, len };
      at += len;
      return s;
   });
   const h = PARTS.find((p) => p.key === hover);
   return (
      <div className={cn('relative mx-auto', big ? 'size-56' : 'size-40')}>
         <svg viewBox="0 0 140 140" className="size-full -rotate-90" role="img" aria-label={`Hit rate ${hitRate == null ? 'not yet known' : `${Math.round(hitRate * 100)}%`}`}>
            <circle cx="70" cy="70" r={R} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
            {segs.map((s) => (
               <circle
                  key={s.key}
                  cx="70"
                  cy="70"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hover === s.key ? STROKE + 4 : STROKE}
                  strokeDasharray={`${Math.max(0.5, s.len - (segs.length > 1 ? GAP : 0))} ${C}`}
                  strokeDashoffset={-s.start}
                  className="cursor-default transition-[stroke-width] duration-150"
                  onMouseEnter={() => setHover(s.key)}
                  onMouseLeave={() => setHover(null)}
               />
            ))}
         </svg>
         <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {h ? (
               <>
                  <span className="text-2xl font-semibold tabular-nums">{counts[h.key]}</span>
                  <span className="text-xs text-muted-foreground">{h.label.toLowerCase()}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{Math.round((counts[h.key] / total) * 100)}% of all</span>
               </>
            ) : (
               <>
                  <span className="text-3xl font-semibold tabular-nums">{hitRate == null ? '–' : `${Math.round(hitRate * 100)}%`}</span>
                  <span className="text-xs text-muted-foreground">hit rate</span>
               </>
            )}
         </div>
      </div>
   );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** A thin 0-100% bar. */
function Bar({ value, className = 'bg-foreground' }: { value: number; className?: string }) {
   return (
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
         <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
      </div>
   );
}

function Lesson({ title, children, caption }: { title: string; children: React.ReactNode; caption: string }) {
   return (
      <div className="flex flex-col gap-2 rounded-lg border px-3 py-2.5">
         <div className="text-xs font-medium">{title}</div>
         {children}
         <div className="text-[11px] leading-snug text-muted-foreground">{caption}</div>
      </div>
   );
}

/** How the agent is doing across all conversations, and what it has learned from them. */
export function AgentStats({ outreach, onClose, expanded, onExpand }: { outreach: OutreachEntry[]; onClose: () => void; expanded: boolean; onExpand: (on: boolean) => void }) {
   const p = learnPlaybook(outreach);
   const counts = { deal: p.deals, 'too-expensive': p.tooExpensive, 'not-interested': p.notInterested, open: p.open };
   const pcs = outreach.filter((o) => outcomeOf(o) === 'deal').reduce((a, o) => {
      const c = creatorById(o.creatorId);
      return a + (c ? expectedPcs(c) : 0);
   }, 0);
   const limits = p.spent + p.saved;
   const settled = outreach.filter((o) => outcomeOf(o) !== 'open');
   const rounds = Math.round(p.roundsToDeal ?? 0);
   const kinds: [string, number][] = [
      ['Agency', p.yes.agency],
      ['Direct', p.yes.direct],
      ['TikTok', p.yes.tiktok],
      ['YouTube', p.yes.youtube],
   ];
   return (
      <aside className={cn('hidden flex-col gap-5 overflow-y-auto border-l px-5 py-4 xl:flex', expanded ? 'min-w-0 flex-1 px-8 py-6' : 'w-80 shrink-0')}>
         <div className="flex items-center justify-between">
            <span className={cn('font-medium text-muted-foreground', expanded ? 'text-sm' : 'text-xs')}>Agent performance</span>
            <div className="flex items-center gap-0.5">
               <button
                  onClick={() => onExpand(!expanded)}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={expanded ? 'Shrink agent performance' : 'Expand agent performance'}
                  title={expanded ? 'Shrink' : 'Expand'}
               >
                  {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
               </button>
               <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Hide agent performance" title="Hide">
                  <X className="size-3.5" />
               </button>
            </div>
         </div>
         <div className={cn(expanded ? 'grid grid-cols-[20rem_minmax(0,1fr)] items-start gap-10' : 'flex flex-col gap-5')}>
            <div className="flex flex-col gap-5">
               <Ring counts={counts} hitRate={p.hitRate} big={expanded} />
               <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  {PARTS.map((x) => (
                     <li key={x.key} className="flex items-center gap-2" title={x.hint}>
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: x.color }} />
                        <span className="flex-1 truncate">{x.label}</span>
                        <span className="tabular-nums text-muted-foreground">{counts[x.key]}</span>
                     </li>
                  ))}
               </ul>

               <div className="flex flex-col gap-2 border-t pt-4">
                  <div className="flex items-baseline justify-between text-xs">
                     <span className="text-muted-foreground">Spent on deals</span>
                     <span className="tabular-nums">
                        <span className="font-medium">{eur(p.spent)}</span>
                        <span className="text-muted-foreground"> of {eur(limits)} allowed</span>
                     </span>
                  </div>
                  <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
                     {limits > 0 && <div className="h-full rounded-l-full bg-foreground" style={{ width: `${(p.spent / limits) * 100}%` }} title={`Paid ${eur(p.spent)}`} />}
                     {p.saved > 0 && <div className="h-full rounded-r-full bg-good" style={{ width: `${(p.saved / limits) * 100}%` }} title={`Saved ${eur(p.saved)}`} />}
                  </div>
                  <div className="flex gap-3 text-[11px] text-muted-foreground">
                     <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-foreground" /> Paid</span>
                     <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-good" /> Saved {eur(p.saved)}</span>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5 rounded-lg border px-3 py-2.5">
                     <span className="text-[11px] text-muted-foreground">Messages to close</span>
                     <div className="flex items-center gap-1" aria-label={`${p.roundsToDeal?.toFixed(1) ?? 'no'} messages on average`}>
                        {Array.from({ length: 5 }, (_, i) => (
                           <span key={i} className={`size-2.5 rounded-full ${i < rounds ? 'bg-foreground' : 'bg-muted'}`} />
                        ))}
                     </div>
                     <span className="text-sm font-medium tabular-nums">{p.roundsToDeal == null ? '–' : p.roundsToDeal.toFixed(1)}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 rounded-lg border px-3 py-2.5">
                     <span className="text-[11px] text-muted-foreground">PCs expected</span>
                     <Monitor className="size-4 text-muted-foreground" />
                     <span className="text-sm font-medium tabular-nums">{pcs ? pcs.toFixed(1) : '–'}</span>
                  </div>
               </div>
            </div>
            <div className={cn('flex flex-col gap-3', !expanded && 'border-t pt-4')}>
               <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles className="size-3.5" /> What the agent has learned
               </div>
               <div className={cn(expanded ? 'grid grid-cols-1 gap-3 2xl:grid-cols-2' : 'flex flex-col gap-3')}>
                  <Lesson title="Books proven partners again" caption={`${pct(PAST.rebookShare)} of Prenew's ${PAST.bookings} past bookings were repeat partners.`}>
                     <Bar value={PAST.rebookShare} />
                  </Lesson>

                  <Lesson title="Looks for creators like past bookings" caption="Campaigns rank creators that match these higher.">
                     <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
                        <div className="h-full bg-foreground" style={{ width: `${PAST.tiktokShare * 100}%` }} />
                        <div className="h-full flex-1 bg-muted-foreground/40" />
                     </div>
                     <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>TikTok {pct(PAST.tiktokShare)}</span>
                        <span>YouTube {pct(1 - PAST.tiktokShare)}</span>
                     </div>
                     <div className="flex flex-wrap gap-1">
                        {PAST.topGames.slice(0, 3).map((g) => (
                           <span key={g} className="rounded border px-1.5 py-0.5 text-[11px]">{g}</span>
                        ))}
                     </div>
                  </Lesson>

                  <Lesson
                     title="Opening offer"
                     caption={p.closeAt == null || p.deals < 2 ? 'Opens at 80% of the limit until two deals show where prices settle.' : `Deals close at ${pct(p.closeAt)} of the limit, so it now opens at ${pct(p.openRatio)}.`}
                  >
                     <div className="relative my-1 h-1.5 w-full rounded-full bg-muted">
                        <div className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/40" style={{ width: `${p.openRatio * 100}%` }} />
                        <Marker at={p.openRatio} hollow />
                        {p.closeAt != null && <Marker at={Math.min(1, p.closeAt)} />}
                     </div>
                     <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                           <span className="size-2.5 rounded-full border-2 border-foreground bg-background" /> Opens {pct(p.openRatio)}
                        </span>
                        {p.closeAt != null && (
                           <span className="flex items-center gap-1">
                              <span className="size-2.5 rounded-full bg-foreground" /> Closes {pct(p.closeAt)}
                           </span>
                        )}
                        <span className="ml-auto">of limit</span>
                     </div>
                  </Lesson>

                  {settled.length > 0 && (
                     <Lesson
                        title="Asked for more than the limit"
                        caption={p.strictPrice ? `${p.tooExpensive} of ${p.settled}, so campaigns now skip creators whose usual price is above the limit.` : `${p.tooExpensive} of ${p.settled} so far.`}
                     >
                        <div className="flex flex-wrap gap-1">
                           {settled.map((o) => {
                              const out = outcomeOf(o);
                              return (
                                 <span
                                    key={o.creatorId}
                                    title={`${creatorById(o.creatorId)?.handle ?? o.creatorId}: ${PARTS.find((x) => x.key === out)!.label}`}
                                    className="size-3 rounded-sm"
                                    style={{ background: out === 'too-expensive' ? 'var(--bad)' : out === 'deal' ? 'var(--good)' : 'var(--muted)' }}
                                 />
                              );
                           })}
                        </div>
                     </Lesson>
                  )}

                  <Lesson title="Who says yes" caption="Starts at 20% for everyone and updates with every result; campaigns favour the kinds that say yes.">
                     <div className="flex flex-col gap-1.5">
                        {kinds.map(([k, v]) => (
                           <div key={k} className="flex items-center gap-2 text-[11px]">
                              <span className="w-14 text-muted-foreground">{k}</span>
                              <Bar value={v} className={v > 0.2 ? 'bg-good' : 'bg-foreground'} />
                              <span className="w-8 text-right tabular-nums">{pct(v)}</span>
                           </div>
                        ))}
                     </div>
                  </Lesson>
               </div>
            </div>
         </div>
      </aside>
   );
}

function Marker({ at, hollow }: { at: number; hollow?: boolean }) {
   return (
      <div
         className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground ${hollow ? 'z-10 bg-background' : 'bg-foreground'}`}
         style={{ left: `${at * 100}%` }}
      />
   );
}
