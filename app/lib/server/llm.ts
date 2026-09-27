import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * One way to call a language model. DeepSeek on Featherless (OpenAI-compatible API) when a key is set in the
 * repo's .env; the local Ollama model otherwise, and as the fallback whenever the hosted call fails, so the
 * app keeps working offline. Models only read and write text here: every number comes from our own formulas.
 *
 * Two tiers: `reason` (DeepSeek V4-Flash with medium thinking, ~5-10 s) for the Agent and anything that needs judgement;
 * `fast` (DeepSeek V3, answers directly in seconds) for writing and reading text.
 */

const ROOT = path.resolve(process.cwd(), '..');

function fromEnvFile(key: string): string | undefined {
   try {
      const line = readFileSync(path.join(ROOT, '.env'), 'utf8')
         .split('\n')
         .find((l) => l.startsWith(`${key}=`));
      const v = line?.slice(key.length + 1).trim();
      return v || undefined;
   } catch {
      return undefined;
   }
}

// Read on every call so a key pasted into .env works without restarting the server.
const key = () => process.env.FEATHERLESS_API_KEY || fromEnvFile('FEATHERLESS_API_KEY');
export type Tier = 'fast' | 'reason';
const MODELS: Record<Tier, string> = { fast: 'deepseek-ai/DeepSeek-V3-0324', reason: 'deepseek-ai/DeepSeek-V4-Flash' };
// V4-Flash with thinking on matched V4-Pro on multi-step budget questions in about a third of the time
// (5-8 s vs 16-18 s); without thinking it got them wrong. Reasoning tokens count toward max_tokens.
const BUDGET: Record<Tier, { maxTokens: number; timeoutMs: number; effort?: 'low' | 'medium' | 'high' }> = {
   fast: { maxTokens: 1500, timeoutMs: 60_000 },
   reason: { maxTokens: 6000, timeoutMs: 90_000, effort: 'medium' },
};
const effort = (tier: Tier) => (BUDGET[tier].effort ? { reasoning_effort: BUDGET[tier].effort } : {});
const hostedModel = (tier: Tier) => MODELS[tier];
// Featherless sits behind Cloudflare, which refuses requests without a user agent it recognises.
const HEADERS = () => ({ Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json', 'User-Agent': 'prenew-scout/1.0' });
const OLLAMA = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const LOCAL = process.env.OLLAMA_MODEL ?? 'qwen3:8b';
const FEATHERLESS = 'https://api.featherless.ai/v1/chat/completions';

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

/** Which model answers right now (for logs and the UI). */
export const modelName = (tier: Tier = 'fast') => (key() ? hostedModel(tier) : LOCAL);

/** Reasoning models wrap thoughts in <think>; JSON sometimes arrives in a code fence. */
function clean(text: string, json: boolean) {
   let t = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
   if (json) {
      t = t.replace(/^```(?:json)?\s*|\s*```$/g, '');
      const a = t.indexOf('{');
      const b = t.lastIndexOf('}');
      if (a >= 0 && b > a) t = t.slice(a, b + 1);
   }
   return t;
}

async function hosted(messages: Msg[], o: { json?: object; temperature: number; timeoutMs: number; tier: Tier }) {
   const msgs = o.json
      ? [...messages, { role: 'system' as const, content: `Reply with one JSON object only, matching this JSON schema:\n${JSON.stringify(o.json)}` }]
      : messages;
   const res = await fetch(FEATHERLESS, {
      method: 'POST',
      signal: AbortSignal.timeout(Math.max(o.timeoutMs, BUDGET[o.tier].timeoutMs)),
      headers: HEADERS(),
      body: JSON.stringify({ model: hostedModel(o.tier), messages: msgs, temperature: o.temperature, max_tokens: BUDGET[o.tier].maxTokens, ...effort(o.tier) }),
   });
   if (!res.ok) throw new Error(`featherless ${res.status}: ${(await res.text()).slice(0, 200)}`);
   const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
   return clean(data.choices?.[0]?.message?.content ?? '', !!o.json);
}

async function local(messages: Msg[], o: { json?: object; temperature: number; timeoutMs: number }) {
   const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      signal: AbortSignal.timeout(o.timeoutMs),
      body: JSON.stringify({ model: LOCAL, stream: false, think: false, format: o.json, options: { temperature: o.temperature }, messages }),
   });
   if (!res.ok) throw new Error(`local model ${res.status}`);
   const data = (await res.json()) as { message?: { content?: string } };
   return clean(data.message?.content ?? '', !!o.json);
}

/** A complete answer. With `json`, the answer is a JSON string matching that schema. */
export async function chat(messages: Msg[], opts: { json?: object; temperature?: number; timeoutMs?: number; tier?: Tier } = {}) {
   const o = { json: opts.json, temperature: opts.temperature ?? 0.3, timeoutMs: opts.timeoutMs ?? 60_000, tier: opts.tier ?? ('fast' as Tier) };
   if (key()) {
      try {
         return await hosted(messages, o);
      } catch (e) {
         console.warn(`hosted model failed, using the local one: ${String(e).slice(0, 160)}`);
      }
   }
   return local(messages, o);
}

/** A streamed answer as plain text chunks (for the Agent chat). */
export async function chatStream(messages: Msg[], temperature = 0.3, tier: Tier = 'reason'): Promise<ReadableStream<Uint8Array>> {
   const enc = new TextEncoder();
   const dec = new TextDecoder();
   if (key()) {
      try {
         const res = await fetch(FEATHERLESS, {
            method: 'POST',
            headers: HEADERS(),
            body: JSON.stringify({ model: hostedModel(tier), messages, temperature, stream: true, max_tokens: BUDGET[tier].maxTokens, ...effort(tier) }),
         });
         if (res.ok && res.body) {
            const reader = res.body.getReader();
            let buf = '';
            let thinking = false;
            return new ReadableStream<Uint8Array>({
               // Keep reading until there's answer text to hand on: a reasoning model sends many chunks of
               // thinking first, and returning from pull() without enqueueing anything can stall the stream.
               async pull(ctrl) {
                  for (;;) {
                     const { done, value } = await reader.read();
                     if (done) return ctrl.close();
                     buf += dec.decode(value, { stream: true });
                     const lines = buf.split('\n');
                     buf = lines.pop() ?? '';
                     let sent = false;
                     for (const line of lines) {
                        const l = line.trim();
                        if (!l.startsWith('data:') || l === 'data: [DONE]') continue;
                        try {
                           // Only the answer is shown; a reasoning model's thinking arrives separately in `reasoning`.
                           let piece = (JSON.parse(l.slice(5)) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content ?? '';
                           if (piece.includes('<think>')) thinking = true;
                           if (thinking) {
                              if (!piece.includes('</think>')) continue;
                              piece = piece.split('</think>')[1] ?? '';
                              thinking = false;
                           }
                           if (piece) {
                              ctrl.enqueue(enc.encode(piece));
                              sent = true;
                           }
                        } catch {
                           /* keep-alive or partial line */
                        }
                     }
                     if (sent) return;
                  }
               },
               cancel() {
                  reader.cancel();
               },
            });
         }
      } catch (e) {
         console.warn(`hosted stream failed, using the local one: ${String(e).slice(0, 160)}`);
      }
   }
   const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({ model: LOCAL, stream: true, think: false, options: { temperature }, messages }),
   });
   if (!res.ok || !res.body) throw new Error(`local model ${res.status}`);
   const reader = res.body.getReader();
   let buf = '';
   return new ReadableStream<Uint8Array>({
      async pull(ctrl) {
         const { done, value } = await reader.read();
         if (done) return ctrl.close();
         buf += dec.decode(value, { stream: true });
         const lines = buf.split('\n');
         buf = lines.pop() ?? '';
         for (const line of lines) {
            if (!line.trim()) continue;
            const chunk = JSON.parse(line) as { message?: { content?: string } };
            if (chunk.message?.content) ctrl.enqueue(enc.encode(chunk.message.content));
         }
      },
      cancel() {
         reader.cancel();
      },
   });
}
