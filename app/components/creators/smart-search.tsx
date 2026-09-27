'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { DEFAULT_FILTERS, type Filters } from './filters';
import { mergeLlm, parseQuery } from '@/lib/nlq';
import { cn } from '@/lib/utils';

/**
 * One box for everything: "micro minecraft tiktokers in finland under €300".
 * Known words become filters instantly; anything else goes to the local LLM.
 */
export function SmartSearch({
   onChange,
   placeholder = 'Describe who you want, e.g. micro Minecraft TikTokers in Finland under €300',
   autoFocus,
   initial = '',
}: {
   onChange: (f: Filters, query: string) => void;
   placeholder?: string;
   autoFocus?: boolean;
   initial?: string;
}) {
   const [q, setQ] = useState(initial);
   const [thinking, setThinking] = useState(false);
   const [aiUsed, setAiUsed] = useState(false);
   const seq = useRef(0);
   const cb = useRef(onChange);
   cb.current = onChange;

   useEffect(() => {
      const id = ++seq.current;
      const text = q.trim();
      setAiUsed(false);
      if (!text) {
         setThinking(false);
         cb.current(DEFAULT_FILTERS, '');
         return;
      }
      const { filters, leftover } = parseQuery(text);
      const t1 = setTimeout(() => cb.current(filters, text), 150);
      if (!leftover.length) {
         setThinking(false);
         return () => clearTimeout(t1);
      }
      const t2 = setTimeout(async () => {
         setThinking(true);
         try {
            const res = await fetch('/api/parse', { method: 'POST', body: JSON.stringify({ q: text }) });
            if (!res.ok || id !== seq.current) return;
            const llm = await res.json();
            if (id !== seq.current) return;
            cb.current(mergeLlm(filters, llm, text), text);
            setAiUsed(true);
         } catch {
            /* LLM unavailable: keep the rule-based filters */
         } finally {
            if (id === seq.current) setThinking(false);
         }
      }, 700);
      return () => {
         clearTimeout(t1);
         clearTimeout(t2);
      };
   }, [q]);

   return (
      <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border bg-background/40 px-2 focus-within:border-ring">
         <Search className="size-3.5 shrink-0 text-muted-foreground" />
         <input
            autoFocus={autoFocus}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
         />
         {(thinking || aiUsed) && (
            <span
               className={cn('flex shrink-0 items-center gap-1 text-xs text-muted-foreground', thinking && 'animate-pulse')}
               title="Words the quick parser didn't know were interpreted by the local AI model"
            >
               <Sparkles className="size-3" />
               {thinking ? 'Interpreting…' : 'AI'}
            </span>
         )}
      </div>
   );
}
