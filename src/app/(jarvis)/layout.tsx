"use client"

// Jarvis route-group layout — the shell host.
//
// Layout grid:
//   ┌───────────────────────────────────────────────────────────────┐
//   │ Header (56)                                                   │
//   ├──────┬────────────────────────────────────────────────────────┤
//   │ Side │ Canvas (max-w 1280, padding 32 / 24-top / 48-bottom)   │
//   │ 240  │                                                        │
//   ├──────┴────────────────────────────────────────────────────────┤
//   │ Status (24)                                                   │
//   └───────────────────────────────────────────────────────────────┘
//
// The sidebar reserves 240/56px on lg+; below lg it's hidden and the bottom
// dock renders instead.
//
// We toggle a `jarvis-mode` class on <html> so jarvis-shell.css scoped rules
// (e.g. reduced-motion overrides, scrollbar tweak) only apply while the user
// is inside this route group.

import { useEffect, type ReactNode } from "react"
import "./jarvis-shell.css"
import { JarvisShellProviders } from "@/components/jarvis/shell/jarvis-shell-providers"
import { JarvisCmdkProvider } from "@/components/jarvis/shell/jarvis-cmdk-stub"
import { JarvisSidebar } from "@/components/jarvis/shell/jarvis-sidebar"
import { JarvisHeader } from "@/components/jarvis/shell/jarvis-header"
import { JarvisStatusBar } from "@/components/jarvis/shell/jarvis-status-bar"
import { JarvisBottomDock } from "@/components/jarvis/shell/jarvis-bottom-dock"
import { MotionShell } from "@/components/jarvis/motion/motion-shell"
import { useSidebarCollapse } from "@/components/jarvis/shell/jarvis-shell-providers"
import { WelcomeWizardTrigger } from "@/components/jarvis/onboarding/welcome-wizard-trigger"
import { InboxDrawerProvider } from "@/components/inbox/inbox-drawer-provider"
import { InboxDrawer } from "@/components/inbox/inbox-drawer"
import { JarvisHelpOverlayProvider } from "@/components/jarvis/help/jarvis-help-overlay"
import { JarvisGoNavListener } from "@/components/jarvis/help/jarvis-go-nav-listener"

interface JarvisLayoutProps {
  children: ReactNode
}

export default function JarvisLayout({ children }: JarvisLayoutProps) {
  // InboxDrawerProvider wraps everything that uses useInboxDrawer (the
  // header InboxBell calls it). Sibling route groups don't inherit from
  // (dashboard)/layout.tsx, so we mount our own copy here.
  return (
    <InboxDrawerProvider>
      <JarvisShellProviders>
        <JarvisCmdkProvider>
          <JarvisHelpOverlayProvider>
            <JarvisModeClass />
            <JarvisSidebar />
            <JarvisShellMain>{children}</JarvisShellMain>
            <JarvisBottomDock />
            <WelcomeWizardTrigger />
            <InboxDrawer />
            <JarvisGoNavListener />
          </JarvisHelpOverlayProvider>
        </JarvisCmdkProvider>
      </JarvisShellProviders>
    </InboxDrawerProvider>
  )
}

/* -------------------------------------------------------------------------- */

function JarvisModeClass() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add("jarvis-mode")
    return () => {
      root.classList.remove("jarvis-mode")
    }
  }, [])
  return null
}

/**
 * Inner main wrapper — depends on sidebar collapse state for left margin,
 * so it must be rendered inside the providers tree (hence the split).
 */
function JarvisShellMain({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebarCollapse()
  // Sidebar is hidden < lg, so left padding is only applied on lg+.
  const pad = collapsed ? "lg:pl-14" : "lg:pl-60"

  return (
    <div className={`min-h-screen bg-mem-bg text-mem-text-primary ${pad}`}>
      <JarvisHeader />
      <main className="pb-14 lg:pb-0">
        <MotionShell>
          <div className="jarvis-canvas">{children}</div>
        </MotionShell>
      </main>
      <JarvisStatusBar />
    </div>
  )
}
