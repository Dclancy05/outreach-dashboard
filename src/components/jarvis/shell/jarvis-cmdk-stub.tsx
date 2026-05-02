"use client"

// Cmd+K mount point. W4.B replaced the stubbed dialog body with the real
// Jarvis command palette. This file is now a stable re-export shim so
// existing callers (jarvis layout, jarvis-header) keep working without
// import-path churn.
//
// New file living the actual implementation:
//   - src/components/jarvis/cmdk/jarvis-cmdk.tsx          ← <JarvisCmdk />
//   - src/components/jarvis/cmdk/jarvis-cmdk-provider.tsx ← provider + hotkey
//   - src/components/jarvis/cmdk/sources/*               ← source data fetchers

import { Search } from "lucide-react"
import {
  JarvisCmdkProvider as RealProvider,
  useJarvisCmdk,
} from "@/components/jarvis/cmdk/jarvis-cmdk-provider"

export { useJarvisCmdk }
export const JarvisCmdkProvider = RealProvider

/* -------------------------------------------------------------------------- */
/*                              Header opener pill                             */
/* -------------------------------------------------------------------------- */

interface JarvisCmdkOpenerProps {
  className?: string
}

/**
 * Header search-bar opener. Renders as a fake input bar that opens the dialog
 * when clicked. API stable since the stub days.
 */
export function JarvisCmdkOpener({ className }: JarvisCmdkOpenerProps) {
  const { setOpen } = useJarvisCmdk()
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open command palette"
      className={
        "group flex h-9 w-full max-w-[420px] items-center gap-2.5 rounded-md border border-mem-border bg-mem-surface-2 px-3 text-left text-xs text-mem-text-muted transition-colors hover:border-mem-border-strong hover:bg-mem-surface-3 focus:outline-none focus:ring-1 focus:ring-mem-accent " +
        (className ?? "")
      }
    >
      <Search className="h-3.5 w-3.5" />
      <span className="flex-1 truncate">Search or jump to anything…</span>
      <kbd className="rounded border border-mem-border bg-mem-bg px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-mem-text-muted">
        ⌘K
      </kbd>
    </button>
  )
}
