'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronsUpDown, LogOut, Settings2 } from 'lucide-react';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Visual placeholder: accounts aren't wired to anything yet. Names and titles from public company records. */
const TEAM = [
   { name: 'Viljami Meriläinen', role: 'CEO', photo: '/team/viljami.jpg' },
   { name: 'Roope Aarnio', role: 'Co-founder', photo: '/team/roope.jpg' },
];

function Avatar({ t, className }: { t: (typeof TEAM)[number]; className: string }) {
   // Photos are kept out of the repo; without one, show initials.
   const [failed, setFailed] = useState(false);
   if (failed)
      return (
         <span className={`${className} flex shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium`}>
            {t.name
               .split(' ')
               .map((w) => w[0])
               .join('')}
         </span>
      );
   // eslint-disable-next-line @next/next/no-img-element
   return <img src={t.photo} alt="" onError={() => setFailed(true)} className={`${className} shrink-0 rounded-full bg-muted object-cover`} />;
}

export function AccountMenu() {
   const [me, setMe] = useState(TEAM[0]);
   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/50">
               <Avatar t={me} className="size-6" />
               <span className="min-w-0 flex-1">
                  <span className="block truncate">{me.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{me.role}</span>
               </span>
               <ChevronsUpDown className="size-3.5 text-muted-foreground" />
            </button>
         </DropdownMenuTrigger>
         <DropdownMenuContent side="bottom" align="start" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Prenew team</DropdownMenuLabel>
            {TEAM.map((t) => (
               <DropdownMenuItem key={t.name} onClick={() => setMe(t)}>
                  <Avatar t={t} className="size-5" />
                  <span className="flex-1">{t.name}</span>
                  {t.name === me.name && <Check className="size-3.5" />}
               </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
               <Link href="/settings">
                  <Settings2 className="size-3.5" /> Settings
               </Link>
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
               <LogOut className="size-3.5" /> Sign out (coming soon)
            </DropdownMenuItem>
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
