"use client"

import { Sidebar } from "@/components/dashboard/sidebar"
import { BottomTabs } from "@/components/dashboard/bottom-tabs"
import { SystemPulse } from "@/components/system-pulse"
import { RememberPalette } from "@/components/memory/remember-palette"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <main className="md:ml-64 min-h-screen p-4 md:p-6 pt-16 md:pt-6 pb-20 md:pb-6">
        {children}
      </main>
      <BottomTabs />
      <SystemPulse />
      <RememberPalette />
    </>
  )
}
