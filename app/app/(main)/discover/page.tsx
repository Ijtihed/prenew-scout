'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader, PageToolbar } from '@/components/layout/page-header';
import { CreatorsList } from '@/components/creators/creators-list';
import { SmartSearch } from '@/components/creators/smart-search';
import { ActiveFilters, activeCount, applyFilters, DEFAULT_FILTERS, FilterButton, type Filters } from '@/components/creators/filters';
import { CREATORS } from '@/lib/data/mock';
import { useDataVersion } from '@/lib/data/use-data-version';
import type { Market } from '@/lib/data/types';

/** Filters a link can carry: `?market=FI`, `?like=<creator id>`, or a whole set as `?f=<json>` (e.g. from the Agent). */
function filtersFromUrl(params: URLSearchParams): Filters {
   let f: Filters = DEFAULT_FILTERS;
   try {
      const raw = params.get('f');
      if (raw) f = { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<Filters>) };
   } catch {
      /* a malformed link just opens plain Discover */
   }
   const m = params.get('market') as Market | null;
   return { ...f, markets: m ? [m] : f.markets, likeId: params.get('like') ?? f.likeId ?? null };
}

// Rebuilt whenever the URL changes, so a link always opens exactly what it points to.
function DiscoverList() {
   const params = useSearchParams();
   return <DiscoverView key={params.toString()} base={filtersFromUrl(new URLSearchParams(params.toString()))} />;
}

function DiscoverView({ base }: { base: Filters }) {
   const [filters, setFilters] = useState<Filters>(base);
   const version = useDataVersion();
   const list = useMemo(() => applyFilters(CREATORS, filters), [filters, version]);

   return (
      <>
         <PageHeader title="Discover" count={list.length} />
         <PageToolbar>
            <SmartSearch
               placeholder="Filter in plain words, e.g. cheapest Fortnite creators in Germany"
               // An empty box means "what the link asked for", not "everything".
               onChange={(f, q) => setFilters(q ? { ...f, likeId: f.likeId ?? base.likeId } : base)}
            />
            <FilterButton value={filters} onChange={setFilters} />
         </PageToolbar>
         {activeCount(filters) > 0 && (
            <div className="flex min-h-9 items-center gap-2 border-b px-4 py-1.5 lg:px-6">
               <ActiveFilters value={filters} onChange={setFilters} />
            </div>
         )}
         <div className="w-full flex-1 overflow-y-auto">
            <CreatorsList creators={list} />
         </div>
      </>
   );
}


export default function DiscoverPage() {
   return (
      <Suspense>
         <DiscoverList />
      </Suspense>
   );
}
