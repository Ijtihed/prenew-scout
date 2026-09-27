import { NextResponse } from 'next/server';
import { chat } from '@/lib/server/llm';

const LANG: Record<string, string> = { fi: 'Finnish', sv: 'Swedish', de: 'German', da: 'Danish', fr: 'French', nl: 'Dutch', pl: 'Polish', en: 'English' };

async function ask(prompt: string, format?: object, tier: 'fast' | 'reason' = 'fast') {
   return chat([{ role: 'user', content: prompt }], { json: format, temperature: format ? 0 : 0.5, tier });
}

const digits = (s: string) => s.replace(/(\d)[\s.,’'](?=\d{3}\b)/g, '$1');

/** First euro amount written in the text, however it's formatted ("1 400 €", "€1,400", "1400e"). */
function amountIn(text: string): number | null {
   const m = digits(text).match(/€\s*(\d{2,6})|(\d{2,6})\s*(?:€|eur\b|euro|e\b)/i);
   return m ? Number(m[1] ?? m[2]) : null;
}

const READ = {
   type: 'object',
   properties: {
      intent: { type: 'string', enum: ['accept', 'counter', 'decline', 'question', 'other'] },
      amount: { type: ['number', 'null'] },
   },
   required: ['intent', 'amount'],
};

/**
 * Two jobs for the local model in a negotiation, never deciding numbers:
 * - read: what the creator's message says (accept / counter / decline / question) and the price they name;
 * - write: our (or the demo creator's) next email, in their language, stating the amount the policy chose.
 */
export async function POST(req: Request) {
   const b = await req.json();
   try {
      if (b.mode === 'read') {
         const text = String(b.text ?? '');
         const out = JSON.parse(
            await ask(
               `A creator replied to a brand's sponsorship offer:\n"""${text}"""\n\nWhat do they do: accept the offer as is, counter with another price, decline, ask a question, or other? If they name a price in euros, give it as a number, otherwise null.`,
               READ
            )
         ) as { intent: string; amount: number | null };
         // A price only counts if it's actually written in the message.
         const written = amountIn(text);
         const amount = out.amount != null && digits(text).includes(String(Math.round(out.amount))) ? Math.round(out.amount) : written;
         return NextResponse.json({ intent: out.intent, amount });
      }
      if (b.mode === 'write') {
         const lang = LANG[b.lang] ?? 'English';
         const eur = b.amount != null ? `€${b.amount}` : null;
         const tasks: Record<string, string> = {
            counter: `Politely counter at ${eur}. Keep the tone warm and keen to work together.`,
            final: `Say ${eur} is the most Prenew can do for this, warmly, and ask if that works.`,
            accept: `Accept their price of ${eur} and say we'll send the details and the code.`,
            confirm: `Confirm the deal at ${eur} and say we'll send the details and the code.`,
            answer: `Answer their question briefly (one Short with their personal discount code, posted within a few weeks) and restate our offer of ${eur}.`,
            walk: `Thank them and say we can't go above our budget this time, leaving the door open for later.`,
            'creator-counter': `You are the creator. Say the offer is a bit low and ask for ${eur} instead.`,
            'creator-accept': `You are the creator. Accept ${eur} happily and ask what they need from you.`,
            'creator-decline': `You are the creator. Say it's too low for you and decline politely.`,
            'creator-pass': `You are the creator. Thank them, but say you aren't taking sponsorships right now and decline politely.`,
         };
         const who = b.role === 'creator' ? `a gaming creator (${b.creator}) replying to Prenew` : `Prenew (refurbished gaming PCs) writing to the creator ${b.creator}`;
         const text = (
            await ask(
               `Write a short email reply (2 to 4 sentences) in ${lang}, as ${who}. Deal: ${b.deliverables}.\n` +
                  (b.theirMessage ? `Their last message:\n"""${b.theirMessage}"""\n` : '') +
                  `Task: ${tasks[b.action] ?? tasks.answer}\nNo subject line, no placeholders, no markdown. Sign off as ${b.role === 'creator' ? b.creator : 'Prenew'}.`
            )
         ).trim();
         // The amount the policy chose must be in the message, whatever the model wrote.
         const safe = eur && !digits(text).includes(String(b.amount)) ? `${text}\n\n(${eur})` : text;
         return NextResponse.json({ text: safe });
      }
      if (b.mode === 'plan-edit') {
         const text = String(b.text ?? '');
         const creators = (b.creators as string[]).map((h, i) => `${i + 1}. ${h}`).join('\n');
         const out = JSON.parse(
            await ask(
               `A marketer is editing a planned outreach list:\n${creators}\n\nTheir message:\n"""${text}"""\n\nReturn the changes: a new overall budget in euros (or null), per-creator limits in euros by list number, and list numbers to remove. Only use numbers written in the message.`,
               {
                  type: 'object',
                  properties: {
                     total: { type: ['number', 'null'] },
                     limits: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, amount: { type: 'number' } }, required: ['n', 'amount'] } },
                     remove: { type: 'array', items: { type: 'integer' } },
                  },
                  required: ['total', 'limits', 'remove'],
               },
               'reason'
            )
         ) as { total: number | null; limits: { n: number; amount: number }[]; remove: number[] };
         // Any amount the model returns must be written in the message.
         const written = new Set((digits(text).match(/\d{2,6}/g) ?? []).map(Number));
         return NextResponse.json({
            total: out.total != null && written.has(Math.round(out.total)) ? Math.round(out.total) : null,
            limits: out.limits.filter((l) => written.has(Math.round(l.amount))).map((l) => ({ n: l.n, amount: Math.round(l.amount) })),
            remove: out.remove ?? [],
         });
      }
      return NextResponse.json({ error: 'mode must be read, write or plan-edit' }, { status: 400 });
   } catch {
      return new Response('No language model is reachable. Add a Featherless key to .env or start `ollama serve`.', { status: 503 });
   }
}
