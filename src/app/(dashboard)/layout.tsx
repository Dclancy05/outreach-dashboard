"use client"

import { Sidebar } from "@/components/dashboard/sidebar"
import { BottomTabs } from "@/components/dashboard/bottom-tabs"
import { SystemPulse } from "@/components/system-pulse"
import { RememberPalette } from "@/components/memory/remember-palette"
import { CommandPalette } from "@/components/command-palette/command-palette"
import { TerminalsDrawerProvider } from "@/components/terminals/terminals-drawer-provider"
import { TerminalsDrawer } from "@/components/terminals/terminals-drawer"
import { TerminalsRailTab } from "@/components/terminals/terminals-rail-tab"
import { InboxDrawerProvider } from "@/components/inbox/inbox-drawer-provider"
import { InboxDrawer } from "@/components/inbox/inbox-drawer"
import { MobileTabBar } from "@/components/shell/mobile-tab-bar"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <InboxDrawerProvider>
      <TerminalsDrawerProvider>
        <Sidebar />
        <main className="md:ml-64 min-h-screen p-4 md:p-6 pt-16 md:pt-6 pb-20 md:pb-6">
          {children}
        </main>
        <BottomTabs />
        <SystemPulse />
        {/* Cmd+K palette — spawn/focus terminals, fuzzy-search agents/memory.
            Phase 4 #2 of the terminals overhaul. RememberPalette is now ⌘⇧K. */}
        <CommandPalette />
        <RememberPalette />
        <TerminalsRailTab />
        <TerminalsDrawer />
        {/* Inbox: z-50/51 (Terminals stays z-60/61) so they coexist. */}
        <InboxDrawer />
        {/* Mobile bottom nav: shown only <lg, only on /agency/* paths. */}
        <MobileTabBar />
      </TerminalsDrawerProvider>
    </InboxDrawerProvider>
  )
}
