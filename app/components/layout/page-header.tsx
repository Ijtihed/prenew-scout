import { SidebarTrigger } from '@/components/ui/sidebar';

/** Linear-style 40px header row: title, optional count, actions on the right. */
export function PageHeader({
   title,
   count,
   children,
}: {
   title: React.ReactNode;
   count?: number;
   children?: React.ReactNode;
}) {
   return (
      <div className="flex h-10 w-full shrink-0 items-center justify-between border-b px-4 py-1.5 lg:px-6">
         <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <div className="flex min-w-0 items-center gap-1 text-sm font-medium">{title}</div>
            {count !== undefined && (
               <span className="rounded-md bg-accent px-1.5 py-0.5 text-xs tabular-nums">{count}</span>
            )}
         </div>
         <div className="flex items-center gap-2">{children}</div>
      </div>
   );
}

/** Second header row for filters and display options. */
export function PageToolbar({ children }: { children: React.ReactNode }) {
   return (
      <div className="flex h-10 w-full shrink-0 items-center gap-2 border-b px-4 py-1.5 lg:px-6">{children}</div>
   );
}
