"use client"

/**
 * Two-key "go" navigator. Press `g`, then within 1.2s press a destination
 * letter to jump to that route inside /jarvis. Inspired by Linear / GitHub.
 *
 * Mappings (kept in sync with JarvisHelpOverlay):
 *   g m → /jarvis/memory
 *   g a → /jarvis/agents
 *   g t → /jarvis/terminals
 *   g p → /jarvis/mcps
 *   g w → /jarvis/workflows
 *   g o → /jarvis/observability
 *   g s → /jarvis/status
 *   g i → /jarvis/integrations
 *   g . → /jarvis/settings
 *
 * Skips when:
 *  - User is typing in an <input>/<textarea>/contentEditable
 *  - A modal/drawer is open (Radix data-state="open" anywhere in DOM)
 *  - Modifier keys are held (don't hijack Cmd-G "find next")
 */

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"

const NAV_MAP: Record<string, string> = {
  m: "/jarvis/memory",
  a: "/jarvis/agents",
  t: "/jarvis/terminals",
  p: "/jarvis/mcps",
  w: "/jarvis/workflows",
  o: "/jarvis/observability",
  s: "/jarvis/status",
  i: "/jarvis/integrations",
  ".": "/jarvis/settings",
}

const ARMED_WINDOW_MS = 1200

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const t = target as HTMLElement
  if (t.isContentEditable) return true
  const tag = t.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

function isAnyDialogOpen(): boolean {
  // Radix marks open dialogs/popovers with data-state="open" on the content
  // element. If any are open we don't want g-nav to fire.
  if (typeof document === "undefined") return false
  return document.querySelector('[data-state="open"][role="dialog"]') !== null
}

export function JarvisGoNavListener() {
  const router = useRouter()
  const pathname = usePathname() ?? ""

  useEffect(() => {
    if (!pathname.startsWith("/jarvis")) return

    let armedAt: number | null = null
    let armTimer: ReturnType<typeof setTimeout> | null = null

    const disarm = () => {
      armedAt = null
      if (armTimer) {
        clearTimeout(armTimer)
        armTimer = null
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        disarm()
        return
      }
      if (isTypingTarget(e.target)) return
      if (isAnyDialogOpen()) return

      const key = e.key.toLowerCase()

      if (armedAt === null) {
        if (key === "g") {
          armedAt = Date.now()
          armTimer = setTimeout(disarm, ARMED_WINDOW_MS)
        }
        return
      }

      // Armed — second key
      const elapsed = Date.now() - armedAt
      if (elapsed > ARMED_WINDOW_MS) {
        disarm()
        return
      }
      const target = NAV_MAP[key]
      if (target) {
        e.preventDefault()
        router.push(target)
      }
      disarm()
    }

    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      disarm()
    }
  }, [router, pathname])

  return null
}
