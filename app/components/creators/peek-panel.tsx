'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { creatorById } from '@/lib/data/mock';
import { useScout, useUi } from '@/lib/store';
import { useMounted } from '@/hooks/use-mounted';
import { CreatorAvatar, ProfileLink } from './creator-avatar';
import { KeyNumbers, Properties, Reasons } from './summary';
import { SaveButton } from './creators-list';

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
   return <div className={`rounded-xl border bg-black p-4 ${className ?? ''}`}>{children}</div>;
}

/** Linear-style peek: stacked floating cards over the right side of the list. */
export function PeekPanel() {
   const { peekId, setPeek, openComposer } = useUi();
   const router = useRouter();
   const { compare, toggleCompare } = useScout();
   const mounted = useMounted();
   const c = peekId ? creatorById(peekId) : undefined;
   const pathname = usePathname();

   useEffect(() => {
      setPeek(null);
   }, [pathname, setPeek]);

   useEffect(() => {
      const on = (e: KeyboardEvent) => e.key === 'Escape' && setPeek(null);
      window.addEventListener('keydown', on);
      return () => window.removeEventListener('keydown', on);
   }, [setPeek]);

   // Clicking anywhere else closes it; dialogs and menus opened from the panel (e.g. the composer) don't count.
   const panel = useRef<HTMLElement>(null);
   useEffect(() => {
      if (!peekId) return;
      const on = (e: PointerEvent) => {
         const t = e.target as Element | null;
         if (!t || panel.current?.contains(t) || t.closest('[role="dialog"], [role="menu"], [role="listbox"], [data-sonner-toaster]')) return;
         setPeek(null);
      };
      document.addEventListener('pointerdown', on);
      return () => document.removeEventListener('pointerdown', on);
   }, [peekId, setPeek]);

   if (!c) return null;
   const inCompare = mounted && compare.includes(c.id);

   return (
      <aside ref={panel} className="absolute top-10 right-0 bottom-0 z-40 flex w-[440px] max-w-full flex-col gap-2 overflow-y-auto border-l bg-black p-3 shadow-2xl [&>*]:shrink-0">
         <Card className="flex items-center gap-2 py-3">
            <CreatorAvatar c={c} />
            <Link
               href={`/creator/${c.id}`}
               onClick={() => setPeek(null)}
               className="group flex min-w-0 flex-1 items-center gap-1.5"
            >
               <span className="truncate font-medium">{c.handle}</span>
               <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
            </Link>
            <span className="text-sm tabular-nums text-muted-foreground">Score {c.score}</span>
            <SaveButton id={c.id} />
            <button
               onClick={() => setPeek(null)}
               className="text-muted-foreground hover:text-foreground"
               aria-label="Close"
            >
               <X className="size-4" />
            </button>
         </Card>
         <KeyNumbers c={c} />
         <Card>
            <Reasons c={c} />
         </Card>
         <Card>
            <div className="mb-1.5 flex items-center justify-between">
               <h3 className="text-sm font-medium">Properties</h3>
               <ProfileLink c={c} />
            </div>
            <Properties c={c} />
         </Card>
         <Button
            size="sm"
            variant="secondary"
            onClick={() => {
               setPeek(null);
               router.push(`/discover?like=${encodeURIComponent(c.id)}`);
            }}
         >
            Who’s similar to {c.handle}?
         </Button>
         <div className="flex gap-2">
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => toggleCompare(c.id)}>
               {inCompare ? 'Remove from compare' : 'Add to compare'}
            </Button>
            <Button size="sm" className="flex-1" onClick={() => openComposer(c.id)}>
               Reach out
            </Button>
         </div>
      </aside>
   );
}
