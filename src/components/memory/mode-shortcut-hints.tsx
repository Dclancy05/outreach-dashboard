"use client"
/**
 * Floating bottom hint strip showing the `g <key>` shortcuts to switch
 * between Command Center modes. Shown on lg+ only (small screens have
 * limited room and the chips are right there at the top).
 *
 * Visibility: opens for ~5s when the page first loads or when the user
 * presses `?`. The Zellij-style hint pattern — visible just long enough to
 * teach the binding without permanent screen real-estate.
 */
import * as React from "react"
import { cn } from "@/lib/utils"

const HINTS: { keys: string; label: string }[] = [
  { keys: "g k", label: "Knowledge" },
  { keys: "g c", label: "Code" },
  { keys: "g v", label: "Conversations" },
  { keys: "g a", label: "Agents" },
  { keys: "g t", label: "Terminals" },
  { keys: "?", label: "Show hints" },
]

export function ModeShortcutHints() {
  const [visible, setVisible] = React.useState(true)

  React.useEffect(() => {
    // Auto-hide after 5s on mount.
    const t = window.setTimeout(() => setVisible(false), 5000)
    return () => window.clearTimeout(t)
  }, [])

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "?" && !isTypingTarget(e.target)) {
        setVisible((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "hidden lg:flex pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 z-40 transition-all duration-300",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      )}
    >
      <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-mem-border bg-mem-surface-1/90 backdrop-blur px-3 py-1.5 shadow-lg">
        {HINTS.map((h, i) => (
          <React.Fragment key={h.keys}>
            {i > 0 && <span className="text-mem-text-muted/40">·</span>}
            <span className="inline-flex items-center gap-1 text-[10.5px] text-mem-text-secondary">
              <kbd className="px-1.5 py-0.5 rounded bg-mem-surface-3 border border-mem-border font-mono text-[10px] text-mem-text-primary">
                {h.keys}
              </kbd>
              {h.label}
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable
}
