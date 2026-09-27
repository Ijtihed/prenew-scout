'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, CalendarDays, Columns3, Compass, Globe2, Inbox, Settings2, Star, Swords } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { CreatorAvatar } from '@/components/creators/creator-avatar';
import { CREATORS, MARKET_META } from '@/lib/data/mock';
import { useUi } from '@/lib/store';

const PAGES = [
   { href: '/discover', label: 'Discover', icon: Compass },
   { href: '/agent', label: 'Agent', icon: Bot },
   { href: '/saved', label: 'Saved', icon: Star },
   { href: '/compare', label: 'Compare', icon: Columns3 },
   { href: '/markets', label: 'Markets', icon: Globe2 },
   { href: '/competitors', label: 'Competitors', icon: Swords },
   { href: '/calendar', label: 'Calendar', icon: CalendarDays },
   { href: '/outreach', label: 'Outreach', icon: Inbox },
   { href: '/settings', label: 'Settings', icon: Settings2 },
];

/** ⌘K: jump to a page or open any creator's peek. */
export function CommandPalette() {
   const [open, setOpen] = useState(false);
   const [q, setQ] = useState('');
   const router = useRouter();
   const setPeek = useUi((s) => s.setPeek);

   useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
         if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            setOpen((v) => !v);
         }
      };
      const onOpen = () => setOpen(true);
      window.addEventListener('keydown', onKey);
      window.addEventListener('open-command', onOpen);
      return () => {
         window.removeEventListener('keydown', onKey);
         window.removeEventListener('open-command', onOpen);
      };
   }, []);

   // With thousands of creators, match here and hand the menu only the top results.
   const words = q.toLowerCase().split(/\s+/).filter(Boolean);
   const matches = !open
      ? []
      : CREATORS.filter((c) => {
           const hay = `${c.handle} ${c.name} ${c.games.join(' ')} ${MARKET_META[c.market].name}`.toLowerCase();
           return words.every((w) => hay.includes(w));
        }).slice(0, 50);

   return (
      <Dialog
         open={open}
         onOpenChange={(v) => {
            setOpen(v);
            if (!v) setQ('');
         }}
      >
         <DialogContent className="overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
            <DialogTitle className="sr-only">Command menu</DialogTitle>
            <DialogDescription className="sr-only">Search creators or jump to a page</DialogDescription>
            <Command shouldFilter={false}>
               <CommandInput placeholder="Search creators or pages…" value={q} onValueChange={setQ} />
               <CommandList className="max-h-96">
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup heading="Pages">
                     {PAGES.filter((p) => words.every((w) => p.label.toLowerCase().includes(w))).map((p) => (
                        <CommandItem
                           key={p.href}
                           onSelect={() => {
                              router.push(p.href);
                              setOpen(false);
                           }}
                        >
                           <p.icon className="text-muted-foreground" />
                           {p.label}
                        </CommandItem>
                     ))}
                  </CommandGroup>
                  <CommandGroup heading="Creators">
                     {matches.map((c) => (
                        <CommandItem
                           key={c.id}
                           value={`${c.handle} ${c.name} ${c.games.join(' ')} ${MARKET_META[c.market].name} ${c.id}`}
                           onSelect={() => {
                              setPeek(c.id);
                              setOpen(false);
                           }}
                        >
                           <CreatorAvatar c={c} className="size-5 text-[9px]" />
                           <span>{c.handle}</span>
                           <span className="ml-auto text-xs text-muted-foreground">
                              {MARKET_META[c.market].flag} {c.games[0]} · {c.score}
                           </span>
                        </CommandItem>
                     ))}
                  </CommandGroup>
               </CommandList>
            </Command>
         </DialogContent>
      </Dialog>
   );
}
