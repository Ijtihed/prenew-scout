'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { CreatorsList } from '@/components/creators/creators-list';
import { creatorById } from '@/lib/data/mock';
import type { Creator } from '@/lib/data/types';
import { useScout } from '@/lib/store';
import { useMounted } from '@/hooks/use-mounted';

export default function SavedPage() {
   const mounted = useMounted();
   const saved = useScout((s) => s.saved);
   const creators = (mounted ? saved : []).map(creatorById).filter((c): c is Creator => !!c);
   return (
      <>
         <PageHeader title="Saved" count={creators.length} />
         {creators.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
               <p>Star a creator in any list to keep them here as a candidate.</p>
               <Button size="sm" variant="secondary" asChild>
                  <Link href="/discover">Find creators</Link>
               </Button>
            </div>
         ) : (
            <div className="w-full flex-1 overflow-y-auto">
               <CreatorsList creators={creators} />
            </div>
         )}
      </>
   );
}
