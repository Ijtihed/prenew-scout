'use client';

import { useEffect, useState } from 'react';
import { DATA, loadRealCreators, type Crawled } from '@/lib/data/mock';
import { setPastCollabs, type PastCollab } from '@/lib/learn';
import { StartupLoader } from './loading-indicators';

let loading: Promise<void> | null = null;

type Export = { crawledAt: string | null; creators: Crawled[] };
type Private = Record<string, { email: string | null; pastPartner: boolean }>;

/** A local file that isn't in the repo; missing is normal. */
const local = <T,>(path: string, empty: T): Promise<T> =>
   fetch(path, { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<T>) : empty))
      .catch(() => empty);

/** Contact emails and past-partner flags live in a separate local file; merged in when it exists. */
async function withPrivate(data: Export): Promise<Export> {
   const priv = await local<Private>('/data/private.json', {});
   return {
      ...data,
      creators: data.creators.map((c) => {
         const p = priv[`${c.platform}:${c.channelId}`];
         return p ? { ...c, email: p.email ?? c.email, pastPartner: p.pastPartner || c.pastPartner } : c;
      }),
   };
}

/** Loads the crawler's export (public/data/creators.json) once before anything renders. */
function loadOnce() {
   loading ??= Promise.all([
      fetch('/data/creators.json', { cache: 'no-cache' }).then((r) => (r.ok ? (r.json() as Promise<Export>) : null)),
      local<PastCollab[]>('/data/past-collabs.json', []),
   ])
      .then(async ([data, past]) => {
         setPastCollabs(past);
         if (data?.creators?.length) loadRealCreators(await withPrivate(data));
      })
      .catch(() => {
         /* no export yet: the app runs on the generated sample creators */
      });
   return loading;
}

/** The crawler exports every round; pick up a newer export without reloading the page. */
async function refresh() {
   try {
      const r = await fetch('/data/creators.json', { cache: 'no-cache' });
      const data = r.ok ? ((await r.json()) as Export) : null;
      if (data?.creators?.length && data.crawledAt !== DATA.crawledAt) loadRealCreators(await withPrivate(data));
   } catch {
      /* keep what we have */
   }
}

export function DataGate({ children }: { children: React.ReactNode }) {
   const [ready, setReady] = useState(false);
   useEffect(() => {
      loadOnce().then(() => setReady(true));
      const id = setInterval(refresh, 90_000);
      return () => clearInterval(id);
   }, []);
   return ready ? <>{children}</> : <StartupLoader />;
}
