'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChartPie, Check, MoreHorizontal, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreatorAvatar, ProfileLink } from '@/components/creators/creator-avatar';
import { AgentStats } from '@/components/outreach/agent-stats';
import { ASSUMPTIONS, creatorById } from '@/lib/data/mock';
import type { Creator, Lang, OutreachEntry } from '@/lib/data/types';
import { eur, eurExact } from '@/lib/format';
import { recordMail, useHydrated, useProfitPerPc, useScout, useUi } from '@/lib/store';
import { cn } from '@/lib/utils';

const lastOf = (o: OutreachEntry) => [...(o.thread ?? [])].reverse().find((t) => t.from !== 'note');

/** Where a conversation stands, read from the emails rather than set by hand (deal/declined are marked). */
function stage(o: OutreachEntry): 'drafted' | 'waiting' | 'reply' | 'deal' | 'declined' {
   if (o.status === 'deal' || o.status === 'declined') return o.status;
   const last = lastOf(o);
   if (!last) return 'drafted';
   return last.from === 'them' ? 'reply' : 'waiting';
}

/** Their latest email arrived after you last opened the conversation. */
function isUnread(o: OutreachEntry): boolean {
   const last = lastOf(o);
   return stage(o) === 'reply' && !!last && (!o.readAt || o.readAt < last.at);
}

const STAGE_LABEL = { drafted: 'Draft', waiting: 'Waiting for reply', reply: 'Needs your reply', deal: 'Deal', declined: 'Declined' };

/** First euro amount in an email ("1400€", "€1 400", "1,400 EUR"). */
function amountIn(text: string): number | null {
   const m = text.match(/€\s*(\d[\d\s.,]*)|(\d[\d\s.,]*)\s*(?:€|eur|euro)/i);
   if (!m) return null;
   const n = parseFloat((m[1] ?? m[2]).trim().replace(/[\s.,](?=\d{3}\b)/g, '').replace(',', '.'));
   return Number.isFinite(n) && n >= 20 ? Math.round(n) : null;
}

const subjectFor = (c: Creator) => `Collab: Prenew x ${c.handle}`;
const time = (iso: string) => {
   const d = new Date(iso);
   const days = Math.floor((Date.now() - d.getTime()) / 86400000);
   return days < 1
      ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : days < 7
        ? `${days}d`
        : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export default function OutreachPage() {
   const mounted = useHydrated();
   const all = useScout((s) => s.outreach);
   const outreach = mounted ? all : [];
   const [selId, setSelId] = useState<string | null>(null);
   const markRead = useScout((s) => s.markRead);
   const [statsView, setStatsView] = useState<'shown' | 'hidden' | 'wide'>('shown');
   // Remembered per browser; storage can be unavailable (private windows), so it's only a convenience.
   useEffect(() => {
      try {
         const v = localStorage.getItem('outreach:stats');
         if (v === 'hidden' || v === 'wide') setStatsView(v);
      } catch {
         /* keep the default */
      }
   }, []);
   const setStats = (v: 'shown' | 'hidden' | 'wide') => {
      setStatsView(v);
      try {
         localStorage.setItem('outreach:stats', v);
      } catch {
         /* not remembered */
      }
   };
   const statsOpen = statsView !== 'hidden';
   const showStats = (open: boolean) => setStats(open ? 'shown' : 'hidden');

   // One list: conversations waiting on you first, then everything else newest first.
   const list = [...outreach].sort((a, b) => {
      const ua = stage(a) === 'reply' ? 1 : 0;
      const ub = stage(b) === 'reply' ? 1 : 0;
      return ub - ua || (lastOf(b)?.at ?? b.updatedAt).localeCompare(lastOf(a)?.at ?? a.updatedAt);
   });
   const unread = list.filter(isUnread).length;
   const sel = list.find((o) => o.creatorId === selId) ?? list[0];
   const selUnread = sel ? isUnread(sel) : false;
   useEffect(() => {
      if (sel && selUnread) markRead(sel.creatorId);
   }, [sel, selUnread, markRead]);

   return (
      <>
         <PageHeader title="Outreach">
            {!statsOpen && outreach.length > 0 && (
               <Button size="xs" variant="ghost" className="hidden xl:inline-flex" onClick={() => showStats(true)}>
                  <ChartPie className="size-3.5" /> Agent stats
               </Button>
            )}
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Placeholder: mailbox sync is not connected yet">
               <RefreshCw className="size-3" /> Synced with your inbox
            </span>
         </PageHeader>
         {outreach.length === 0 && mounted ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
               <p>No conversations yet. Ask the Agent to reach out to creators, or press Reach out on any creator.</p>
               <Button size="sm" variant="secondary" asChild>
                  <Link href="/agent">Open the Agent</Link>
               </Button>
            </div>
         ) : (
            <div className="flex min-h-0 flex-1">
               <div className="flex w-80 shrink-0 flex-col border-r">
                  <div className="flex h-9 items-center justify-between border-b px-3 text-xs text-muted-foreground">
                     <span>All conversations</span>
                     {unread > 0 && <span className="text-foreground">{unread} unread</span>}
                  </div>
                  <div className="flex-1 overflow-y-auto">
                     {list.map((o) => (
                        <InboxRow
                           key={o.creatorId}
                           o={o}
                           active={o.creatorId === sel?.creatorId}
                           onClick={() => {
                              setSelId(o.creatorId);
                              if (statsView === 'wide') setStats('shown');
                           }}
                        />
                     ))}
                  </div>
               </div>
               {/* Expanded, the stats take the conversation's place (on screens wide enough to show them). */}
               <div className={cn('flex min-w-0 flex-1', statsView === 'wide' && 'xl:hidden')}>
                  {sel ? <Thread key={sel.creatorId} o={sel} /> : <div className="flex-1" />}
               </div>
               {statsOpen && (
                  <AgentStats outreach={outreach} onClose={() => showStats(false)} expanded={statsView === 'wide'} onExpand={(on) => setStats(on ? 'wide' : 'shown')} />
               )}
            </div>
         )}
      </>
   );
}

function InboxRow({ o, active, onClick }: { o: OutreachEntry; active: boolean; onClick: () => void }) {
   const c = creatorById(o.creatorId);
   if (!c) return null;
   const last = lastOf(o);
   const unread = isUnread(o);
   return (
      <button
         onClick={onClick}
         className={cn('flex w-full gap-2.5 border-b border-muted-foreground/5 px-3 py-2.5 text-left hover:bg-sidebar/50', active && 'bg-accent/40')}
      >
         <CreatorAvatar c={c} className="mt-0.5 size-7 text-[10px]" />
         <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm">
               {unread && <span className="size-1.5 shrink-0 rounded-full bg-foreground" />}
               <span className={cn('truncate', unread ? 'font-semibold' : 'font-medium')}>{c.agency ?? c.handle}</span>
               {o.source && <Zap className="size-3 shrink-0 text-muted-foreground" aria-label="Started by the agent" />}
               <span className="ml-auto shrink-0 text-xs text-muted-foreground">{time(last?.at ?? o.updatedAt)}</span>
            </div>
            <div className="truncate text-xs">{subjectFor(c)}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
               <span className="min-w-0 flex-1 truncate">
                  {last ? `${last.from === 'us' ? 'You: ' : ''}${last.text.replace(/\s+/g, ' ')}` : 'Not sent yet'}
               </span>
               {stage(o) !== 'reply' && (
                  <span className={cn('shrink-0 rounded border px-1 text-[10px]', stage(o) === 'deal' && 'border-good/40 text-good')}>
                     {{ drafted: 'Draft', waiting: 'Sent', deal: 'Deal', declined: 'Declined', reply: '' }[stage(o)]}
                  </span>
               )}
            </div>
         </div>
      </button>
   );
}

const COUNTER: Record<Lang, (h: string, amount: string) => string> = {
   fi: (h, a) => `Moi ${h}!\n\nKiitos vastauksesta. Pystymme tarjoamaan ${a} yhdestä videosta ja alennuskoodista. Sopisiko tämä?\n\nTerveisin,\nPrenew`,
   sv: (h, a) => `Hej ${h}!\n\nTack för svaret. Vi kan erbjuda ${a} för en video med rabattkod. Fungerar det?\n\nVänliga hälsningar,\nPrenew`,
   de: (h, a) => `Hey ${h}!\n\nDanke für deine Antwort. Wir können ${a} für ein Video mit Rabattcode anbieten. Passt das?\n\nViele Grüße,\nPrenew`,
   da: (h, a) => `Hej ${h}!\n\nTak for svaret. Vi kan tilbyde ${a} for én video med rabatkode. Passer det?\n\nMange hilsner,\nPrenew`,
   fr: (h, a) => `Salut ${h} !\n\nMerci pour ta réponse. On peut proposer ${a} pour une vidéo avec ton code promo. Ça te va ?\n\nÀ bientôt,\nPrenew`,
   nl: (h, a) => `Hoi ${h}!\n\nBedankt voor je reactie. We kunnen ${a} bieden voor één video met kortingscode. Is dat oké?\n\nGroeten,\nPrenew`,
   pl: (h, a) => `Cześć ${h}!\n\nDzięki za odpowiedź. Możemy zaproponować ${a} za jeden film z kodem rabatowym. Pasuje?\n\nPozdrawiamy,\nPrenew`,
   en: (h, a) => `Hi ${h}!\n\nThanks for getting back to us. We can offer ${a} for one video with your discount code. Would that work?\n\nBest,\nPrenew`,
};

function Thread({ o }: { o: OutreachEntry }) {
   const c = creatorById(o.creatorId)!;
   const profit = useProfitPerPc();
   const { addToThread, setStatus, removeOutreach, setPostDate, setAgent } = useScout();
   const openComposer = useUi((s) => s.openComposer);
   const [reply, setReply] = useState('');
   const working = useUi((u) => u.agentStatus[o.creatorId]);
   const [manual, setManual] = useState<null | 'them' | 'note'>(null);
   const [manualText, setManualText] = useState('');
   const s = stage(o);
   const to = c.agencyEmail ?? c.email ?? '';

   // What Scout read from their emails.
   const theirAsk =
      [...(o.thread ?? [])]
         .reverse()
         .map((t) => (t.from === 'them' ? (t.amount ?? amountIn(t.text)) : null))
         .find((x) => x) ?? null;
   const ourOffer = o.offer;
   const pcs = ASSUMPTIONS.pcOffers.map((p) => ({ ...p, cost: p.retail - profit }));
   const pcFit = theirAsk ? [...pcs].reverse().find((p) => p.cost <= c.negotiation.walkaway && p.retail >= theirAsk * 0.8) : undefined;
   const counter = theirAsk ? Math.round(Math.min(c.negotiation.walkaway, (ourOffer + theirAsk) / 2) / 10) * 10 : null;

   const max = o.maxBudget ?? c.negotiation.walkaway;

   async function send(text: string) {
      if (!text.trim() || !to) return;
      if (!(await recordMail({ creatorId: o.creatorId, to, subject: `Re: ${subjectFor(c)}`, body: text }))) {
         toast('Could not send, try again');
         return;
      }
      addToThread(o.creatorId, { from: 'us', text: text.trim(), amount: amountIn(text) ?? undefined });
      setReply('');
      toast('Sent');
   }

   return (
      <div className="flex min-w-0 flex-1 flex-col">
         <div className="flex items-center gap-3 border-b px-6 py-3">
            <div className="min-w-0 flex-1">
               <div className="truncate text-sm font-medium">{subjectFor(c)}</div>
               <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {STAGE_LABEL[s]} · <ProfileLink c={c} label={false} />
               </div>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground" title="The agent answers their replies and negotiates up to your limit">
               <Switch checked={!!o.agent} onCheckedChange={(v) => setAgent(o.creatorId, v, o.maxBudget ?? max)} />
               Agent
            </label>
            {o.agent && (
               <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  up to €
                  <Input
                     type="number"
                     step={10}
                     value={max}
                     onChange={(e) => setAgent(o.creatorId, true, Number(e.target.value) || 0)}
                     className="h-7 w-20 text-xs"
                     aria-label="Highest we'll go"
                  />
               </div>
            )}
            {s !== 'deal' && s !== 'drafted' && (
               <Button size="xs" variant="secondary" onClick={() => setStatus(o.creatorId, 'deal')}>
                  <Check className="size-3.5" /> Mark as deal
               </Button>
            )}
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="size-7" aria-label="More">
                     <MoreHorizontal className="size-4" />
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => openComposer(c.id)}>Change offer</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setManual('them')}>Add a reply that didn’t sync</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setManual('note')}>Add internal note</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {s === 'deal' && <DropdownMenuItem onClick={() => setStatus(o.creatorId, 'replied')}>Undo deal</DropdownMenuItem>}
                  <DropdownMenuItem onClick={() => setStatus(o.creatorId, 'declined')}>Mark as declined</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => removeOutreach(o.creatorId)} className="text-bad">
                     Delete conversation
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
         </div>

         <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
            {(theirAsk || s === 'deal') && (
               <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-2.5 text-sm">
                  <Sparkles className="size-3.5 text-muted-foreground" />
                  {theirAsk && (
                     <span>
                        They asked <b className="tabular-nums">{eurExact(theirAsk)}</b>
                        <span className="text-muted-foreground">
                           {' '}
                           · you offered {eurExact(ourOffer)} · typical for them {eurExact(c.negotiation.ask)}
                        </span>
                     </span>
                  )}
                  {s === 'deal' && (
                     <label className="flex items-center gap-2">
                        <span className="text-muted-foreground">Post goes live</span>
                        <input
                           type="date"
                           value={o.postDate ?? ''}
                           onChange={(e) => setPostDate(o.creatorId, e.target.value || undefined)}
                           className="bg-transparent outline-none [color-scheme:dark]"
                        />
                     </label>
                  )}
                  {s === 'reply' && counter && (
                     <span className="ml-auto flex gap-1.5">
                        <Button size="xs" variant="secondary" onClick={() => setReply(COUNTER[o.lang](c.handle, eurExact(counter)))}>
                           Counter at {eur(counter)}
                        </Button>
                        {pcFit && (
                           <Button
                              size="xs"
                              variant="secondary"
                              onClick={() => setReply(COUNTER[o.lang](c.handle, `a ${pcFit.name} (worth ${eurExact(pcFit.retail)})`))}
                           >
                              Offer a PC instead
                           </Button>
                        )}
                     </span>
                  )}
               </div>
            )}

            {s === 'drafted' && (
               <Email from="You (draft)" to={to} at={o.updatedAt} dashed>
                  {o.message}
                  {!o.agent && (
                     <div className="mt-3">
                        <Button size="xs" onClick={() => openComposer(c.id)}>
                           Review and send
                        </Button>
                     </div>
                  )}
               </Email>
            )}
            {(o.thread ?? []).map((t) =>
               t.from === 'note' ? (
                  <div key={t.id} className="text-center text-xs text-muted-foreground">
                     {t.text}
                  </div>
               ) : (
                  <Email
                     key={t.id}
                     from={t.from === 'us' ? (t.by === 'agent' ? 'Agent for Prenew' : 'You') : `${c.agency ?? c.handle} <${to}>`}
                     to={t.from === 'us' ? to : 'you'}
                     at={t.at}
                     tag={t.by === 'agent' ? 'Agent' : t.simulated ? 'Simulated' : undefined}
                  >
                     {t.text}
                  </Email>
               )
            )}
            {working && <div className="animate-pulse text-center text-xs text-muted-foreground">{working}</div>}
         </div>

         {manual && (
            <div className="border-t px-6 py-3">
               <div className="mb-1.5 text-xs text-muted-foreground">{manual === 'them' ? 'Paste their reply' : 'Internal note'}</div>
               <Textarea value={manualText} onChange={(e) => setManualText(e.target.value)} className="min-h-16 text-sm" />
               <div className="mt-2 flex justify-end gap-2">
                  <Button size="xs" variant="ghost" onClick={() => setManual(null)}>
                     Cancel
                  </Button>
                  <Button
                     size="xs"
                     disabled={!manualText.trim()}
                     onClick={() => {
                        addToThread(o.creatorId, {
                           from: manual,
                           text: manualText.trim(),
                           amount: manual === 'them' ? (amountIn(manualText) ?? undefined) : undefined,
                        });
                        setManualText('');
                        setManual(null);
                     }}
                  >
                     Add
                  </Button>
               </div>
            </div>
         )}

         {o.agent && s !== 'deal' && s !== 'declined' && !manual && (
            <div className="flex items-center gap-3 border-t px-6 py-3 text-sm">
               <span className="flex-1 text-muted-foreground">
                  The agent is handling this conversation, up to €{max.toLocaleString('en-US')}.
               </span>
               <Button size="xs" variant="secondary" onClick={() => setAgent(o.creatorId, false)}>
                  Take over
               </Button>
            </div>
         )}

         {s !== 'drafted' && !manual && !(o.agent && s !== 'deal' && s !== 'declined') && (
            <div className="border-t px-6 py-3">
               <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={`Reply to ${c.agency ?? c.handle}…`}
                  className="min-h-20 text-sm"
                  onKeyDown={(e) => {
                     if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(reply);
                  }}
               />
               <div className="mt-2 flex items-center justify-end gap-2">
                  <span className="mr-auto text-xs text-muted-foreground">To {to}</span>
                  <Button size="xs" variant="ghost" onClick={() => navigator.clipboard?.writeText(reply)} disabled={!reply.trim()}>
                     Copy
                  </Button>
                  <Button size="xs" onClick={() => send(reply)} disabled={!reply.trim() || !to}>
                     Send
                  </Button>
               </div>
            </div>
         )}
      </div>
   );
}

function Email({ from, to, at, children, dashed, tag }: { from: string; to: string; at: string; children: React.ReactNode; dashed?: boolean; tag?: string }) {
   return (
      <div className={cn('rounded-lg border px-4 py-3 text-sm', dashed && 'border-dashed')}>
         <div className="mb-2 flex items-baseline gap-2 text-xs">
            <span className="font-medium text-foreground">{from}</span>
            {tag && <span className="rounded border px-1 text-[10px] text-muted-foreground">{tag}</span>}
            <span className="text-muted-foreground">to {to || 'no email found'}</span>
            <span className="ml-auto text-muted-foreground">
               {new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
         </div>
         <div className="whitespace-pre-wrap">{children}</div>
      </div>
   );
}
