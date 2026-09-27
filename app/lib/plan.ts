import { draft } from '@/components/creators/composer';
import { creatorById } from '@/lib/data/mock';
import type { Creator, OutreachEntry } from '@/lib/data/types';
import { expectedPcs } from '@/lib/engine';
import { campaignRank, learnPlaybook, PAST, type Playbook } from '@/lib/learn';

/** Most past bookings went to repeat partners, so a past partner is someone to book again, not skip. */
export const rebookPartners = () => PAST.rebookShare >= 0.3;
import { campaignParts, drawPart, withDisclosure, type Part } from '@/lib/negotiate';
import { recordMail, useScout } from '@/lib/store';

/**
 * "Find me 5 Finnish Minecraft creators with a €2,000 budget" → a plan the team confirms, then the agent
 * runs every conversation. The budget is split across creators; each creator's limit never exceeds it or
 * their walk-away price, and we open below the limit to leave room to negotiate.
 */

export interface PlanRequest {
   count: number;
   /** Total for everyone, or per creator when the request says "each". */
   budget: number | null;
   each: boolean;
   /** The request without the count and budget words, for the normal filter parser. */
   rest: string;
}

export interface PlanItem {
   creatorId: string;
   offer: number;
   max: number;
   pcs: number;
}

const WANTS_OUTREACH =
   /\b(reach(?:ing)? out|outreach|contact|book|hire|find me|get me|sponsor|collab|negotiate|deal with|campaign|agentic|agent|auto(?:matic(?:ally)?)?|auto-?reach|handle (?:it|this|them|everything)|take care of|end[- ]to[- ]end|for me|email|message|dm|pitch|approach|recruit|sign up|onboard)\b/i;
// Asking the agent to act on its own needs no number: five creators is the default.
const ACT_ALONE = /\b(campaign|agentic|auto(?:matic(?:ally)?)?|auto-?reach|handle (?:it|this|them|everything)|take care of|end[- ]to[- ]end|for me)\b/i;
const COUNT =
   /\b(\d{1,2})\s+(?:[\w-]+\s+){0,4}?(?:creators?|people|persons?|influencers?|youtubers?|tiktokers?|streamers?|channels?|gamers?|guys|ones|accounts|partners)\b/i;
const MONEY = /(?:€\s*(\d[\d\s.,]*)\s*(k)?|(\d[\d\s.,]*)\s*(k)?\s*(?:€|eur\b|euros?))/i;
const BUDGET_WORDS = /\b(?:with (?:a |an )?|total |overall )?budget(?: of)?\b|\bup to\b|\bmax(?:imum)?\b|\bspend\b/gi;

// "budget is 200", "a 1.5k budget": the budget word makes a bare number money.
const BUDGET_NUM = /\bbudget(?:\s+(?:is|of|at|=|:))?\s*(?:about|around|roughly)?\s*(\d[\d.,]*)\s*(k)?(?![\d%])|(\d[\d.,]*)\s*(k)?\s+(?:budget|in total|total|overall|altogether|combined)\b/i;
const TOTAL_FOR = /\b(?:for|across|between) (?:all|the|them all|everyone|all of them)(?: \d{1,2}| (?:together|combined|in total))?\b|\bin total\b|\btotal\b/gi;

const round10 = (n: number) => Math.round(n / 10) * 10;
const num = (s: string, k?: string) => Math.round(parseFloat(s.replace(/[\s.,](?=\d{3}\b)/g, '').replace(',', '.')) * (k ? 1000 : 1));

export function parsePlanRequest(q: string): PlanRequest | null {
   const count = q.match(COUNT);
   const money = q.match(MONEY) ?? q.match(BUDGET_NUM);
   // "Which 3 creators replied?", "who should we book?": questions get an answer, not a campaign.
   const question = /^\s*(did|does|do|has|have|is|are|was|were|how|which|who|what|why|when|should)\b/i.test(q) && !ACT_ALONE.test(q);
   if (question || !WANTS_OUTREACH.test(q) || (!count && !money && !ACT_ALONE.test(q))) return null;
   const budget = money ? num(money[1] ?? money[3], money[2] ?? money[4]) : null;
   const each = /\b(each|per (?:creator|person|post|video|head))\b/i.test(q);
   let rest = q;
   if (count) rest = rest.replace(count[1], ' ');
   if (money) rest = rest.replace(money[0], ' ');
   rest = rest.replace(TOTAL_FOR, ' ').replace(BUDGET_WORDS, ' ').replace(/\b(each|per (?:creator|person|post|video|head))\b/gi, ' ');
   return { count: count ? Math.min(20, Number(count[1])) : 5, budget, each, rest };
}

/** Best-scoring creators we can afford, not already in outreach, off-brand risks left out. */
export function buildPlan(candidates: Creator[], req: PlanRequest, taken: Set<string>, playbook: Playbook = learnPlaybook([])): PlanItem[] {
   const cap = req.budget == null ? Infinity : req.each ? req.budget : req.budget / req.count;
   const out: PlanItem[] = [];
   // The best-scored candidates, reordered by what the agent has learned about who says yes.
   const pool = candidates.slice(0, 40).sort((a, b) => campaignRank(b, playbook) - campaignRank(a, playbook));
   for (const c of pool) {
      if (out.length >= req.count) break;
      if (taken.has(c.id) || (c.pastPartner && !rebookPartners()) || c.sponsorship?.gambling || c.safety?.flags.length) continue;
      // Skip anyone whose usual price is above what we can pay: they'd never say yes.
      if ((playbook.strictPrice ? c.prediction.price[1] : c.prediction.price[0]) > cap) continue;
      // Rounded down, so the limits never add up to more than the budget.
      const max = cap === Infinity ? round10(c.negotiation.walkaway) : Math.floor(Math.min(c.negotiation.walkaway, cap));
      const offer = Math.min(round10(c.negotiation.opener), round10(max * playbook.openRatio));
      out.push({ creatorId: c.id, offer, max, pcs: expectedPcs(c) });
   }
   return out;
}

/** Writes and sends the first email in the creator's language and hands the conversation to the agent. */
export async function startAgentOutreach(o: {
   creatorId: string;
   offer: number;
   max: number;
   pc?: { name: string; retail: number } | null;
   source?: string;
   sim?: Part;
}) {
   const c = creatorById(o.creatorId);
   if (!c) return;
   const now = new Date().toISOString();
   const deliverables = ['video', 'code'];
   const text = withDisclosure(draft(c, c.lang, o.pc ? o.pc.retail : o.offer, deliverables, o.pc ?? null));
   await recordMail({ creatorId: c.id, to: c.agencyEmail ?? c.email ?? c.handle, subject: `Collab: Prenew x ${c.handle}`, body: text });
   const entry: OutreachEntry = {
      creatorId: c.id,
      status: 'sent',
      offer: o.pc ? o.pc.retail : o.offer,
      payment: o.pc ? 'pc' : 'cash',
      deliverables,
      lang: c.lang,
      message: text,
      updatedAt: now,
      thread: [{ id: Math.random().toString(36).slice(2), at: now, from: 'us', text, amount: o.pc ? o.pc.retail : o.offer }],
      agent: true,
      maxBudget: o.max,
      source: o.source ?? 'agent',
      sim: o.sim ?? drawPart(),
   };
   useScout.getState().saveOutreach(entry);
}

/** Sends every first email and hands each conversation to the agent. */
export async function startPlan(items: PlanItem[]) {
   const parts = campaignParts(items.length);
   for (const [i, it] of items.entries()) await startAgentOutreach({ creatorId: it.creatorId, offer: it.offer, max: it.max, sim: parts[i] });
}

export interface PlanEdit {
   total: number | null;
   /** One limit for every creator ("€150 each"). */
   each?: number | null;
   limits: { n: number; amount: number }[];
   remove: number[];
}

const ORDINAL: Record<string, number> = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5 };
const ORD = 'first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th';

/** Rule-based reading of plan edits ("120 for the first guy", "total 700"); merged with the model's reading. */
export function parsePlanEdit(text: string): PlanEdit {
   const t = text.toLowerCase().replace(/(\d)[\s.,](?=\d{3}\b)/g, '$1');
   const total = t.match(/(?:overall|total|combined|whole|all of them)\D{0,25}(\d{2,6})/)?.[1];
   const limits: PlanEdit['limits'] = [];
   for (const m of t.matchAll(new RegExp(`(\\d{2,6})\\s*(?:€|eur|euros?)?\\s*(?:for|to)\\s+(?:the\\s+)?(${ORD})\\b`, 'g')))
      limits.push({ n: ORDINAL[m[2]], amount: Number(m[1]) });
   for (const m of t.matchAll(new RegExp(`\\b(${ORD})\\b\\D{0,25}(\\d{2,6})`, 'g')))
      if (!limits.some((l) => l.n === ORDINAL[m[1]])) limits.push({ n: ORDINAL[m[1]], amount: Number(m[2]) });
   const each = t.match(/(\d{2,6})\s*(?:€|eur|euros?)?\s*(?:each|apiece|per (?:creator|person|head|guy))\b|\b(?:each|per (?:creator|person|head|guy))\D{0,15}(\d{2,6})/);
   const remove = [...t.matchAll(new RegExp(`\\b(?:remove|drop|skip|without)\\s+(?:the\\s+)?(${ORD})\\b`, 'g'))].map((m) => ORDINAL[m[1]]);
   return { total: total ? Number(total) : null, each: each ? Number(each[1] ?? each[2]) : null, limits, remove };
}

/** Rules first, the model fills what they missed (its numbers are already checked against the message). */
export async function readPlanEdit(text: string, handles: string[]): Promise<PlanEdit> {
   const rule = parsePlanEdit(text);
   try {
      const res = await fetch('/api/negotiate', { method: 'POST', body: JSON.stringify({ mode: 'plan-edit', text, creators: handles }) });
      if (!res.ok) return rule;
      const llm = (await res.json()) as PlanEdit;
      return {
         total: rule.total ?? llm.total,
         each: rule.each ?? null,
         limits: [...rule.limits, ...llm.limits.filter((l) => !rule.limits.some((r) => r.n === l.n))],
         remove: [...new Set([...rule.remove, ...llm.remove])],
      };
   } catch {
      return rule;
   }
}

/** Explicit limits win; then everything is scaled down if the new total is lower than the sum. */
export function applyPlanEdit(plan: PlanItem[], e: PlanEdit): PlanItem[] {
   let out = plan.map((p, i) => {
      // A limit for everyone caps each creator; it never raises one above what they're usually worth.
      const walkaway = creatorById(p.creatorId)?.negotiation.walkaway ?? Infinity;
      const amount = e.limits.find((x) => x.n === i + 1)?.amount ?? (e.each != null ? Math.min(e.each, round10(walkaway)) : null);
      return amount != null ? { ...p, max: amount, offer: Math.min(p.offer, round10(amount * 0.8)) } : p;
   });
   out = out.filter((_, i) => !e.remove.includes(i + 1));
   const sum = out.reduce((a, p) => a + p.max, 0);
   if (e.total != null && sum > e.total) {
      const k = e.total / sum;
      out = out.map((p) => {
         const max = Math.floor((p.max * k) / 10) * 10;
         return { ...p, max, offer: Math.min(p.offer, round10(max * 0.8)) };
      });
   }
   return out;
}

/** A follow-up to a pending plan that changes it rather than asking something new. */
export const looksLikePlanEdit = (text: string) =>
   /\d/.test(text) || /\b(remove|drop|skip|limit|budget|instead|cheaper|first|second|third)\b/i.test(text);
