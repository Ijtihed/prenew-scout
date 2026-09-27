'use client';

import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { OutreachEntry, OutreachStatus, ThreadItem } from '@/lib/data/types';
import { ASSUMPTIONS } from '@/lib/data/mock';
import { SAMPLE_SAVED } from '@/lib/data/samples';
import { useMounted } from '@/hooks/use-mounted';
import { RECOMMENDED, type Weights } from '@/lib/data/score-presets';
import { drawPart } from '@/lib/negotiate';

export const COMPARE_MAX = 4;

let following = false;
/** Picks up changes saved by other tabs or people (e.g. a reset), unless this tab is mid-save. */
function followServer() {
   if (following || typeof window === 'undefined') return;
   following = true;
   setInterval(async () => {
      if (queued.has('scout') || document.hidden) return;
      try {
         const res = await fetch('/api/state?key=scout', { cache: 'no-store' });
         if (!res.ok) return;
         const { value } = (await res.json()) as { value: string | null };
         if (value !== null && value !== synced.get('scout') && !queued.has('scout')) await useScout.persist.rehydrate();
      } catch {
         /* offline: keep what we have */
      }
   }, 5000);
}

/**
 * Persists app state in the team database (/api/state) so everyone sees the same saved creators and
 * conversations. Falls back to this browser's localStorage when the server can't be reached.
 */
// Until the saved state has loaded, the store holds defaults; saving those would overwrite the team's data.
let hydrated = false;
const queued = new Map<string, string>();
// The last value this tab loaded or saved per key; anything else on the server came from someone else.
const synced = new Map<string, string>();

const serverStorage = {
   async getItem(key: string): Promise<string | null> {
      try {
         const res = await fetch(`/api/state?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
         if (res.ok) {
            const { value } = (await res.json()) as { value: string | null };
            if (value !== null) {
               synced.set(key, value);
               return value;
            }
         }
      } catch {
         /* offline: use the local copy */
      }
      try {
         return localStorage.getItem(key);
      } catch {
         return null;
      }
   },
   async setItem(key: string, value: string): Promise<void> {
      if (!hydrated) return;
      try {
         localStorage.setItem(key, value);
      } catch {
         /* storage unavailable */
      }
      // One save in flight at a time, always the newest, so an older save can't land last.
      const first = !queued.has(key);
      queued.set(key, value);
      if (!first) return;
      let failures = 0;
      while (queued.has(key)) {
         const next = queued.get(key)!;
         let ok = false;
         try {
            const res = await fetch(`/api/state?key=${encodeURIComponent(key)}`, {
               method: 'PUT',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ value: next }),
            });
            ok = res.ok;
         } catch {
            /* offline: retried below */
         }
         // A failed save (e.g. the database busy) is retried with back-off instead of being dropped.
         if (!ok && failures < 6) {
            failures++;
            await new Promise((r) => setTimeout(r, 1000 * 2 ** failures));
            continue;
         }
         failures = 0;
         if (ok) synced.set(key, next);
         if (queued.get(key) === next) queued.delete(key);
      }
   },
   async removeItem(key: string): Promise<void> {
      try {
         localStorage.removeItem(key);
      } catch {
         /* ignore */
      }
      await fetch(`/api/state?key=${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => {});
   },
};

interface ScoutState {
   compare: string[];
   toggleCompare: (id: string) => void;
   clearCompare: () => void;
   outreach: OutreachEntry[];
   saveOutreach: (e: OutreachEntry) => void;
   removeOutreach: (creatorId: string) => void;
   profitPerPc: number;
   setProfitPerPc: (v: number) => void;
   weights: Weights;
   setWeights: (w: Weights) => void;
   saved: string[];
   toggleSaved: (id: string) => void;
   addToThread: (creatorId: string, item: Omit<ThreadItem, 'id' | 'at'>, status?: OutreachStatus) => void;
   setStatus: (creatorId: string, status: OutreachStatus) => void;
   setPostDate: (creatorId: string, date: string | undefined) => void;
   markRead: (creatorId: string) => void;
   setAgent: (creatorId: string, agent: boolean, maxBudget?: number) => void;
}

export const useScout = create<ScoutState>()(
   persist(
      (set) => ({
         compare: [],
         toggleCompare: (id) =>
            set((s) => ({
               compare: s.compare.includes(id)
                  ? s.compare.filter((x) => x !== id)
                  : s.compare.length >= COMPARE_MAX
                    ? s.compare
                    : [...s.compare, id],
            })),
         clearCompare: () => set({ compare: [] }),
         outreach: [],
         saveOutreach: (e) =>
            set((s) => ({ outreach: [e, ...s.outreach.filter((x) => x.creatorId !== e.creatorId)] })),
         removeOutreach: (id) => set((s) => ({ outreach: s.outreach.filter((x) => x.creatorId !== id) })),
         profitPerPc: ASSUMPTIONS.profitPerPc,
         setProfitPerPc: (v) => set({ profitPerPc: v }),
         weights: RECOMMENDED,
         setWeights: (weights) => set({ weights }),
         saved: SAMPLE_SAVED,
         toggleSaved: (id) =>
            set((s) => ({ saved: s.saved.includes(id) ? s.saved.filter((x) => x !== id) : [id, ...s.saved] })),
         addToThread: (creatorId, item, status) =>
            set((s) => ({
               outreach: s.outreach.map((o) =>
                  o.creatorId !== creatorId
                     ? o
                     : {
                          ...o,
                          status: status ?? o.status,
                          updatedAt: new Date().toISOString(),
                          thread: [
                             ...(o.thread ?? []),
                             { ...item, id: Math.random().toString(36).slice(2), at: new Date().toISOString() },
                          ],
                       }
               ),
            })),
         setPostDate: (creatorId, postDate) =>
            set((s) => ({ outreach: s.outreach.map((o) => (o.creatorId === creatorId ? { ...o, postDate } : o)) })),
         setAgent: (creatorId, agent, maxBudget) =>
            set((s) => ({
               outreach: s.outreach.map((o) =>
                  o.creatorId === creatorId ? { ...o, agent, maxBudget: maxBudget ?? o.maxBudget, sim: o.sim ?? (agent ? drawPart() : undefined) } : o
               ),
            })),
         markRead: (creatorId) =>
            set((s) => ({
               outreach: s.outreach.map((o) => (o.creatorId === creatorId ? { ...o, readAt: new Date().toISOString() } : o)),
            })),
         setStatus: (creatorId, status) =>
            set((s) => ({
               outreach: s.outreach.map((o) =>
                  o.creatorId === creatorId ? { ...o, status, updatedAt: new Date().toISOString() } : o
               ),
            })),
      }),
      {
         name: 'scout',
         version: 8,
         storage: createJSONStorage(() => serverStorage),
         onRehydrateStorage: () => () => {
            hydrated = true;
            followServer();
         },
         migrate: (state, version) => {
            const s = state as ScoutState;
            // v7 starts Outreach empty: the sample conversations are gone and earlier test threads are cleared.
            const outreach = version < 7 ? [] : (s.outreach ?? []).map((o) => ({ ...o, thread: o.thread ?? [] }));
            const saved = s.saved ?? [];
            const addSamples = version < 4;
            return {
               ...s,
               // v8 re-based the Score on research; old weights described different parts.
               weights: version < 8 ? RECOMMENDED : (s.weights ?? RECOMMENDED),
               saved: addSamples ? [...saved, ...SAMPLE_SAVED.filter((id) => !saved.includes(id))] : saved,
               outreach,
            };
         },
      }
   )
);

/** True once the saved team state has loaded. */
export function useHydrated() {
   return useSyncExternalStore(
      (cb) => useScout.persist.onFinishHydration(cb),
      () => useScout.persist.hasHydrated(),
      () => false
   );
}

/** Panels that should not survive a reload. */
interface UiState {
   peekId: string | null;
   setPeek: (id: string | null) => void;
   composerId: string | null;
   /** Offer to start from; null means the creator's usual opener. */
   composerPreset: ComposerPreset | null;
   openComposer: (id: string | null, preset?: ComposerPreset) => void;
   /** What the agent is doing in each conversation right now ("reading their reply…"). */
   agentStatus: Record<string, string>;
   setAgentStatus: (creatorId: string, text: string | null) => void;
}

export interface ComposerPreset {
   payment: 'cash' | 'pc';
   amount: number;
   pcIndex: number;
   /** Hand the conversation to the negotiation agent once it's sent. */
   agent?: boolean;
   maxBudget?: number;
}

export const useUi = create<UiState>()((set) => ({
   peekId: null,
   setPeek: (peekId) => set({ peekId }),
   agentStatus: {},
   setAgentStatus: (id, text) =>
      set((s) => {
         const next = { ...s.agentStatus };
         if (text) next[id] = text;
         else delete next[id];
         return { agentStatus: next };
      }),
   composerId: null,
   composerPreset: null,
   openComposer: (composerId, preset) => set({ composerId, composerPreset: preset ?? null }),
}));

/** PCs Prenew must sell through this creator to pay back the fee. */
export const breakEven = (price: number, profitPerPc: number) => price / Math.max(1, profitPerPc);

/** Profit per PC, falling back to the default until persisted state has hydrated. */
export function useProfitPerPc() {
   const mounted = useMounted();
   const p = useScout((s) => s.profitPerPc);
   return mounted ? p : ASSUMPTIONS.profitPerPc;
}

/** Team score weights, falling back to the recommended preset until persisted state has hydrated. */
export function useWeights() {
   const mounted = useMounted();
   const w = useScout((s) => s.weights);
   return mounted ? w : RECOMMENDED;
}

/** Records an email in Scout's own database (never delivered). Returns false if the server didn't take it. */
export async function recordMail(mail: { creatorId: string; to: string; cc?: string; subject: string; body: string }) {
   try {
      const res = await fetch('/api/mail', {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify(mail),
      });
      return res.ok;
   } catch {
      return false;
   }
}
