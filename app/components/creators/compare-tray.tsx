'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { creatorById } from '@/lib/data/mock';
import { COMPARE_MAX, useScout } from '@/lib/store';
import { useMounted } from '@/hooks/use-mounted';
import { CreatorAvatar } from './creator-avatar';

export function CompareTray() {
   const mounted = useMounted();
   const pathname = usePathname();
   const { compare, clearCompare } = useScout();
   const onList = ['/discover', '/saved'].some((p) => pathname.startsWith(p));
   if (!mounted || compare.length === 0 || !onList) return null;
   return (
      <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-popover py-1.5 pr-1.5 pl-3 text-sm shadow-lg">
         <div className="flex -space-x-1.5">
            {compare.map((id) => {
               const c = creatorById(id);
               return c ? <CreatorAvatar key={id} c={c} className="ring-2 ring-popover" /> : null;
            })}
         </div>
         <span className="text-muted-foreground">
            {compare.length} of {COMPARE_MAX} selected
         </span>
         <Button size="xs" variant="ghost" onClick={clearCompare}>
            Clear
         </Button>
         <Button size="xs" asChild disabled={compare.length < 2}>
            <Link href="/compare" aria-disabled={compare.length < 2} className={compare.length < 2 ? 'pointer-events-none opacity-50' : ''}>
               Compare
            </Link>
         </Button>
      </div>
   );
}
