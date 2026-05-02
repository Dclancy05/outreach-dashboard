"use client"

// 56px top bar.
//   Left:   ◀ Dashboard back-pill, JARVIS wordmark, version pill
//   Center: ⌘K opener (stub for now)
//   Right:  live status dot, account button
//
// On mobile (< lg) the back-pill collapses to an icon and the wordmark hides.

import { ArrowLeft, ChevronRight, HelpCircle, User } from "lucide-react"
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { JarvisCmdkOpener } from "@/components/jarvis/shell/jarvis-cmdk-stub"
import { useJarvisVersion } from "@/components/jarvis/shell/jarvis-shell-providers"
import { statusPulse } from "@/components/jarvis/motion/presets"
import { InboxBell } from "@/components/inbox/inbox-bell"
import { useJarvisHelp } from "@/components/jarvis/help/jarvis-help-overlay"
import { cn } from "@/lib/utils"

function JarvisHelpButton() {
  const { toggle } = useJarvisHelp()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Keyboard shortcuts (press ?)"
      title="Keyboard shortcuts — press ?"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-mem-border bg-mem-surface-1 text-mem-text-secondary transition-colors hover:border-mem-border-strong hover:text-mem-text-primary"
    >
      <HelpCircle className="h-4 w-4" />
    </button>
  )
}

interface JarvisHeaderProps {
  /** Whether a workflow run is active. Drives the live status dot animation.
   *  W3C/W4A can pass a real signal; default false for now. */
  liveActivity?: boolean
}

export function JarvisHeader({ liveActivity = false }: JarvisHeaderProps) {
  const { sha, version } = useJarvisVersion()
  const reduced = useReducedMotion()

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-mem-border bg-mem-bg/85 px-4 backdrop-blur-md"
      role="banner"
    >
      {/* Left: back to /agency, brand, version */}
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href="/agency/memory"
          aria-label="Back to dashboard"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-mem-border bg-mem-surface-1 px-2 text-[12px] text-mem-text-secondary transition-colors hover:border-mem-border-strong hover:text-mem-text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Dashboard</span>
        </Link>
        <ChevronRight className="hidden h-3.5 w-3.5 text-mem-text-muted md:inline" />
        <Link
          href="/jarvis"
          className="hidden items-center md:inline-flex"
          aria-label="Jarvis home"
        >
          <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-mem-text-primary">
            Jarvis
          </span>
        </Link>
        <span
          className="ml-1 hidden rounded border border-mem-border bg-mem-surface-1 px-1.5 py-0.5 font-mono text-[10px] text-mem-text-muted md:inline-block"
          aria-label={`Version ${version} build ${sha}`}
        >
          v{version}
        </span>
      </div>

      {/* Center: cmdk opener */}
      <div className="flex flex-1 justify-center">
        <JarvisCmdkOpener />
      </div>

      {/* Right: help · inbox bell + live status + account */}
      <div className="flex items-center gap-2">
        <JarvisHelpButton />
        {/* Wave 9.α fix: Inbox bell was sidebar-only; add to header for parity with /agency. */}
        <InboxBell />
        <div
          className="hidden items-center gap-1.5 rounded-md border border-mem-border bg-mem-surface-1 px-2 py-1 md:inline-flex"
          role="status"
          aria-live="polite"
          aria-label={liveActivity ? "Active run in progress" : "Live"}
        >
          <motion.span
            aria-hidden
            className={cn(
              "h-2 w-2 rounded-full",
              liveActivity ? "bg-mem-status-working" : "bg-mem-status-working/70"
            )}
            animate={liveActivity && !reduced ? statusPulse.animate : { opacity: 1, scale: 1 }}
            transition={liveActivity ? statusPulse.transition : undefined}
          />
          <span className="font-mono text-[10px] uppercase tracking-wider text-mem-text-secondary">
            Live
          </span>
        </div>
        <Link
          href="/agency/settings"
          aria-label="Account settings"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-mem-border bg-mem-surface-1 text-mem-text-secondary transition-colors hover:border-mem-border-strong hover:text-mem-text-primary"
        >
          <User className="h-4 w-4" />
        </Link>
      </div>
    </header>
  )
}
