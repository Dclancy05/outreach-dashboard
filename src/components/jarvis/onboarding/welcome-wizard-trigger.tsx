"use client"

// Welcome wizard trigger — mounted once in the (jarvis) layout. Reads
// localStorage on mount and decides whether to show the 7-step welcome
// wizard. Keeps two separate keys:
//
//   localStorage.jarvis.welcome_completed_at  → user finished the flow
//   localStorage.jarvis.welcome_skipped_at    → user hit "Skip"
//
// Either of those keys being present means we don't auto-open. The user
// can always re-open it manually from the Help (?) overlay later.
//
// This component is intentionally tiny: it only orchestrates the open-state
// and lazy-mounts the heavy wizard tree. That keeps the layout's first
// paint cheap on every /jarvis route, not just first-visit.

import { useEffect, useState } from "react"
import { WelcomeWizard } from "./welcome-wizard"

const KEY_COMPLETED = "jarvis.welcome_completed_at"
const KEY_SKIPPED = "jarvis.welcome_skipped_at"

export function WelcomeWizardTrigger(): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const completed = window.localStorage.getItem(KEY_COMPLETED)
      const skipped = window.localStorage.getItem(KEY_SKIPPED)
      if (!completed && !skipped) {
        // Defer one frame so the page's own intro motion (enterJarvis) plays
        // first — wizard then layers over a settled canvas.
        const id = window.requestAnimationFrame(() => setOpen(true))
        return () => window.cancelAnimationFrame(id)
      }
    } catch {
      // localStorage may be unavailable (Safari private mode etc.) — fail
      // closed: don't open the wizard.
    }
    return undefined
  }, [])

  function handleComplete(): void {
    try {
      window.localStorage.setItem(KEY_COMPLETED, new Date().toISOString())
    } catch {
      /* ignore */
    }
    setOpen(false)
  }

  function handleSkip(): void {
    try {
      window.localStorage.setItem(KEY_SKIPPED, new Date().toISOString())
    } catch {
      /* ignore */
    }
    setOpen(false)
  }

  if (!mounted) return null

  return (
    <WelcomeWizard
      open={open}
      onOpenChange={setOpen}
      onComplete={handleComplete}
      onSkip={handleSkip}
    />
  )
}
