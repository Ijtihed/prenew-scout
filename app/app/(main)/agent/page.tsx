'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUp, Bot, Megaphone, RotateCcw, Star } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreatorsList } from '@/components/creators/creators-list';
import { ActiveFilters, activeCount, applyFilters, DEFAULT_FILTERS, type Filters } from '@/components/creators/filters';
import { CREATORS, MARKET_META, creatorById } from '@/lib/data/mock';
import { expectedPcs } from '@/lib/engine';
import type { Creator, OutreachEntry } from '@/lib/data/types';
import { mergeLlm, parseQuery } from '@/lib/nlq';
import { applyPlanEdit, buildPlan, looksLikePlanEdit, parsePlanRequest, readPlanEdit, rebookPartners, startPlan, type PlanItem } from '@/lib/plan';
import { learnPlaybook, type Playbook } from '@/lib/learn';
import { breakEven, useProfitPerPc, useScout } from '@/lib/store';
import { cn } from '@/lib/utils';

interface Turn {
   role: 'user' | 'assistant';
   content: string;
   filters?: Filters;
   shortlist?: Creator[];
   total?: number;
   error?: boolean;
   /** What the agent is doing while the answer is still empty ("Searching creators…"). */
   step?: string;
   /** Planned outreach waiting for a yes, then run by the agent. */
   plan?: PlanItem[];
   planState?: 'pending' | 'started' | 'cancelled' | 'replaced';
   planBudget?: { total: number | null; each: boolean };
}

const EXAMPLES = [
   'Find 5 rising Minecraft creators in Finland under €300',
   'Who should we book for Black Friday in Sweden? Shooter creators, no agency',
   'Cheap German Fortnite TikTokers with lots of views',
   'Hidden gems in the Nordics for a new market push',
   'Reach out to 3 Swedish shooter creators, €600 in total',
];

/** Later messages refine earlier ones: fields the new message mentions replace the old ones. */
function refine(prev: Filters, next: Filters): Filters {
   const pick = <T,>(a: T[], b: T[]) => (b.length ? b : a);
   return {
      ...prev,
      markets: pick(prev.markets, next.markets),
      platforms: pick(prev.platforms, next.platforms),
      tiers: pick(prev.tiers, next.tiers),
      games: next.games.length || next.genres.length ? next.games : prev.games,
      genres: next.games.length || next.genres.length ? next.genres : prev.genres,
      maxPrice: next.maxPrice ?? prev.maxPrice,
      minViews: next.minViews ?? prev.minViews,
      gemsOnly: prev.gemsOnly || next.gemsOnly,
      directOnly: prev.directOnly || next.directOnly,
      sort: next.sort !== 'score' ? next.sort : prev.sort,
      text: next.text || prev.text,
      sponsored: prev.sponsored || next.sponsored,
      competitor: prev.competitor || next.competitor,
      likeId: next.likeId ?? prev.likeId,
      minFollowers: next.minFollowers ?? prev.minFollowers,
      maxFollowers: next.maxFollowers ?? prev.maxFollowers,
   };
}

/** Questions about the team's own work (replies, deals, saved…) are answered from the workspace, not a search. */
const ABOUT_WORKSPACE = /\b(repl(y|ied|ies)|answered|waiting|outreach|conversations?|deals?|negotiat\w*|saved|approved|declined|contacted|emailed|inbox|asked for|follow[- ]?up)\b/i;

const eur = (n: number) => `€${Math.round(n).toLocaleString('en-US')}`;

/** Why a shortlisted creator can't be in the campaign, or null if they can. */
function skipReason(c: Creator, perCreator: number, taken: Set<string>) {
   if (taken.has(c.id)) return 'already in outreach';
   if (c.pastPartner && !rebookPartners()) return 'past partner';
   if (c.sponsorship?.gambling || c.safety?.flags.length) return 'brand-safety risk';
   if (c.prediction.price[0] > perCreator) return `usually charges ${eur(c.prediction.price[1])}`;
   return null;
}

/** Turns a shortlist into a campaign: how many, the most per creator, and a live preview before the plan. */
function CampaignSetup({ creators, taken, playbook, onPlan, onCancel }: { creators: Creator[]; taken: Set<string>; playbook: Playbook; onPlan: (plan: PlanItem[], perCreator: number) => void; onCancel: () => void }) {
   const prices = creators.map((c) => c.prediction.price[1]).sort((a, b) => a - b);
   // Default: enough for everyone listed to say yes. Cheaper creators still stop at their own usual maximum.
   const [count, setCount] = useState(Math.min(5, creators.length));
   const [perCreator, setPerCreator] = useState(Math.ceil(Math.max(...creators.map((c) => c.negotiation.walkaway)) / 10) * 10);
   const plan = buildPlan(creators, { count, budget: perCreator, each: true, rest: '' }, taken, playbook);
   const total = plan.reduce((a, p) => a + p.max, 0);
   const pcs = plan.reduce((a, p) => a + p.pcs, 0);
   const skipped = creators.map((c) => ({ c, why: skipReason(c, perCreator, taken) })).filter((x) => x.why);
   return (
      <div className="flex flex-col gap-3 border-t bg-accent/20 px-4 py-3 text-sm">
         <div className="font-medium">Create a campaign from this list</div>
         <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-muted-foreground">
               Creators
               <Input type="number" min={1} max={creators.length} value={count} onChange={(e) => setCount(Math.max(1, Math.min(creators.length, Number(e.target.value) || 1)))} className="h-8 w-16" />
            </label>
            <label className="flex items-center gap-2 text-muted-foreground">
               Most per creator (€)
               <Input type="number" min={50} step={10} value={perCreator} onChange={(e) => setPerCreator(Math.max(0, Number(e.target.value) || 0))} className="h-8 w-24" />
            </label>
            <span className="text-xs text-muted-foreground">
               Their usual prices: {eur(prices[0])}–{eur(prices[prices.length - 1])}
            </span>
         </div>
         <div className="text-muted-foreground">
            Each creator: one sponsored Short with a discount code and tracked link, first email in their language. The agent opens
            below the limit and negotiates up to it.
         </div>
         <div>
            {plan.length ? (
               <>
                  <span className="font-medium">
                     {plan.length} creator{plan.length > 1 ? 's' : ''}, {eur(total)} at most in total
                  </span>
                  <span className="text-muted-foreground"> · about {pcs.toFixed(1)} PCs expected</span>
               </>
            ) : (
               <span className="text-bad">Nobody fits at {eur(perCreator)} per creator. Raise the limit.</span>
            )}
            {skipped.length > 0 && (
               <div className="mt-1 text-xs text-muted-foreground">
                  Left out: {skipped.map((x) => `${x.c.handle} (${x.why})`).join(', ')}
               </div>
            )}
         </div>
         <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onCancel}>
               Cancel
            </Button>
            <Button size="sm" disabled={!plan.length} onClick={() => onPlan(plan, perCreator)}>
               Preview plan
            </Button>
         </div>
      </div>
   );
}

function PlanCard({ plan, state, onConfirm, onCancel }: { plan: PlanItem[]; state: NonNullable<Turn['planState']>; onConfirm: () => void; onCancel: () => void }) {
   const total = plan.reduce((a, p) => a + p.max, 0);
   return (
      <div className="overflow-hidden rounded-lg border">
         <div className="flex items-center border-b px-4 py-2 text-xs text-muted-foreground">
            <span className="flex-1">Creator</span>
            <span className="w-24 text-right">First offer</span>
            <span className="w-24 text-right">Agent’s limit</span>
            <span className="w-24 text-right">Likely PCs</span>
         </div>
         {plan.map((p) => {
            const c = creatorById(p.creatorId)!;
            return (
               <div key={p.creatorId} className="flex items-center gap-2 border-b border-muted-foreground/5 px-4 py-2 text-sm last:border-0">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                     <span className="truncate font-medium">{c.handle}</span>
                     <span className="text-xs">{MARKET_META[c.market].flag}</span>
                     <span className="truncate text-xs text-muted-foreground">{c.games[0]} · {c.platform === 'tiktok' ? 'TikTok' : 'YouTube'}</span>
                  </span>
                  <span className="w-24 text-right tabular-nums">€{p.offer.toLocaleString('en-US')}</span>
                  <span className="w-24 text-right tabular-nums">€{p.max.toLocaleString('en-US')}</span>
                  <span className="w-24 text-right tabular-nums text-muted-foreground">~{p.pcs.toFixed(1)}</span>
               </div>
            );
         })}
         <div className="flex items-center gap-2 border-t px-4 py-2.5">
            <span className="mr-auto text-xs text-muted-foreground">At most €{total.toLocaleString('en-US')} in total</span>
            {state === 'pending' ? (
               <>
                  <Button size="xs" variant="ghost" onClick={onCancel}>
                     Cancel
                  </Button>
                  <Button size="xs" onClick={onConfirm}>
                     Yes, start outreach
                  </Button>
               </>
            ) : state === 'started' ? (
               <Link href="/outreach" className="text-xs text-muted-foreground hover:text-foreground">
                  Started · watch it in Outreach →
               </Link>
            ) : (
               <span className="text-xs text-muted-foreground">{state === 'replaced' ? 'Replaced by the updated plan below' : 'Cancelled'}</span>
            )}
         </div>
      </div>
   );
}

/** "Who…", "find…", "show me…" open a new question instead of narrowing the last one. */
const FRESH = /^\s*(who|which|find|show|list|search|give|get|look for|any|what about)\b/i;

/** Everything the team has done in Scout, so the agent can answer "who replied?" or "what did X ask for?". */
function workspaceFor(outreach: OutreachEntry[], saved: string[]) {
   const convos = outreach.slice(0, 25).map((o) => {
      const c = creatorById(o.creatorId);
      const msgs = (o.thread ?? []).filter((t) => t.from !== 'note');
      const last = msgs[msgs.length - 1];
      return {
         creator: c?.handle ?? o.creatorId,
         market: c ? MARKET_META[c.market].name : undefined,
         status: o.status,
         waitingOn: !last ? 'not sent' : last.from === 'them' ? 'us (they replied)' : 'them',
         ourOfferEur: o.offer,
         payment: o.payment,
         postDate: o.postDate,
         updated: o.updatedAt.slice(0, 10),
         lastMessages: msgs.slice(-2).map((t) => ({ from: t.from, date: t.at.slice(0, 10), amountEur: t.amount, text: t.text.slice(0, 300) })),
         notes: (o.thread ?? []).filter((t) => t.from === 'note').map((t) => t.text.slice(0, 200)),
      };
   });
   const group = (pred: (c: (typeof convos)[number]) => boolean) => convos.filter(pred).map((c) => c.creator).join(', ') || 'none';
   const stages = [
      `They replied, we owe an answer: ${group((c) => c.waitingOn.startsWith('us') && c.status !== 'deal' && c.status !== 'declined')}`,
      `Sent, waiting for them: ${group((c) => c.waitingOn === 'them' && c.status !== 'deal' && c.status !== 'declined')}`,
      `Drafts not sent: ${group((c) => c.waitingOn === 'not sent')}`,
      `Deals: ${group((c) => c.status === 'deal')}`,
      `Declined: ${group((c) => c.status === 'declined')}`,
   ].join('\n');
   const pb = learnPlaybook(outreach);
   return `WORKSPACE\nAgent results: hit rate ${pb.hitRate == null ? 'not known yet' : `${Math.round(pb.hitRate * 100)}%`} (${pb.deals} deals, ${pb.tooExpensive} too expensive, ${pb.notInterested} not interested, ${pb.open} in progress)\nWhat the agent has learned: ${pb.notes.join(' ')}\n${stages}\nOutreach conversations: ${JSON.stringify(convos)}\nSaved creators: ${JSON.stringify(
      saved.map((id) => creatorById(id)?.handle).filter(Boolean)
   )}`;
}

const TOTAL_BUDGET = /\b(in total|total|altogether|in all|overall|combination|combo|split|spread|budget of)\b/i;
const AMOUNT = /€\s?(\d[\d.,]*)\s?(k)?|(\d[\d.,]*)\s?(k)?\s?(?:€|eur|euros?)\b/i;

/** "€600 in total": the euros to spend across several creators, if the question names one. */
function totalBudget(q: string) {
   const m = TOTAL_BUDGET.test(q) ? q.match(AMOUNT) : null;
   if (!m) return null;
   const eur = parseFloat((m[1] ?? m[3]).replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')) * (m[2] || m[4] ? 1000 : 1);
   return eur >= 50 && eur <= 100_000 ? eur : null;
}

/** The set of creators that sells the most PCs without going over the budget (0/1 knapsack in whole euros). */
function bestWithin(budget: number, list: Creator[]) {
   const items = list.slice(0, 60).map((c) => ({ c, cost: Math.round(c.prediction.price[1]), pcs: expectedPcs(c) }));
   const B = Math.floor(budget);
   const best = new Float64Array(B + 1);
   const took = items.map(() => new Uint8Array(B + 1));
   items.forEach((it, i) => {
      for (let b = B; b >= it.cost; b--)
         if (best[b - it.cost] + it.pcs > best[b]) {
            best[b] = best[b - it.cost] + it.pcs;
            took[i][b] = 1;
         }
   });
   const pick: Creator[] = [];
   for (let i = items.length - 1, b = B; i >= 0; i--)
      if (took[i][b]) {
         pick.push(items[i].c);
         b -= items[i].cost;
      }
   return pick.reverse();
}

function budgetNote(q: string, all: Creator[]) {
   const budget = totalBudget(q);
   if (!budget) return { pick: [] as Creator[], note: '' };
   const pick = bestWithin(budget, all);
   const cost = pick.reduce((a, c) => a + Math.round(c.prediction.price[1]), 0);
   const pcs = pick.reduce((a, c) => a + expectedPcs(c), 0);
   return {
      pick,
      note: `\nBest mix for €${budget} in total (computed exactly over all ${Math.min(all.length, 60)} matches, most expected PCs sold): ${JSON.stringify(
         pick.map((c) => `${c.handle} (${c.platform === 'tiktok' ? 'TikTok' : 'YouTube'})`)
      )}, costing €${cost} for ${pcs.toFixed(1)} expected PCs. Present this mix as the answer.`,
   };
}

function contextFor(f: Filters, list: Creator[], total: number, profit: number, note = '') {
   const rows = list.map((c) => ({
      handle: c.handle,
      market: MARKET_META[c.market].name,
      platform: c.platform === 'tiktok' ? 'TikTok' : 'YouTube Shorts',
      games: c.games,
      followers: c.followers,
      score: c.score,
      growth7dPct: +c.growth7d.toFixed(1),
      viewsPerPost: [Math.round(c.prediction.views[0]), Math.round(c.prediction.views[2])],
      priceEur: Math.round(c.prediction.price[1]),
      breakEvenPcs: +breakEven(c.prediction.price[1], profit).toFixed(1),
      expectedPcsSold: +expectedPcs(c).toFixed(1),
      agency: c.agency,
      pastPartner: !!c.pastPartner,
      sponsoredShortsRecently: c.sponsorship ? `${c.sponsorship.sponsored} of ${c.sponsorship.checked}` : 'unknown',
      sponsors:
         c.sponsorship?.brands.map((b) =>
            b.name === 'Prenew' ? 'Prenew (us, a past campaign)' : `${b.name} (${b.category === 'pc' ? 'PC seller, competitor' : b.category})`
         ) ?? [],
      commentsInLocalLanguagePct: c.comments?.local ?? null,
      commentsAskingAboutPcsPct: c.comments?.intent ?? null,
      brandSafetyRisks: c.safety ? c.safety.flags.map((x) => `${x.category}: "${x.evidence}"`) : 'not checked yet',
      why: c.helped,
      risks: c.hurt,
   }));
   return `CONTEXT\nFilters: ${JSON.stringify({ ...f, text: undefined })}\nMatching creators: ${total}\nShortlist (best first): ${JSON.stringify(rows)}${note}`;
}

/** **bold**, *italic* and `code` inside one line. An unclosed marker (mid-stream) is hidden until it closes. */
function inline(line: string, key: string) {
   for (const m of ['**', '__']) {
      const at = line.lastIndexOf(m);
      if (line.split(m).length % 2 === 0) line = line.slice(0, at) + line.slice(at + 2);
   }
   const parts = line.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|(?<![\w*])\*[^*\s][^*]*\*(?![\w*]))/g);
   return parts.map((p, i) => {
      const k = `${key}-${i}`;
      if (/^(\*\*|__).+\1$/.test(p)) return <strong key={k} className="font-semibold">{p.slice(2, -2)}</strong>;
      if (/^`.+`$/.test(p)) return <code key={k} className="rounded bg-muted px-1 text-[0.85em]">{p.slice(1, -1)}</code>;
      if (/^\*.+\*$/.test(p)) return <em key={k}>{p.slice(1, -1)}</em>;
      return p;
   });
}

/** The few Markdown pieces models use in chat: emphasis, headings and bullet or numbered lists. */
function Rich({ text }: { text: string }) {
   return (
      <>
         {text.split('\n').map((raw, i) => {
            const heading = raw.match(/^\s*#{1,6}\s+(.*)$/);
            const bullet = raw.match(/^(\s*)[-*•]\s+(.*)$/);
            const numbered = raw.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
            if (/^\s*(-{3,}|\*{3,})\s*$/.test(raw)) return <br key={i} />;
            if (heading) return <div key={i} className="font-semibold">{inline(heading[1], `h${i}`)}</div>;
            if (bullet)
               return (
                  <div key={i} className="flex gap-2" style={{ paddingLeft: bullet[1].length * 6 }}>
                     <span className="text-muted-foreground">•</span>
                     <span>{inline(bullet[2], `b${i}`)}</span>
                  </div>
               );
            if (numbered)
               return (
                  <div key={i} className="flex gap-2" style={{ paddingLeft: numbered[1].length * 6 }}>
                     <span className="text-muted-foreground tabular-nums">{numbered[2]}.</span>
                     <span>{inline(numbered[3], `n${i}`)}</span>
                  </div>
               );
            return <div key={i} className={raw.trim() ? undefined : 'h-3'}>{inline(raw, `p${i}`)}</div>;
         })}
      </>
   );
}

function Thinking({ label }: { label: string }) {
   return (
      <span className="inline-flex items-center gap-2 text-muted-foreground" role="status">
         <span className="flex gap-1" aria-hidden>
            {[0, 150, 300].map((d) => (
               <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d}ms` }} />
            ))}
         </span>
         {label}
      </span>
   );
}

export default function AgentPage() {
   const profit = useProfitPerPc();
   const { saved, toggleSaved, outreach } = useScout();
   const [turns, setTurns] = useState<Turn[]>([]);
   const [input, setInput] = useState('');
   const [busy, setBusy] = useState(false);
   // Which answer's shortlist has the campaign setup open.
   const [setupAt, setSetupAt] = useState<number | null>(null);
   const bottom = useRef<HTMLDivElement>(null);

   useEffect(() => {
      bottom.current?.scrollIntoView({ behavior: 'smooth' });
   }, [turns]);

   async function send(text: string) {
      const q = text.trim();
      if (!q || busy) return;
      setInput('');
      setBusy(true);
      // The question and a "thinking" placeholder show at once; each branch below fills in the placeholder.
      setTurns((ts) => [...ts, { role: 'user', content: q }, { role: 'assistant', content: '', step: 'Reading your request…' }]);
      const step = (label: string) => setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, step: label } : t)));
      const settle = (t: Turn) => setTurns((ts) => [...ts.slice(0, -1), t]);

      // A follow-up to a plan still waiting for a yes changes that plan ("700 overall, 120 for the first…").
      const pending = [...turns].reverse().find((t) => t.plan && t.planState === 'pending');
      if (pending && looksLikePlanEdit(q) && !/\b(find|get) me\b/i.test(q)) {
         const handles = pending.plan!.map((p) => creatorById(p.creatorId)?.handle ?? p.creatorId);
         step('Updating the plan…');
         const edit = await readPlanEdit(q, handles);
         const plan = applyPlanEdit(pending.plan!, edit);
         const total = plan.reduce((a, p) => a + p.max, 0);
         const warnings = plan
            .map((p) => ({ p, c: creatorById(p.creatorId)! }))
            .filter(({ p, c }) => p.max < c.prediction.price[0])
            .map(({ p, c }) => `${c.handle} usually charges about €${Math.round(c.prediction.price[1]).toLocaleString('en-US')}; at €${p.max} they'll probably say no.`);
         const changed = edit.total != null || edit.each != null || edit.limits.length > 0 || edit.remove.length > 0;
         setTurns((ts) => [
            ...ts.slice(0, -1).map((x) => (x === pending && changed ? { ...x, planState: 'replaced' as const } : x)),
            changed
               ? {
                    role: 'assistant',
                    content: `Updated: ${plan.length} creator${plan.length > 1 ? 's' : ''}, €${total.toLocaleString('en-US')} at most in total${edit.total != null ? ` (your limit €${edit.total.toLocaleString('en-US')})` : ''}.${warnings.length ? `\n${warnings.join('\n')}` : ''}\nIs this correct?`,
                    filters: pending.filters,
                    total: plan.length,
                    plan,
                    planState: 'pending',
                    planBudget: pending.planBudget,
                 }
               : { role: 'assistant', content: 'I couldn’t tell what to change. Try e.g. “€700 in total, €120 for the first, €300 for the second”.' },
         ]);
         setBusy(false);
         return;
      }

      // "Yes" / "go ahead" right after a shortlist: open the campaign setup for that list.
      const lastList = turns.length - 1;
      if (/^\s*(yes|yeah|yep|sure|ok(ay)?|do it|go ahead|start( it| outreach)?|let'?s (go|do it)|please( do)?)\b[\s!.]*$/i.test(q) && turns[lastList]?.shortlist?.length && !pending) {
         settle({ role: 'assistant', content: 'Set how many creators and the most per creator below, then preview the plan. Nothing is sent until you confirm it.' });
         setSetupAt(lastList);
         setBusy(false);
         return;
      }

      // "Find me 5 … with a €2,000 budget": propose a plan; nothing is sent until someone says yes.
      const req = parsePlanRequest(q);
      if (req) {
         step('Searching creators…');
         let { filters: f, leftover: rest } = parseQuery(req.rest);
         if (rest.length) {
            try {
               const res = await fetch('/api/parse', { method: 'POST', body: JSON.stringify({ q: req.rest }) });
               if (res.ok) f = mergeLlm(f, await res.json(), req.rest);
            } catch {
               /* keep the rule-based filters */
            }
         }
         const taken = new Set(outreach.map((o) => o.creatorId));
         // "Under €100" without the word budget means at most that per creator, never more.
         const planReq = req.budget == null && f.maxPrice != null ? { ...req, budget: f.maxPrice, each: true } : req;
         step('Building the plan…');
         const plan = buildPlan(applyFilters(CREATORS, { ...f, realOnly: true }), planReq, taken, learnPlaybook(outreach));
         const total = plan.reduce((a, p) => a + p.max, 0);
         const content = plan.length
            ? `Here's the plan: ${plan.length} creator${plan.length > 1 ? 's' : ''}, first emails in their language, and the agent negotiates each one up to its limit (€${total.toLocaleString('en-US')} at most in total${planReq.budget ? `, within your €${planReq.budget.toLocaleString('en-US')}${planReq.each ? ' each' : ''}` : ''}).${planReq.budget ? '' : ' You didn’t set a budget, so each limit is the most that creator is usually worth to us; reply e.g. “€150 each” or “€600 in total” to change it.'} Is this correct?`
            : 'No creators fit that within the budget. Try a bigger budget, fewer creators or a wider search.';
         settle({ role: 'assistant', content, filters: f, total: plan.length, plan, planState: 'pending', planBudget: { total: planReq.budget, each: planReq.each } });
         setBusy(false);
         return;
      }

      const prevFilters = [...turns].reverse().find((t) => t.filters)?.filters ?? DEFAULT_FILTERS;
      step('Searching creators…');
      let { filters: parsed, leftover } = parseQuery(q);
      if (leftover.length) {
         try {
            const res = await fetch('/api/parse', { method: 'POST', body: JSON.stringify({ q }) });
            if (res.ok) parsed = mergeLlm(parsed, await res.json(), q);
         } catch {
            /* keep the rule-based filters */
         }
      }
      const base = FRESH.test(q) ? DEFAULT_FILTERS : prevFilters;
      const filters = activeCount(parsed) || parsed.sort !== 'score' ? refine(base, parsed) : base;
      const all = applyFilters(CREATORS, filters);
      const workspaceQ = ABOUT_WORKSPACE.test(q) && !activeCount(parsed);
      const budget = workspaceQ ? { pick: [], note: '' } : budgetNote(q, all);
      const top = workspaceQ ? [] : all.slice(0, 8);
      const shortlist = [...top, ...budget.pick.filter((c) => !top.includes(c))];
      const history: Turn[] = [...turns, { role: 'user', content: q }];
      settle({ role: 'assistant', content: '', step: 'Thinking…', filters: workspaceQ ? undefined : filters, shortlist, total: all.length });

      try {
         const res = await fetch('/api/agent', {
            method: 'POST',
            body: JSON.stringify({
               messages: [
                  // A new question shouldn't be answered in terms of the previous one.
                  ...(FRESH.test(q) ? [] : history.slice(0, -1).map((t) => ({ role: t.role, content: t.content }))),
                  {
                     role: 'user',
                     content: `${q}\n\n${contextFor(filters, shortlist, all.length, profit, budget.note)}\n\n${workspaceFor(outreach, saved)}`,
                  },
               ],
            }),
         });
         if (!res.ok || !res.body) {
            const msg = await res.text();
            setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, content: msg, error: true } : t)));
            return;
         }
         const reader = res.body.getReader();
         const dec = new TextDecoder();
         for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = dec.decode(value, { stream: true });
            setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, content: t.content + chunk } : t)));
         }
      } catch {
         setTurns((ts) =>
            ts.map((t, i) => (i === ts.length - 1 ? { ...t, content: 'Could not reach the local model. Is Ollama running?', error: true } : t))
         );
      } finally {
         setBusy(false);
      }
   }

   return (
      <>
         <PageHeader title="Agent">
            {turns.length > 0 && (
               <Button size="xs" variant="ghost" onClick={() => setTurns([])}>
                  <RotateCcw className="size-3.5" /> New chat
               </Button>
            )}
         </PageHeader>
         <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto">
               {turns.length === 0 ? (
                  <div className="mx-auto flex max-w-xl flex-col items-center px-6 pt-24 text-center">
                     <Bot className="size-8 text-muted-foreground" />
                     <h1 className="mt-3 text-lg font-semibold">What are you looking for?</h1>
                     <p className="mt-1 text-sm text-muted-foreground">
                        Describe the campaign. The agent searches every creator, shortlists the best matches and explains
                        its picks. Follow-up messages refine the search.
                     </p>
                     <div className="mt-6 flex w-full flex-col gap-1.5">
                        {EXAMPLES.map((e) => (
                           <button key={e} onClick={() => send(e)} className="rounded-md border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent/40 hover:text-foreground">
                              {e}
                           </button>
                        ))}
                     </div>
                  </div>
               ) : (
                  <div className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-6">
                     {turns.map((t, i) =>
                        t.role === 'user' ? (
                           <div key={i} className="max-w-[80%] self-end rounded-lg bg-accent/60 px-3.5 py-2 text-sm">{t.content}</div>
                        ) : (
                           <div key={i} className="flex flex-col gap-3">
                              {t.filters && (
                                 <div className="flex min-h-7 items-center gap-2">
                                    <span className="shrink-0 text-xs text-muted-foreground">Searched for</span>
                                    {activeCount(t.filters) ? (
                                       <ActiveFilters value={t.filters} onChange={() => {}} />
                                    ) : (
                                       <span className="text-xs text-muted-foreground">everyone</span>
                                    )}
                                    <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{t.total} matches</span>
                                 </div>
                              )}
                              <div className={cn('text-sm leading-relaxed', t.error && 'text-bad')}>
                                 {t.content ? <Rich text={t.content} /> : <Thinking label={t.step ?? 'Thinking…'} />}
                              </div>
                              {t.plan && t.plan.length > 0 && (
                                 <PlanCard
                                    plan={t.plan}
                                    state={t.planState ?? 'pending'}
                                    onConfirm={async () => {
                                       setTurns((ts) => ts.map((x) => (x === t ? { ...x, planState: 'started' } : x)));
                                       await startPlan(t.plan!);
                                       toast(`Sent ${t.plan!.length} emails; the agent is negotiating`);
                                    }}
                                    onCancel={() => setTurns((ts) => ts.map((x) => (x === t ? { ...x, planState: 'cancelled' } : x)))}
                                 />
                              )}
                              {t.shortlist && t.shortlist.length > 0 && (
                                 <div className="overflow-hidden rounded-lg border">
                                    <CreatorsList creators={t.shortlist} compact />
                                    <div className="flex items-center gap-2 border-t px-4 py-2">
                                       <Button
                                          size="xs"
                                          variant="ghost"
                                          onClick={() => {
                                             t.shortlist!.forEach((c) => !saved.includes(c.id) && toggleSaved(c.id));
                                             toast(`Saved ${t.shortlist!.length} creators`);
                                          }}
                                       >
                                          <Star className="size-3.5" /> Save all {t.shortlist.length}
                                       </Button>
                                       <Button size="xs" variant="secondary" onClick={() => setSetupAt(setupAt === i ? null : i)}>
                                          <Megaphone className="size-3.5" /> Create campaign
                                       </Button>
                                       <Link
                                          href={`/discover?f=${encodeURIComponent(JSON.stringify(t.filters))}`}
                                          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                                       >
                                          See all {t.total} in Discover →
                                       </Link>
                                    </div>
                                    {setupAt === i && (
                                       <CampaignSetup
                                          creators={t.shortlist}
                                          taken={new Set(outreach.map((o) => o.creatorId))}
                                          playbook={learnPlaybook(outreach)}
                                          onCancel={() => setSetupAt(null)}
                                          onPlan={(plan, perCreator) => {
                                             setSetupAt(null);
                                             const total = plan.reduce((a, p) => a + p.max, 0);
                                             setTurns((ts) => [
                                                ...ts,
                                                { role: 'user', content: `Create a campaign: ${plan.length} creators, up to ${eur(perCreator)} each` },
                                                {
                                                   role: 'assistant',
                                                   content: `Here's the plan: ${plan.length} creator${plan.length > 1 ? 's' : ''}, first emails in their language, and the agent negotiates each one up to its limit (${eur(total)} at most in total, within ${eur(perCreator)} each). Is this correct?`,
                                                   filters: t.filters,
                                                   total: plan.length,
                                                   plan,
                                                   planState: 'pending',
                                                   planBudget: { total: perCreator, each: true },
                                                },
                                             ]);
                                          }}
                                       />
                                    )}
                                 </div>
                              )}
                           </div>
                        )
                     )}
                     <div ref={bottom} />
                  </div>
               )}
            </div>
            <form
               className="border-t p-4"
               onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
               }}
            >
               <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-lg border bg-background/40 p-2 focus-within:border-ring">
                  <textarea
                     value={input}
                     onChange={(e) => setInput(e.target.value)}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                           e.preventDefault();
                           send(input);
                        }
                     }}
                     rows={1}
                     placeholder={turns.length ? 'Refine, e.g. only TikTok, under €200…' : 'Describe the creators you need…'}
                     className="max-h-40 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <Button type="submit" size="icon" className="size-8" disabled={busy || !input.trim()} aria-label="Send">
                     <ArrowUp className="size-4" />
                  </Button>
               </div>
            </form>
         </div>
      </>
   );
}
