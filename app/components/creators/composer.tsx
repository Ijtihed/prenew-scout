'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Creator, Lang, OutreachEntry } from '@/lib/data/types';
import { ASSUMPTIONS, concept, creatorById } from '@/lib/data/mock';
import { compact, eurExact } from '@/lib/format';
import { breakEven, recordMail, useProfitPerPc, useScout, useUi, type ComposerPreset } from '@/lib/store';
import { cn } from '@/lib/utils';

export const DELIVERABLES: { id: string; label: string; mult: number; text: Record<Lang, string> }[] = [
   { id: 'video', label: '1 sponsored post', mult: 1, text: { fi: '1 sponsoroitu video', sv: '1 sponsrad video', de: '1 gesponsertes Video', da: '1 sponsoreret video', fr: '1 vidéo sponsorisée', nl: '1 gesponsorde video', pl: '1 sponsorowany film', en: '1 sponsored video' } },
   { id: 'code', label: 'Discount code', mult: 0, text: { fi: 'oma alennuskoodi seuraajille', sv: 'egen rabattkod till följarna', de: 'eigener Rabattcode für deine Community', da: 'din egen rabatkode til følgerne', fr: 'un code promo perso pour ta communauté', nl: 'een eigen kortingscode voor je volgers', pl: 'własny kod rabatowy dla widzów', en: 'a personal discount code for your audience' } },
   { id: 'link', label: 'Link in bio, 7 days', mult: 0.1, text: { fi: 'linkki biossa 7 päivää', sv: 'länk i bio i 7 dagar', de: 'Link in Bio für 7 Tage', da: 'link i bio i 7 dage', fr: 'lien en bio pendant 7 jours', nl: 'link in bio voor 7 dagen', pl: 'link w bio przez 7 dni', en: 'link in bio for 7 days' } },
   { id: 'second', label: 'Second post', mult: 0.7, text: { fi: 'toinen video', sv: 'en andra video', de: 'ein zweites Video', da: 'en video mere', fr: 'une deuxième vidéo', nl: 'een tweede video', pl: 'drugi film', en: 'a second video' } },
   { id: 'rights', label: 'Ad rights, 30 days', mult: 0.25, text: { fi: 'mainoskäyttöoikeus 30 päivää', sv: 'annonsrättigheter i 30 dagar', de: 'Nutzungsrechte für Ads (30 Tage)', da: 'annonceret i 30 dage', fr: "droits d'usage pub 30 jours", nl: 'advertentierechten 30 dagen', pl: 'prawa do reklam na 30 dni', en: '30-day ad usage rights' } },
];
const LANG_NAME: Record<Lang, string> = { fi: 'Finnish', sv: 'Swedish', de: 'German', da: 'Danish', fr: 'French', nl: 'Dutch', pl: 'Polish', en: 'English' };

export function draft(c: Creator, lang: Lang, offer: number, items: string[], pc: { name: string; retail: number } | null) {
   const hook = concept(lang, c.games[0], c.platform).hook;
   const list = DELIVERABLES.filter((d) => items.includes(d.id)).map((d) => `• ${d.text[lang]}`).join('\n');
   const hi = c.agency
      ? { fi: `Hei ${c.agency}-tiimi`, sv: `Hej ${c.agency}`, de: `Hallo ${c.agency}-Team`, da: `Hej ${c.agency}`, fr: `Bonjour l'équipe ${c.agency}`, nl: `Hoi team ${c.agency}`, pl: `Cześć, zespół ${c.agency}`, en: `Hi ${c.agency} team` }[lang]
      : { fi: `Moi ${c.handle}`, sv: `Hej ${c.handle}`, de: `Hey ${c.handle}`, da: `Hej ${c.handle}`, fr: `Salut ${c.handle}`, nl: `Hoi ${c.handle}`, pl: `Cześć ${c.handle}`, en: `Hi ${c.handle}` }[lang];
   const price = pc
      ? {
           fi: `${pc.name} (arvo ${eurExact(pc.retail)}), joka jää sinulle`,
           sv: `en ${pc.name} (värde ${eurExact(pc.retail)}) som du får behålla`,
           de: `ein ${pc.name} (Wert ${eurExact(pc.retail)}), den du behältst`,
           da: `en ${pc.name} (værdi ${eurExact(pc.retail)}), som du beholder`,
           fr: `un ${pc.name} (valeur ${eurExact(pc.retail)}) que tu gardes`,
           nl: `een ${pc.name} (waarde ${eurExact(pc.retail)}) die je mag houden`,
           pl: `${pc.name} (wartość ${eurExact(pc.retail)}), który zostaje u Ciebie`,
           en: `a ${pc.name} (worth ${eurExact(pc.retail)}) that you keep`,
        }[lang]
      : eurExact(offer);
   const link = { fi: 'Oma seurantalinkkisi', sv: 'Din personliga länk', de: 'Dein persönlicher Link', da: 'Dit personlige link', fr: 'Ton lien perso', nl: 'Je persoonlijke link', pl: 'Twój link', en: 'Your personal link' }[lang];
   // Naming a real recent Short shows we actually watched them; generic openers are what creators ignore.
   const best = [...c.posts.slice(0, 6)]
      .map((p) => ({ ...p, clean: p.title.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim() }))
      .filter((p) => p.clean.length >= 8)
      .sort((a, b) => b.views - a.views)[0];
   const seen = best
      ? {
           fi: `Tykkäsin erityisesti videostasi "${best.clean}" (${compact(best.views)} katselua). `,
           sv: `Jag gillade särskilt din video "${best.clean}" (${compact(best.views)} visningar). `,
           de: `Besonders dein Short "${best.clean}" (${compact(best.views)} Aufrufe) hat uns gefallen. `,
           da: `Især din video "${best.clean}" (${compact(best.views)} visninger) fangede os. `,
           fr: `Ta vidéo "${best.clean}" (${compact(best.views)} vues) nous a particulièrement plu. `,
           nl: `Vooral je video "${best.clean}" (${compact(best.views)} weergaven) viel ons op. `,
           pl: `Szczególnie spodobał nam się Twój film "${best.clean}" (${compact(best.views)} wyświetleń). `,
           en: `Your Short "${best.clean}" (${compact(best.views)} views) really stood out. `,
        }[lang]
      : '';
   const body: Record<Lang, string> = {
      fi: `${hi}!\n\nOlen Prenewiltä. Myymme kunnostettuja pelikoneita ympäri Eurooppaa, ja ${c.games[0]}-videosi osuvat juuri meidän yleisöömme.${seen ? ` ${seen.trim()}` : ''}\n\nIdea: "${hook}"\n\nEhdotus:\n${list}\n\nKorvaus: ${price}\n${link}: ${c.trackedLink}\n\nSopisiko tämä? Joustamme mielellään.\n\nTerveisin,\nPrenew`,
      sv: `${hi}!\n\nJag jobbar på Prenew. Vi säljer renoverade gamingdatorer i hela Europa, och dina ${c.games[0]}-videor träffar precis vår publik.${seen ? ` ${seen.trim()}` : ''}\n\nIdé: "${hook}"\n\nFörslag:\n${list}\n\nErsättning: ${price}\n${link}: ${c.trackedLink}\n\nLåter det bra? Säg till om du vill ändra något.\n\nVänliga hälsningar,\nPrenew`,
      de: `${hi}!\n\nIch bin von Prenew. Wir verkaufen refurbished Gaming-PCs in ganz Europa, und deine ${c.games[0]}-Videos treffen genau unsere Zielgruppe.${seen ? ` ${seen.trim()}` : ''}\n\nIdee: "${hook}"\n\nVorschlag:\n${list}\n\nVergütung: ${price}\n${link}: ${c.trackedLink}\n\nPasst das für dich? Sag gern Bescheid, wenn du etwas anpassen willst.\n\nViele Grüße,\nPrenew`,
      da: `${hi}!\n\nJeg er fra Prenew. Vi sælger istandsatte gaming-PC'er i hele Europa, og dine ${c.games[0]}-videoer rammer præcis vores publikum.${seen ? ` ${seen.trim()}` : ''}\n\nIdé: "${hook}"\n\nForslag:\n${list}\n\nHonorar: ${price}\n${link}: ${c.trackedLink}\n\nLyder det godt? Sig endelig til, hvis du vil ændre noget.\n\nMange hilsner,\nPrenew`,
      fr: `${hi} !\n\nJe fais partie de Prenew. On vend des PC gamer reconditionnés partout en Europe, et tes vidéos ${c.games[0]} parlent pile à notre public.${seen ? ` ${seen.trim()}` : ''}\n\nIdée : "${hook}"\n\nProposition :\n${list}\n\nRémunération : ${price}\n${link} : ${c.trackedLink}\n\nÇa te va ? On peut ajuster si besoin.\n\nÀ bientôt,\nPrenew`,
      nl: `${hi}!\n\nIk werk bij Prenew. We verkopen refurbished gaming-pc's in heel Europa, en je ${c.games[0]}-video's passen perfect bij ons publiek.${seen ? ` ${seen.trim()}` : ''}\n\nIdee: "${hook}"\n\nVoorstel:\n${list}\n\nVergoeding: ${price}\n${link}: ${c.trackedLink}\n\nKlinkt dat goed? We passen het graag aan.\n\nGroeten,\nPrenew`,
      pl: `${hi}!\n\nPiszę z Prenew. Sprzedajemy odnowione komputery do gier w całej Europie, a Twoje filmy z ${c.games[0]} idealnie trafiają do naszych odbiorców.${seen ? ` ${seen.trim()}` : ''}\n\nPomysł: "${hook}"\n\nPropozycja:\n${list}\n\nWynagrodzenie: ${price}\n${link}: ${c.trackedLink}\n\nCo myślisz? Chętnie coś dopasujemy.\n\nPozdrawiamy,\nPrenew`,
      en: `${hi}!\n\nI'm with Prenew. We sell refurbished gaming PCs across Europe, and your ${c.games[0]} videos hit exactly our audience.${seen ? ` ${seen.trim()}` : ''}\n\nIdea: "${hook}"\n\nProposal:\n${list}\n\nFee: ${price}\n${link}: ${c.trackedLink}\n\nDoes this work for you? Happy to adjust anything.\n\nBest,\nPrenew`,
   };
   return body[lang];
}

export function Composer() {
   const { composerId, composerPreset, openComposer } = useUi();
   const c = composerId ? creatorById(composerId) : undefined;
   return (
      <Sheet open={!!c} onOpenChange={(o) => !o && openComposer(null)}>
         <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
            {c && <ComposerBody key={c.id} c={c} preset={composerPreset} onClose={() => openComposer(null)} />}
         </SheetContent>
      </Sheet>
   );
}

function ComposerBody({ c, preset, onClose }: { c: Creator; preset: ComposerPreset | null; onClose: () => void }) {
   const { outreach, saveOutreach } = useScout();
   const profit = useProfitPerPc();
   const existing = outreach.find((o) => o.creatorId === c.id);
   const pcs = ASSUMPTIONS.pcOffers.map((p) => ({ ...p, cost: p.retail - profit }));
   const opener = Math.round(c.negotiation.opener / 10) * 10;
   const [payment, setPayment] = useState<'cash' | 'pc'>(existing?.payment ?? preset?.payment ?? 'cash');
   const [cash, setCash] = useState(
      existing && existing.payment !== 'pc' ? existing.offer : preset?.payment === 'cash' ? preset.amount : opener
   );
   const [pcIndex, setPcIndex] = useState(preset?.pcIndex ?? 1);
   const [items, setItems] = useState<string[]>(existing?.deliverables ?? ['video', 'code']);
   const [lang, setLang] = useState<Lang>(existing?.lang ?? c.lang);
   const [message, setMessage] = useState(existing?.message ?? '');
   const [edited, setEdited] = useState(!!existing?.message);

   const pc = payment === 'pc' ? pcs[pcIndex] : null;
   const cost = pc ? pc.cost : cash;
   const auto = useMemo(() => draft(c, lang, cash, items, pc), [c, lang, cash, items, pc]);
   useEffect(() => {
      if (!edited) setMessage(auto);
   }, [auto, edited]);

   // Agency first, creator in CC when we have both.
   const to = c.agencyEmail ?? c.email ?? '';
   const cc = c.agencyEmail && c.email ? c.email : '';
   const subject = { fi: 'Yhteistyö: Prenew x ', sv: 'Samarbete: Prenew x ', de: 'Kooperation: Prenew x ', da: 'Samarbejde: Prenew x ', fr: 'Partenariat : Prenew x ', nl: 'Samenwerking: Prenew x ', pl: 'Współpraca: Prenew x ', en: 'Collab: Prenew x ' }[lang] + c.handle;
   const views = c.prediction.views[1] * (1 + (items.includes('second') ? 0.9 : 0));

   function save(status: OutreachEntry['status']) {
      const now = new Date().toISOString();
      const thread = existing?.thread ?? [];
      saveOutreach({
         ...existing,
         creatorId: c.id,
         status: existing && existing.status !== 'drafted' ? existing.status : status,
         offer: pc ? pc.retail : cash,
         payment,
         deliverables: items,
         lang,
         message,
         agent: existing?.agent ?? preset?.agent,
         maxBudget: existing?.maxBudget ?? preset?.maxBudget,
         updatedAt: now,
         thread:
            status === 'sent'
               ? [...thread, { id: Math.random().toString(36).slice(2), at: now, from: 'us', text: message, amount: pc ? pc.retail : cash }]
               : thread,
      });
   }

   return (
      <>
         <SheetHeader className="border-b">
            <SheetTitle>Email {c.name}</SheetTitle>
            <SheetDescription className="truncate">
               {to ? (
                  <>
                     To {to}
                     {c.agencyEmail ? ` (${c.agency})` : ''}
                     {cc ? ` · CC ${cc}` : ''}
                  </>
               ) : (
                  'No email found. Copy the message and send it as a DM.'
               )}
            </SheetDescription>
         </SheetHeader>

         <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
               <span className="w-12 text-muted-foreground">Offer</span>
               <div className="flex rounded-md border p-0.5 text-xs">
                  {(['cash', 'pc'] as const).map((m) => (
                     <button
                        key={m}
                        onClick={() => setPayment(m)}
                        className={cn('rounded px-2 py-0.5', payment === m ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
                     >
                        {m === 'cash' ? 'Cash' : 'A PC'}
                     </button>
                  ))}
               </div>
               {payment === 'cash' ? (
                  <div className="flex items-center gap-1">
                     <span className="text-muted-foreground">€</span>
                     <Input type="number" step={10} value={cash} onChange={(e) => setCash(Number(e.target.value) || 0)} className="h-8 w-24" />
                  </div>
               ) : (
                  <select
                     value={pcIndex}
                     onChange={(e) => setPcIndex(Number(e.target.value))}
                     className="h-8 rounded-md border bg-transparent px-2 text-sm outline-none"
                  >
                     {pcs.map((p, i) => (
                        <option key={p.name} value={i} className="bg-popover">
                           {p.name} (worth {eurExact(p.retail)})
                        </option>
                     ))}
                  </select>
               )}
               <span className="text-xs text-muted-foreground">They’ll likely ask {eurExact(c.negotiation.ask)}</span>
            </div>

            <details className="group text-sm">
               <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <span className="w-12" />
                  ~{compact(views)} views · costs Prenew {eurExact(cost)} · pays back after {pcsFmt(breakEven(cost, profit))} PCs
                  <span className="underline decoration-dotted underline-offset-2">details</span>
               </summary>
               <div className="mt-3 ml-14 flex flex-col gap-3">
                  <Payoff views={views} cost={cost} profit={profit} />
                  <div>
                     <div className="mb-1.5 text-xs text-muted-foreground">Included in the offer</div>
                     <div className="flex flex-wrap gap-1.5">
                        {DELIVERABLES.map((d) => {
                           const on = items.includes(d.id);
                           return (
                              <button
                                 key={d.id}
                                 disabled={d.id === 'video'}
                                 onClick={() => setItems(on ? items.filter((x) => x !== d.id) : [...items, d.id])}
                                 className={cn(
                                    'h-7 rounded-md border px-2.5 text-xs',
                                    on ? 'border-foreground/40 bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
                                 )}
                              >
                                 {d.label}
                              </button>
                           );
                        })}
                     </div>
                  </div>
               </div>
            </details>

            <div className="flex min-h-0 flex-1 flex-col">
               <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{subject}</span>
                  <div className="flex rounded-md border p-0.5">
                     {([c.lang, 'en'] as Lang[])
                        .filter((l, i, a) => a.indexOf(l) === i)
                        .map((l) => (
                           <button
                              key={l}
                              onClick={() => setLang(l)}
                              className={cn('rounded px-2 py-0.5', lang === l ? 'bg-accent text-foreground' : 'hover:text-foreground')}
                           >
                              {LANG_NAME[l]}
                           </button>
                        ))}
                  </div>
               </div>
               <Textarea
                  value={message}
                  onChange={(e) => {
                     setMessage(e.target.value);
                     setEdited(true);
                  }}
                  className="min-h-72 flex-1 text-sm leading-relaxed"
               />
               {edited && (
                  <button className="mt-1 self-start text-xs text-muted-foreground hover:text-foreground" onClick={() => setEdited(false)}>
                     Rewrite from the offer
                  </button>
               )}
            </div>
         </div>

         <SheetFooter className="flex-row items-center border-t">
            <Button
               size="sm"
               variant="ghost"
               className="mr-auto"
               onClick={() => {
                  save('drafted');
                  toast('Saved as a draft in Outreach');
                  onClose();
               }}
            >
               Save draft
            </Button>
            <Button
               size="sm"
               variant="secondary"
               onClick={() => {
                  navigator.clipboard?.writeText(message).catch(() => {});
                  toast('Message copied');
                  if (!to) {
                     save('sent');
                     onClose();
                  }
               }}
            >
               Copy
            </Button>
            {to && (
               <Button
                  size="sm"
                  onClick={async () => {
                     if (!(await recordMail({ creatorId: c.id, to, cc: cc || undefined, subject, body: message }))) {
                        toast('Could not send, try again');
                        return;
                     }
                     save('sent');
                     toast('Sent. It’s in Outreach now.');
                     onClose();
                  }}
               >
                  Send email
               </Button>
            )}
         </SheetFooter>
      </>
   );
}

const pcsFmt = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString());

/** Low / typical / high money outcome for the offer (assumed buyers per 10K views). */
function Payoff({ views, cost, profit }: { views: number; cost: number; profit: number }) {
   return (
      <div>
         <div className="mb-1.5 text-xs text-muted-foreground">If the post sells like a low / typical / high collab</div>
         <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border bg-border text-xs">
            {(['Low', 'Typical', 'High'] as const).map((label, i) => {
               const sold = (views * ASSUMPTIONS.buyersPer10k[i]) / 10000;
               const net = sold * profit - cost;
               return (
                  <div key={label} className="bg-container px-2.5 py-2">
                     <div className="text-muted-foreground">{label}</div>
                     <div className="tabular-nums">{pcsFmt(sold)} PCs</div>
                     <div className={cn('tabular-nums', net >= 0 ? 'text-good' : 'text-bad')}>
                        {net >= 0 ? '+' : '−'}
                        {eurExact(Math.abs(net))}
                     </div>
                  </div>
               );
            })}
         </div>
      </div>
   );
}
