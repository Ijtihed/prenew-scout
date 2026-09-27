'use client';

import { useEffect } from 'react';
import { negotiationStep, nextForAgent } from '@/lib/negotiate';
import { useHydrated, useUi } from '@/lib/store';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Moves agent-handled conversations forward in the background, one message at a time, on any page. */
export function AgentRunner() {
   const hydrated = useHydrated();
   useEffect(() => {
      if (!hydrated) return;
      let stop = false;
      (async () => {
         while (!stop) {
            const e = nextForAgent();
            if (!e) {
               await sleep(1500);
               continue;
            }
            try {
               await negotiationStep(e.creatorId);
               useUi.getState().setAgentStatus(e.creatorId, null);
            } catch {
               useUi.getState().setAgentStatus(e.creatorId, 'Agent paused: the local model isn’t running (ollama serve)');
               await sleep(10_000);
            }
            await sleep(700);
         }
      })();
      return () => {
         stop = true;
      };
   }, [hydrated]);
   return null;
}
