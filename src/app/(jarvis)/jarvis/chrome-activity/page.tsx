"use client"

import { ChromeActivityWidget } from "@/components/jarvis/observability/chrome-activity-widget"

// Wave 4.4 — Chrome Activity page.
// Surfaces the audit log readback so Dylan can verify no silent Chrome
// navigation is happening. Idle on this page for a few minutes — counts
// should stay flat at zero.
export default function ChromeActivityPage() {
  return (
    <main className="min-h-screen bg-mem-bg p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <header>
          <h1 className="text-2xl font-semibold text-mem-text-primary">Chrome Activity</h1>
          <p className="text-sm text-mem-text-secondary">
            Every Chrome navigation made by the dashboard, from the audit log. If anything is silently
            driving Chrome (the 2026-05-02 incident pattern), it shows up here.
          </p>
        </header>
        <ChromeActivityWidget windowMinutes={30} refreshMs={30000} />
        <ChromeActivityWidget windowMinutes={60 * 6} refreshMs={0} />
      </div>
    </main>
  )
}
