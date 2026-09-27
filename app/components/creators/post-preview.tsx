import type { Creator } from '@/lib/data/types';
import { compact } from '@/lib/format';
import { CreatorAvatar } from './creator-avatar';

/** A Prenew sponsored post drawn in the creator's own platform UI. */
export function PostPreview({ c }: { c: Creator }) {
   return c.platform === 'tiktok' ? <TikTokMock c={c} /> : <YouTubeMock c={c} />;
}

function TikTokMock({ c }: { c: Creator }) {
   const likes = c.prediction.views[1] * c.engagementRate * 0.86;
   return (
      <div className="mx-auto h-[560px] w-[280px] rounded-[40px] border bg-black p-2 shadow-2xl">
         <div className="relative h-full w-full overflow-hidden rounded-[32px] bg-gradient-to-b from-zinc-800 via-zinc-900 to-black">
            <PcSketch className="absolute right-10 bottom-40 w-24" />
            <div className="absolute top-8 flex w-full justify-center gap-4 text-[13px] font-semibold text-white/60">
               <span>Following</span>
               <span className="border-b-2 border-white pb-0.5 text-white">For You</span>
            </div>
            <div className="absolute top-32 right-14 left-4 text-xl leading-snug font-bold text-white">
               <span className="box-decoration-clone rounded bg-black/60 px-1.5 py-0.5">{c.concept.hook}</span>
            </div>
            <div className="absolute right-2.5 bottom-28 flex flex-col items-center gap-4 text-[11px] font-semibold text-white">
               <CreatorAvatar c={c} className="size-9 ring-2 ring-white/80" />
               <Stat icon="♥" v={compact(likes)} />
               <Stat icon="💬" v={compact(likes * 0.09)} />
               <Stat icon="↗" v={compact(likes * 0.07)} />
            </div>
            <div className="absolute right-16 bottom-14 left-3.5 text-[12px] leading-snug text-white">
               <div className="text-sm font-semibold">@{c.handle}</div>
               <span className="my-1 inline-block rounded bg-white/15 px-1.5 text-[10px]">Paid partnership</span>
               <div>{c.concept.caption}</div>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex h-11 items-center justify-around bg-black text-[10px] text-white/60">
               <span>Home</span>
               <span>Friends</span>
               <span className="rounded-md bg-white px-2.5 text-base font-bold text-black">+</span>
               <span>Inbox</span>
               <span>Profile</span>
            </div>
         </div>
      </div>
   );
}

function Stat({ icon, v }: { icon: string; v: string }) {
   return (
      <div className="flex flex-col items-center">
         <span className="flex size-9 items-center justify-center rounded-full bg-white/15 text-sm">{icon}</span>
         {v}
      </div>
   );
}

function YouTubeMock({ c }: { c: Creator }) {
   const likes = c.prediction.views[1] * c.engagementRate * 0.86;
   return (
      <div className="mx-auto h-[560px] w-[280px] rounded-[40px] border bg-black p-2 shadow-2xl">
         <div className="relative h-full w-full overflow-hidden rounded-[32px] bg-gradient-to-b from-zinc-800 via-zinc-900 to-black">
            <PcSketch className="absolute right-10 bottom-44 w-24" />
            <div className="absolute top-7 left-4 flex items-center gap-1.5 text-sm font-semibold text-white">
               <span className="flex h-5 w-4 items-center justify-center rounded-[5px] bg-red-600 text-[9px]">▶</span>
               Shorts
            </div>
            <div className="absolute top-28 right-14 left-4 text-xl leading-snug font-bold text-white">
               <span className="box-decoration-clone rounded bg-black/60 px-1.5 py-0.5">{c.concept.hook}</span>
            </div>
            <div className="absolute right-2.5 bottom-24 flex flex-col items-center gap-4 text-[11px] font-semibold text-white">
               <Stat icon="👍" v={compact(likes)} />
               <Stat icon="👎" v="Dislike" />
               <Stat icon="💬" v={compact(likes * 0.09)} />
               <Stat icon="↪" v="Share" />
            </div>
            <div className="absolute right-16 bottom-12 left-3.5 text-[12px] leading-snug text-white">
               <div className="mb-1.5 flex items-center gap-2">
                  <CreatorAvatar c={c} className="size-7" />
                  <span className="text-sm font-semibold">@{c.handle}</span>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-black">Subscribe</span>
               </div>
               <span className="mb-1 inline-block rounded bg-white/15 px-1.5 text-[10px]">Includes paid promotion</span>
               <div>{c.concept.title}</div>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex h-10 items-center justify-around bg-black text-[10px] text-white/60">
               <span>Home</span>
               <span className="text-white">Shorts</span>
               <span className="text-base">⊕</span>
               <span>Subscriptions</span>
               <span>You</span>
            </div>
         </div>
      </div>
   );
}

function PcSketch({ className }: { className?: string }) {
   return (
      <svg viewBox="0 0 120 160" className={className} aria-hidden>
         <rect x="10" y="6" width="100" height="148" rx="8" fill="#0d0d0e" stroke="rgba(255,255,255,0.3)" />
         <rect x="20" y="18" width="80" height="96" rx="4" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.25)" />
         {[40, 66, 92].map((y) => (
            <circle key={y} cx="60" cy={y} r="11" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
         ))}
         <circle cx="96" cy="142" r="3" fill="rgba(255,255,255,0.7)" />
      </svg>
   );
}
