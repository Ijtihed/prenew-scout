export function StartupLoader() {
   return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black" role="status" aria-label="Loading Scout">
         <div className="size-8 animate-spin rounded-full border-2 border-white/15 border-t-white" />
      </div>
   );
}

export function PageLoader() {
   return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center bg-container" role="status">
         <span className="sr-only">Loading page</span>
         <div className="size-6 animate-spin rounded-full border-2 border-white/15 border-t-white" aria-hidden="true" />
      </div>
   );
}
