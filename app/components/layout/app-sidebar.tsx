'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, CalendarDays, Columns3, Compass, Globe2, Inbox, Search, Settings2, Star, Swords } from 'lucide-react';
import {
   Sidebar,
   SidebarContent,
   SidebarGroup,
   SidebarGroupLabel,
   SidebarHeader,
   SidebarMenu,
   SidebarMenuBadge,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import { CREATORS, LIVE_MARKETS, MARKET_META } from '@/lib/data/mock';
import { useScout } from '@/lib/store';
import { useDataVersion } from '@/lib/data/use-data-version';
import { useMounted } from '@/hooks/use-mounted';
import { AccountMenu } from './account-menu';

/** Markets on the roadmap that aren't crawled yet. */
const COMING_SOON = [
   { flag: '🇸🇬', name: 'Singapore' },
   { flag: '🇨🇳', name: 'China' },
];

const NAV = [
   { href: '/discover', label: 'Discover', icon: Compass },
   { href: '/agent', label: 'Agent', icon: Bot },
   { href: '/saved', label: 'Saved', icon: Star, badge: 'saved' as const },
   { href: '/compare', label: 'Compare', icon: Columns3, badge: 'compare' as const },
   { href: '/markets', label: 'Markets', icon: Globe2 },
   { href: '/competitors', label: 'Competitors', icon: Swords },
   { href: '/calendar', label: 'Calendar', icon: CalendarDays },
   { href: '/outreach', label: 'Outreach', icon: Inbox, badge: 'outreach' as const },
];

export function AppSidebar() {
   const pathname = usePathname();
   useDataVersion();
   const mounted = useMounted();
   const { compare, outreach, saved } = useScout();
   const counts = { compare: compare.length, outreach: outreach.length, saved: saved.length };

   return (
      <Sidebar collapsible="offcanvas">
         <SidebarHeader>
            <div className="flex items-center gap-1 pt-2">
               <div className="min-w-0 flex-1">
                  <AccountMenu />
               </div>
               <Link
                  href="/settings"
                  title="Settings"
                  className={`flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground ${pathname.startsWith('/settings') ? 'bg-accent text-foreground' : ''}`}
               >
                  <Settings2 className="size-4" />
               </Link>
               <button
                  title="Search (⌘K)"
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-command'))}
               >
                  <Search className="size-4" />
               </button>
            </div>
         </SidebarHeader>
         <SidebarContent>
            <SidebarGroup>
               <SidebarGroupLabel>Workspace</SidebarGroupLabel>
               <SidebarMenu>
                  {NAV.map((item) => (
                     <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                           asChild
                           isActive={
                              pathname.startsWith(item.href) ||
                              (item.href === '/discover' && pathname.startsWith('/creator'))
                           }
                        >
                           <Link href={item.href}>
                              <item.icon />
                              <span>{item.label}</span>
                           </Link>
                        </SidebarMenuButton>
                        {mounted && item.badge && counts[item.badge] > 0 && (
                           <SidebarMenuBadge>{counts[item.badge]}</SidebarMenuBadge>
                        )}
                     </SidebarMenuItem>
                  ))}
               </SidebarMenu>
            </SidebarGroup>
            <SidebarGroup>
               <SidebarGroupLabel>Markets</SidebarGroupLabel>
               <SidebarMenu>
                  {([...LIVE_MARKETS, 'US'] as const).map((m) => (
                     <SidebarMenuItem key={m}>
                        <SidebarMenuButton asChild disabled={!MARKET_META[m].live}>
                           <Link
                              href={MARKET_META[m].live ? `/markets?market=${m}` : '#'}
                              aria-disabled={!MARKET_META[m].live}
                              className={MARKET_META[m].live ? '' : 'pointer-events-none opacity-50'}
                           >
                              <span className="w-4 text-center">{MARKET_META[m].flag}</span>
                              <span>{MARKET_META[m].name}</span>
                           </Link>
                        </SidebarMenuButton>
                        <SidebarMenuBadge>
                           {MARKET_META[m].live ? CREATORS.filter((c) => c.market === m).length : 'Soon'}
                        </SidebarMenuBadge>
                     </SidebarMenuItem>
                  ))}
                  {COMING_SOON.map((m) => (
                     <SidebarMenuItem key={m.name}>
                        <SidebarMenuButton disabled className="opacity-50">
                           <span className="w-4 text-center">{m.flag}</span>
                           <span>{m.name}</span>
                        </SidebarMenuButton>
                        <SidebarMenuBadge>Soon</SidebarMenuBadge>
                     </SidebarMenuItem>
                  ))}
               </SidebarMenu>
            </SidebarGroup>
         </SidebarContent>
      </Sidebar>
   );
}
