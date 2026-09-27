'use client';

import { useMemo } from 'react';
import { ExternalLink, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { CreatorAvatar } from '@/components/creators/creator-avatar';
import { CREATORS, MARKET_META, scoreOf } from '@/lib/data/mock';
import { normalize, PRESETS, RECOMMENDED, SCORE_SOURCES, WEIGHT_LABELS, type Weights } from '@/lib/data/score-presets';
import { useProfitPerPc, useScout, useWeights } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const KEYS = Object.keys(WEIGHT_LABELS) as (keyof Weights)[];
const same = (a: Weights, b: Weights) => KEYS.every((k) => Math.abs(normalize(a)[k] - normalize(b)[k]) < 0.005);

export default function SettingsPage() {
   const w = useWeights();
   const setWeights = useScout((s) => s.setWeights);
   const setProfitPerPc = useScout((s) => s.setProfitPerPc);
   const profit = useProfitPerPc();
   const n = normalize(w);
   const active = PRESETS.find((p) => same(p.weights, w));
   const top = useMemo(
      () => [...CREATORS].map((c) => ({ c, s: scoreOf(c.fit, w) })).sort((a, b) => b.s - a.s).slice(0, 8),
      [w]
   );

   return (
      <>
         <PageHeader title="Settings" />
         <div className="flex min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto grid w-full max-w-5xl gap-8 p-6 lg:grid-cols-[1fr_300px]">
               <div className="flex flex-col gap-6">
                  <section>
                     <h2 className="text-base font-semibold">Score</h2>
                     <p className="mt-1 text-sm text-muted-foreground">
                        How creators are ranked in Discover. Shared by the whole team. We strongly recommend a preset;
                        change the sliders only if a campaign has a clear goal.
                     </p>
                  </section>

                  <div className="grid gap-2 sm:grid-cols-2">
                     {PRESETS.map((p) => (
                        <button
                           key={p.id}
                           onClick={() => setWeights(p.weights)}
                           className={cn(
                              'rounded-lg border p-3 text-left transition-colors hover:bg-accent/40',
                              active?.id === p.id && 'border-foreground/40 bg-accent/40'
                           )}
                        >
                           <div className="flex items-center gap-2 text-sm font-medium">
                              {p.name}
                              {p.id === 'recommended' && (
                                 <span className="rounded bg-foreground px-1.5 text-[10px] text-background">Recommended</span>
                              )}
                           </div>
                           <p className="mt-1 text-xs text-muted-foreground">{p.why}</p>
                        </button>
                     ))}
                  </div>

                  <section className="rounded-lg border">
                     <div className="flex items-center justify-between border-b px-4 py-2.5">
                        <span className="text-sm font-medium">{active ? `${active.name} weights` : 'Custom weights'}</span>
                        <Button size="xs" variant="ghost" onClick={() => setWeights(RECOMMENDED)} disabled={same(w, RECOMMENDED)}>
                           <RotateCcw className="size-3.5" /> Reset to recommended
                        </Button>
                     </div>
                     {KEYS.map((k) => (
                        <div key={k} className="flex items-center gap-4 border-b border-muted-foreground/5 px-4 py-3 last:border-0">
                           <div className="w-52 shrink-0">
                              <div className="text-sm">{WEIGHT_LABELS[k].label}</div>
                              <div className="text-xs text-muted-foreground">{WEIGHT_LABELS[k].help}</div>
                           </div>
                           <Slider
                              className="flex-1"
                              min={0}
                              max={60}
                              step={1}
                              value={[Math.round(n[k] * 100)]}
                              onValueChange={([v]) => setWeights({ ...n, [k]: v / 100 })}
                           />
                           <span className="w-10 text-right text-sm tabular-nums">{Math.round(n[k] * 100)}%</span>
                        </div>
                     ))}
                  </section>

                  <section className="rounded-lg border p-4">
                     <h2 className="text-sm font-medium">Profit per PC</h2>
                     <p className="mt-1 mb-3 text-xs text-muted-foreground">
                        What Prenew earns on one PC after costs. Used for break-even, payoff scenarios and the cost of
                        offering a PC instead of cash.
                     </p>
                     <div className="flex max-w-40 items-center gap-2">
                        <span className="text-muted-foreground">€</span>
                        <Input
                           type="number"
                           min={10}
                           step={10}
                           value={profit}
                           onChange={(e) => setProfitPerPc(Math.max(10, Number(e.target.value) || 0))}
                           className="h-8"
                        />
                     </div>
                  </section>

                  <section className="text-xs text-muted-foreground">
                     <p className="mb-1.5">
                        Why these presets: brands rank audience fit and reputation highest when choosing creators, then
                        engagement, and judge campaigns mainly on return. Reputation is handled by hiding creators who are
                        shrinking or post adult or gambling content. Growth stays high so the ranking keeps moving.
                     </p>
                     {SCORE_SOURCES.map((s) => (
                        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground">
                           <ExternalLink className="size-3" /> {s.label}
                        </a>
                     ))}
                  </section>
               </div>

               <aside>
                  <div className="mb-2 text-sm font-medium">Top 8 with these weights</div>
                  <div className="rounded-lg border">
                     {top.map(({ c, s }, i) => (
                        <div key={c.id} className="flex items-center gap-2.5 border-b border-muted-foreground/5 px-3 py-2 text-sm last:border-0">
                           <span className="w-4 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                           <CreatorAvatar c={c} />
                           <span className="min-w-0 flex-1 truncate">{c.handle}</span>
                           <span className="text-xs">{MARKET_META[c.market].flag}</span>
                           <span className="w-7 text-right tabular-nums">{s}</span>
                        </div>
                     ))}
                  </div>
               </aside>
            </div>
         </div>
      </>
   );
}
