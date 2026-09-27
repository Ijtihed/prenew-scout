'use client';

import { Fragment, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { applyWeights } from '@/lib/data/mock';
import { useWeights } from '@/lib/store';
import { useDataVersion } from '@/lib/data/use-data-version';

/**
 * Applies the team's score weights before any page renders, and remounts the page when they change
 * so every list re-sorts with the new scores.
 */
export function ScoreSync({ children }: { children: React.ReactNode }) {
   const w = useWeights();
   const pathname = usePathname();
   const key = JSON.stringify(w);
   // Fresh crawl data comes in ranked with the default weights; re-apply the team's (no remount needed).
   const version = useDataVersion();
   const applied = useRef('');
   if (applied.current !== `${key}:${version}`) {
      applyWeights(w);
      applied.current = `${key}:${version}`;
   }
   // Settings edits the weights itself; remounting it mid-drag would break the sliders.
   return <Fragment key={pathname.startsWith('/settings') ? 'settings' : key}>{children}</Fragment>;
}
