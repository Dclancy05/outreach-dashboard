"use client"

import { Sidebar } from "@/components/dashboard/sidebar"
import { BottomTabs } from "@/components/dashboard/bottom-tabs"
import { SystemPulse } from "@/components/system-pulse"
import { RememberPalette } from "@/components/memory/remember-palette"
import { TerminalsDrawerProvider } from "@/components/terminals/terminals-drawer-provider"
import { TerminalsDrawer } from "@/components/terminals/terminals-drawer"
import { TerminalsRailTab } from "@/components/terminals/terminals-rail-tab"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TerminalsDrawerProvider>
      <Sidebar />
      <main className="md:ml-64 min-h-screen p-4 md:p-6 pt-16 md:pt-6 pb-20 md:pb-6">
        {children}
      </main>
      <BottomTabs />
      <SystemPulse />
      <RememberPalette />
      <TerminalsRailTab />
      <TerminalsDrawer />
    </TerminalsDrawerProvider>
  )
}
