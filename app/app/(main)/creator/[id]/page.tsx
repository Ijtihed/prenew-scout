'use client';

import { use } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreatorAvatar, ProfileLink } from '@/components/creators/creator-avatar';
import { PostPreview } from '@/components/creators/post-preview';
import { KeyNumbers, Properties, Reasons } from '@/components/creators/summary';
import { ViewsOverTime } from '@/components/creators/charts';
import { AudienceInsight, Lookalikes, SafetyInsight, SponsorshipInsight } from '@/components/creators/insights';
import { SaveButton } from '@/components/creators/creators-list';
import { creatorById } from '@/lib/data/mock';
import { compact, daysAgo, eurExact, pct, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Creator } from '@/lib/data/types';
import { useProfitPerPc, useScout, useUi } from '@/lib/store';
import { useMounted } from '@/hooks/use-mounted';

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
   return (
      <section className="rounded-lg border p-4">
         <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium">{title}</h3>
            {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
         </div>
         {children}
      </section>
   );
}

export default function CreatorPage({ params }: { params: Promise<{ id: string }> }) {
   const { id } = use(params);
   const c = creatorById(id);
   const mounted = useMounted();
   const { compare, toggleCompare } = useScout();
   const openComposer = useUi((s) => s.openComposer);

   if (!c) {
      return (
         <>
            <PageHeader title="Creator" />
            <div className="p-10 text-center text-sm text-muted-foreground">
               Creator not found. It may not be crawled yet.{' '}
               <Link href="/discover" className="underline">
                  Back to Discover
               </Link>
            </div>
         </>
      );
   }
   const n = c.negotiation;
   const inCompare = mounted && compare.includes(c.id);

   return (
      <>
         <PageHeader
            title={
               <>
                  <Link href="/discover" className="text-muted-foreground hover:text-foreground">
                     Discover
                  </Link>
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                  <span className="truncate">{c.handle}</span>
               </>
            }
         >
            <ProfileLink c={c} className="mr-2" />
            <SaveButton id={c.id} className="mr-1" />
            <Button size="xs" variant="secondary" onClick={() => toggleCompare(c.id)}>
               {inCompare ? 'In compare' : 'Add to compare'}
            </Button>
            <Button size="xs" onClick={() => openComposer(c.id)}>
               Reach out
            </Button>
         </PageHeader>

         <div className="flex min-h-0 w-full flex-1">
            <Tabs defaultValue="overview" className="min-w-0 flex-1 gap-0 overflow-y-auto">
               <div className="flex items-center gap-3 px-6 pt-6">
                  <CreatorAvatar c={c} className="size-10 text-sm" />
                  <div className="min-w-0">
                     <h1 className="truncate text-xl font-semibold">{c.handle}</h1>
                     <p className="text-sm text-muted-foreground">{c.bio}</p>
                  </div>
                  <div className="ml-auto text-right">
                     <div className="text-2xl font-semibold tabular-nums">{c.score}</div>
                     <div className="text-xs text-muted-foreground">score / 100</div>
                  </div>
               </div>
               <div className="border-b px-6 pt-4">
                  <TabsList className="h-8 bg-transparent p-0">
                     <TabsTrigger value="overview">Overview</TabsTrigger>
                     <TabsTrigger value="content">Content</TabsTrigger>
                     <TabsTrigger value="results">
                        Results{c.results.length ? <span className="ml-1 text-muted-foreground">{c.results.length}</span> : null}
                     </TabsTrigger>
                  </TabsList>
               </div>

               <TabsContent value="overview" className="p-6">
                  <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
                     <div>
                        <div className="mb-2 text-center text-xs text-muted-foreground">Sponsored post concept</div>
                        <PostPreview c={c} />
                     </div>
                     <div className="flex min-w-0 flex-col gap-4">
                        <KeyNumbers c={c} />
                        <Section title="Why this score">
                           <Reasons c={c} />
                        </Section>
                        {c.sponsorship && (
                           <Section title="Sponsorships" sub={`from their ${c.platform === 'tiktok' ? 'video captions' : 'Shorts descriptions'}`}>
                              <SponsorshipInsight c={c} />
                           </Section>
                        )}
                        {c.comments && (
                           <Section title="Audience" sub="from their comments">
                              <AudienceInsight c={c} />
                           </Section>
                        )}
                        {c.safety && (
                           <Section title="Brand safety" sub="recent titles and descriptions">
                              <SafetyInsight c={c} />
                           </Section>
                        )}
                        <Section title="What to offer" sub="for one post">
                           <div className="grid grid-cols-3 gap-4 tabular-nums">
                              <div>
                                 <div className="text-xs text-muted-foreground">Open at</div>
                                 <div className="text-lg font-semibold">{eurExact(n.opener)}</div>
                              </div>
                              <div>
                                 <div className="text-xs text-muted-foreground">They'll likely ask</div>
                                 <div className="text-lg font-semibold">{eurExact(n.ask)}</div>
                              </div>
                              <div>
                                 <div className="text-xs text-muted-foreground">Walk away above</div>
                                 <div className="text-lg font-semibold">{eurExact(n.walkaway)}</div>
                              </div>
                           </div>
                        </Section>
                        <Section title="More like this" sub="same games, topics and size">
                           <Lookalikes c={c} />
                        </Section>
                        <Section title="Concept" sub={`written in ${c.lang.toUpperCase()}`}>
                           <p className="mb-2 text-sm font-medium">
                              {c.platform === 'youtube' ? c.concept.title : c.concept.hook}
                           </p>
                           <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                              {c.concept.beats.map((b) => (
                                 <li key={b}>{b}</li>
                              ))}
                           </ol>
                        </Section>
                     </div>
                  </div>
               </TabsContent>

               <TabsContent value="content" className="flex flex-col gap-4 p-6">
                  <div className="grid gap-4">
                     <Section title="Views per post" sub={`last 30 · median ${compact(c.medianViews)}`}>
                        <ViewsOverTime c={c} />
                     </Section>
                  </div>
                  <section className="rounded-lg border">
                     <div className="flex items-center border-b px-4 py-2 text-xs text-muted-foreground">
                        <span className="flex-1">Recent posts</span>
                        <span className="w-20 text-right">Views</span>
                        <span className="w-20 text-right">Likes</span>
                        <span className="w-20 text-right">Eng. rate</span>
                        <span className="w-20 text-right">Posted</span>
                     </div>
                     {c.posts.slice(0, 15).map((p) => (
                        <div key={p.id} className="flex items-center border-b border-muted-foreground/5 px-4 py-2 text-sm last:border-0">
                           <span className="min-w-0 flex-1 truncate">
                              {p.sponsored && <span className="mr-1.5 rounded border px-1 text-[10px] text-muted-foreground">Ad</span>}
                              {p.title}
                           </span>
                           <span className="w-20 text-right tabular-nums">{compact(p.views)}</span>
                           <span className="w-20 text-right tabular-nums text-muted-foreground">{compact(p.likes)}</span>
                           <span className="w-20 text-right tabular-nums text-muted-foreground">
                              {pct((p.likes + p.comments + p.shares) / Math.max(1, p.views))}
                           </span>
                           <span className="w-20 text-right text-muted-foreground">{daysAgo(p.date)}</span>
                        </div>
                     ))}
                  </section>
               </TabsContent>
               <TabsContent value="results" className="p-6">
                  <Results c={c} />
               </TabsContent>
            </Tabs>

            <aside className="hidden w-72 shrink-0 overflow-y-auto border-l p-4 lg:block">
               <h3 className="mb-1.5 text-sm font-medium">Properties</h3>
               <Properties c={c} />
            </aside>
         </div>
      </>
   );
}

function Results({ c }: { c: Creator }) {
   const profit = useProfitPerPc();
   const rows = c.results.map((r) => ({ ...r, net: r.pcsSold * profit - r.cost }));
   const total = rows.reduce(
      (t, r) => ({ cost: t.cost + r.cost, views: t.views + r.views, pcsSold: t.pcsSold + r.pcsSold, net: t.net + r.net }),
      { cost: 0, views: 0, pcsSold: 0, net: 0 }
   );
   return (
      <div className="flex flex-col gap-4">
         <div className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">Tracked link</span>
            <code className="min-w-0 flex-1 truncate text-xs">{c.trackedLink}</code>
            <Button size="xxs" variant="ghost" onClick={() => navigator.clipboard?.writeText(c.trackedLink)}>
               Copy
            </Button>
         </div>
         {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
               No sponsored posts yet. Clicks and PCs sold show up here once their tracked link is used.
            </p>
         ) : (
            <>
               <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border bg-border">
                  {[
                     ['Spent', eurExact(total.cost)],
                     ['Views', compact(total.views)],
                     ['PCs sold', total.pcsSold.toFixed(1)],
                     ['Profit after cost', `${total.net >= 0 ? '+' : '−'}${eurExact(Math.abs(total.net))}`],
                  ].map(([l, v], i) => (
                     <div key={l} className="bg-container px-4 py-3">
                        <div className="text-xs text-muted-foreground">{l}</div>
                        <div className={cn('text-lg font-semibold tabular-nums', i === 3 && (total.net >= 0 ? 'text-good' : 'text-bad'))}>{v}</div>
                     </div>
                  ))}
               </div>
               <section className="rounded-lg border">
                  <div className="flex border-b px-4 py-2 text-xs text-muted-foreground">
                     <span className="flex-1">Post</span>
                     <span className="w-20 text-right">Paid</span>
                     <span className="w-20 text-right">Views</span>
                     <span className="w-20 text-right">Clicks</span>
                     <span className="w-20 text-right">PCs sold</span>
                     <span className="w-24 text-right">Profit</span>
                  </div>
                  {rows.map((r) => (
                     <div key={r.date} className="flex border-b border-muted-foreground/5 px-4 py-2 text-sm last:border-0">
                        <span className="flex-1">{shortDate(r.date)} · {r.payment === 'pc' ? 'Free PC' : 'Cash'}</span>
                        <span className="w-20 text-right tabular-nums">{eurExact(r.cost)}</span>
                        <span className="w-20 text-right tabular-nums">{compact(r.views)}</span>
                        <span className="w-20 text-right tabular-nums text-muted-foreground">{compact(r.clicks)}</span>
                        <span className="w-20 text-right tabular-nums">{r.pcsSold.toFixed(1)}</span>
                        <span className={cn('w-24 text-right tabular-nums', r.net >= 0 ? 'text-good' : 'text-bad')}>
                           {r.net >= 0 ? '+' : '−'}
                           {eurExact(Math.abs(r.net))}
                        </span>
                     </div>
                  ))}
               </section>
            </>
         )}
      </div>
   );
}
