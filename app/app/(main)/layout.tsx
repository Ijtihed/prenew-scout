import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { CommandPalette } from '@/components/layout/command-palette';
import { PeekPanel } from '@/components/creators/peek-panel';
import { Composer } from '@/components/creators/composer';
import { CompareTray } from '@/components/creators/compare-tray';
import { ScoreSync } from '@/components/layout/score-sync';
import { DataGate } from '@/components/layout/data-gate';
import { AgentRunner } from '@/components/layout/agent-runner';

export default function MainLayout({ children }: { children: React.ReactNode }) {
   return (
      <DataGate>
      <SidebarProvider>
         <CommandPalette />
         <AppSidebar />
         <div className="h-svh w-full overflow-hidden lg:p-2">
            <div className="relative flex h-full w-full flex-col overflow-hidden bg-container lg:rounded-md lg:border">
               <ScoreSync>
                  {children}
               </ScoreSync>
               <PeekPanel />
               <CompareTray />
            </div>
         </div>
         <Composer />
         <AgentRunner />
      </SidebarProvider>
      </DataGate>
   );
}
