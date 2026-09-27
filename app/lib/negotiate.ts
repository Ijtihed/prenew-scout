import type { Creator, OutreachEntry, ThreadItem } from '@/lib/data/types';
import { creatorById } from '@/lib/data/mock';
import { recordMail, useScout, useUi } from '@/lib/store';
import { DELIVERABLES } from '@/components/creators/composer';
import { learnPlaybook } from '@/lib/learn';

/**
 * The negotiation agent. Every number comes from a fixed policy; the local model only reads the creator's
 * message (what they want, what price) and writes our reply in their language.
 */

export type Intent = 'accept' | 'counter' | 'decline' | 'question' | 'other';
export type Move = { action: 'accept' | 'counter' | 'final' | 'confirm' | 'answer' | 'walk'; amount: number };

const round10 = (n: number) => Math.round(n / 10) * 10;

/**
 * Every email the agent sends says it comes from an AI (EU AI Act, Article 50). Fixed text in English,
 * appended in code rather than left to the model, so it can't be dropped or reworded.
 */
export const AI_DISCLOSURE = "This email was written and sent by Prenew's AI assistant on behalf of the Prenew team.";
export const withDisclosure = (text: string) => (text.includes(AI_DISCLOSURE) ? text : `${text.trimEnd()}\n\n${AI_DISCLOSURE}`);

/** Our next move given their latest message. We never go above `max`. */
export function agentMove(o: { ourLast: number; theirAsk: number | null; intent: Intent; max: number; ourRounds: number; concedeRounds?: number }): Move {
   const { ourLast, theirAsk, intent, max, ourRounds, concedeRounds = 2 } = o;
   if (intent === 'decline') return { action: 'walk', amount: ourLast };
   if (intent === 'accept' && (theirAsk == null || theirAsk <= ourLast)) return { action: 'confirm', amount: theirAsk ?? ourLast };
   if (theirAsk == null) return { action: 'answer', amount: ourLast };
   if (theirAsk <= ourLast) return { action: 'accept', amount: theirAsk };
   // Within budget: meet in the middle twice, then take their number.
   if (theirAsk <= max) return ourRounds >= concedeRounds ? { action: 'accept', amount: theirAsk } : { action: 'counter', amount: Math.min(max, round10(ourLast + (theirAsk - ourLast) / 2)) };
   // Above budget: move toward them, then state our maximum once, then walk away.
   if (ourLast >= max) return { action: 'walk', amount: ourLast };
   const next = Math.min(max, round10(ourLast + (theirAsk - ourLast) / 2));
   return next >= max || ourRounds >= concedeRounds ? { action: 'final', amount: max } : { action: 'counter', amount: next };
}

/** The demo creator: a hidden minimum, an opening ask above it, and concessions toward our offer. */
export function creatorMove(o: { ourOffer: number; lastAsk: number | null; floor: number; opening: number; rounds: number; interested: boolean }): {
   intent: Intent;
   amount: number | null;
} {
   const { ourOffer, lastAsk, floor, opening, rounds, interested } = o;
   if (!interested) return { intent: 'decline', amount: null };
   // A first quote is usually a creator's highest, so they open above whatever we offered.
   if (rounds === 0 && ourOffer < opening) return { intent: 'counter', amount: Math.max(opening, round10(ourOffer * 1.4)) };
   if (ourOffer >= floor) return { intent: 'accept', amount: ourOffer };
   if (rounds >= 5) return { intent: 'decline', amount: null };
   const ask = lastAsk ?? opening;
   const next = Math.max(floor, round10(ask - (ask - ourOffer) * 0.35));
   return { intent: 'counter', amount: next };
}

/** Share of agent-run negotiations the simulated creators let end in a deal. */
export const DEAL_RATE = 0.2;
/** Of the rest, the share who turn the offer down outright instead of asking for more than we'll pay. */
const PASS_RATE = 0.35;

export type Part = NonNullable<OutreachEntry['sim']>;
const noDealPart = (): Part => (Math.random() < PASS_RATE ? 'pass' : 'high');

/** One conversation's part, drawn at random. */
export const drawPart = (): Part => (Math.random() < DEAL_RATE ? 'deal' : noDealPart());

/** Parts for a campaign: exactly 20% settle (a fractional remainder is decided by chance), in random order. */
export function campaignParts(n: number): Part[] {
   const exact = n * DEAL_RATE;
   const deals = Math.floor(exact) + (Math.random() < exact - Math.floor(exact) ? 1 : 0);
   const parts: Part[] = Array.from({ length: n }, (_, i) => (i < deals ? 'deal' : noDealPart()));
   for (let i = parts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [parts[i], parts[j]] = [parts[j], parts[i]];
   }
   return parts;
}

/** A stable 0..1 number per creator, for conversations started before parts were assigned. */
function seeded(id: string) {
   let h = 2166136261;
   for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
   return ((h >>> 0) % 10_000) / 10_000;
}

/**
 * Where a simulated creator really stands, given their part: settles within our limit, isn't taking
 * sponsorships, or wants more than we'll pay. One in five settles, so most negotiations end without a deal.
 */
export function demoCreator(c: Creator, max: number, part?: Part) {
   const u = seeded(c.id);
   const p = part ?? (u < DEAL_RATE ? 'deal' : u < DEAL_RATE + PASS_RATE ? 'pass' : 'high');
   const opening = (floor: number) => Math.max(round10(c.negotiation.ask * 1.4), round10(floor * 1.15));
   if (p === 'deal') {
      const floor = Math.min(max, round10(c.negotiation.ask * 1.1));
      return { floor, opening: opening(floor), interested: true };
   }
   if (p === 'pass') return { floor: Infinity, opening: 0, interested: false };
   // Above our limit by 15-60%, so the agent's final offer still falls short.
   const floor = round10(Math.max(max, c.negotiation.ask) * (1.15 + u * 0.45));
   return { floor, opening: opening(floor), interested: true };
}

export const lastOf = (o: OutreachEntry, from: ThreadItem['from']) => [...(o.thread ?? [])].reverse().find((t) => t.from === from);
export const ourLastAmount = (o: OutreachEntry) => [...(o.thread ?? [])].reverse().find((t) => t.from === 'us' && t.amount)?.amount ?? o.offer;
export const agentRounds = (o: OutreachEntry) => (o.thread ?? []).filter((t) => t.by === 'agent').length;

export async function readReply(text: string): Promise<{ intent: Intent; amount: number | null }> {
   const res = await fetch('/api/negotiate', { method: 'POST', body: JSON.stringify({ mode: 'read', text }) });
   if (!res.ok) throw new Error(await res.text());
   return res.json();
}

export async function writeMessage(p: {
   role: 'us' | 'creator';
   lang: string;
   creator: string;
   action: string;
   amount: number | null;
   deliverables: string;
   theirMessage?: string;
}): Promise<string> {
   const res = await fetch('/api/negotiate', { method: 'POST', body: JSON.stringify({ mode: 'write', ...p }) });
   if (!res.ok) throw new Error(await res.text());
   return (await res.json()).text;
}

const lastMessage = (o: OutreachEntry) => [...(o.thread ?? [])].reverse().find((t) => t.from !== 'note');
const done = (o: OutreachEntry) => o.status === 'deal' || o.status === 'declined';
const subject = (c: Creator) => `Collab: Prenew x ${c.handle}`;

/** Conversations the agent should move forward: handed to it, first email sent, not settled. */
export function nextForAgent(): OutreachEntry | undefined {
   return useScout.getState().outreach.find((o) => o.agent && !done(o) && (lastMessage(o) || o.message));
}

/**
 * One turn of an agent-handled conversation. Creator replies are simulated (a creator with a hidden minimum
 * who opens high and concedes); our replies come from the policy above, worded by the local model.
 */
export async function negotiationStep(creatorId: string) {
   const store = useScout.getState();
   const status = (t: string | null) => useUi.getState().setAgentStatus(creatorId, t);
   const e = store.outreach.find((o) => o.creatorId === creatorId);
   const c = creatorById(creatorId);
   if (!e || !c || done(e)) return;
   const last = lastMessage(e);
   const to = c.agencyEmail ?? c.email ?? c.handle;
   // A draft handed to the agent gets sent as it is; the agent takes it from there.
   if (!last) {
      if (!e.message) return;
      status('Agent is sending the first email…');
      const first = withDisclosure(e.message);
      await recordMail({ creatorId, to, subject: subject(c), body: first });
      useScout.getState().addToThread(creatorId, { from: 'us', text: first, amount: e.offer }, 'sent');
      return;
   }
   const deliverables = DELIVERABLES.filter((d) => e.deliverables.includes(d.id)).map((d) => d.text.en).join(', ') || 'one sponsored Short';

   if (last.from === 'us') {
      const { floor, opening, interested } = demoCreator(c, e.maxBudget ?? c.negotiation.walkaway, e.sim);
      const theirs = (e.thread ?? []).filter((t) => t.from === 'them');
      const lastAsk = [...theirs].reverse().find((t) => t.amount)?.amount ?? null;
      const m = creatorMove({ ourOffer: ourLastAmount(e), lastAsk, floor, opening, rounds: theirs.length, interested });
      status(`${c.handle} is replying…`);
      const action = interested ? `creator-${m.intent}` : 'creator-pass';
      const text = await writeMessage({ role: 'creator', lang: e.lang, creator: c.handle, action, amount: m.amount, deliverables, theirMessage: last.text });
      useScout.getState().addToThread(creatorId, { from: 'them', text, amount: m.amount ?? undefined, simulated: true }, 'replied');
      return;
   }

   status('Agent is reading their reply…');
   const read = await readReply(last.text);
   // Past a few rounds the agent states its maximum rather than haggling forever.
   const move = agentMove({ ourLast: ourLastAmount(e), theirAsk: read.amount, intent: read.intent, max: e.maxBudget ?? c.negotiation.walkaway, ourRounds: agentRounds(e), concedeRounds: learnPlaybook(store.outreach).concedeRounds });
   status('Agent is writing…');
   const amount = move.action === 'walk' ? null : move.amount;
   const text = withDisclosure(await writeMessage({ role: 'us', lang: e.lang, creator: c.handle, action: move.action, amount, deliverables, theirMessage: last.text }));
   await recordMail({ creatorId, to, subject: `Re: ${subject(c)}`, body: text });
   const next = move.action === 'accept' || move.action === 'confirm' ? 'deal' : move.action === 'walk' ? 'declined' : 'sent';
   useScout.getState().addToThread(creatorId, { from: 'us', text, amount: amount ?? undefined, by: 'agent' }, next);
}
