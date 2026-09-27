import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Creator, Platform } from '@/lib/data/types';

export function CreatorAvatar({ c, className }: { c: Pick<Creator, 'handle'> & { avatar?: string }; className?: string }) {
   const letters = c.handle.replace(/[^A-Za-zÄÖÅäöå]/g, '').slice(0, 2);
   if (c.avatar)
      return (
         // eslint-disable-next-line @next/next/no-img-element
         <img
            src={c.avatar}
            alt=""
            referrerPolicy="no-referrer"
            className={cn('inline-flex size-6 shrink-0 rounded-full bg-muted object-cover', className)}
         />
      );
   return (
      <span
         className={cn(
            'inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground',
            className
         )}
      >
         {letters.charAt(0).toUpperCase() + letters.charAt(1).toLowerCase()}
      </span>
   );
}

export function PlatformIcon({ p, className }: { p: Platform; className?: string }) {
   return p === 'tiktok' ? (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cn('size-3.5', className)} aria-label="TikTok">
         <path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.2v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.6a5.9 5.9 0 1 0 5 5.8V9.1a7.4 7.4 0 0 0 4.3 1.4V7.3a4.3 4.3 0 0 1-3.2-1.5Z" />
      </svg>
   ) : (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cn('size-3.5', className)} aria-label="YouTube">
         <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.8 15V9l5.8 3-5.8 3Z" />
      </svg>
   );
}

export const platformName = (p: Platform) => (p === 'tiktok' ? 'TikTok' : 'YouTube Shorts');

export const profileUrl = (c: Pick<Creator, 'handle' | 'platform'> & { profileUrl?: string }) =>
   c.profileUrl ?? (c.platform === 'tiktok' ? `https://www.tiktok.com/@${c.handle}` : `https://www.youtube.com/@${c.handle}/shorts`);

/** Opens the creator's real profile in a new tab. */
export function ProfileLink({ c, className, label = true }: { c: Pick<Creator, 'handle' | 'platform'> & { profileUrl?: string }; className?: string; label?: boolean }) {
   return (
      <a
         href={profileUrl(c)}
         target="_blank"
         rel="noopener noreferrer"
         onClick={(e) => e.stopPropagation()}
         title={`Open on ${platformName(c.platform)}`}
         className={cn('inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground', className)}
      >
         <PlatformIcon p={c.platform} />
         {label && <span className="text-xs">Open on {platformName(c.platform)}</span>}
         <ArrowUpRight className="size-3" />
      </a>
   );
}
