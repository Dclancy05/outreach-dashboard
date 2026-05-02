"use client"
/**
 * Mobile-only single-pane stack navigator for /agency/memory.
 *
 * State: tree → file → rail
 *   - "tree"  : full-width tree pane
 *   - "file"  : full-width editor; back button returns to tree
 *   - "rail"  : full-width right rail (Chat/Info/History/Memories); back returns to file
 *
 * Used at viewports < 1024px. Triggered by the parent page when window width
 * drops below the breakpoint. Selecting a file in tree advances to "file";
 * tapping the rail icon advances to "rail".
 */
import * as React from "react"
import { ArrowLeft, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"

export type PaneStackState = "tree" | "file" | "rail"

interface Props {
  state: PaneStackState
  onBack: () => void
  onOpenRail: () => void
  selectedPath: string | null
  treePane: React.ReactNode
  filePane: React.ReactNode
  railPane: React.ReactNode
}

export function PaneStack({
  state, onBack, onOpenRail, selectedPath, treePane, filePane, railPane,
}: Props) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Sub-header for back nav (only when not on tree) */}
      {state !== "tree" && (
        <div className="h-10 px-3 flex items-center gap-2 border-b border-mem-border bg-mem-surface-1 shrink-0">
          <button
            onClick={onBack}
            aria-label="Back"
            className="h-7 w-7 grid place-items-center rounded-md text-mem-text-secondary hover:text-mem-text-primary hover:bg-mem-surface-2 transition-colors"
          >
            <ArrowLeft size={14} />
          </button>
          <span className="font-mono text-[11px] text-mem-text-muted truncate flex-1">
            {selectedPath || (state === "rail" ? "Side panel" : "Editor")}
          </span>
          {state === "file" && (
            <button
              onClick={onOpenRail}
              aria-label="Open side panel"
              className="h-7 px-2 rounded-md text-mem-text-secondary hover:text-mem-text-primary hover:bg-mem-surface-2 transition-colors inline-flex items-center gap-1.5 text-[11px]"
            >
              <MessageSquare size={12} />
              Chat
            </button>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        <div className={cn("absolute inset-0", state === "tree" ? "block" : "hidden")}>
          {treePane}
        </div>
        <div className={cn("absolute inset-0", state === "file" ? "block" : "hidden")}>
          {filePane}
        </div>
        <div className={cn("absolute inset-0", state === "rail" ? "block" : "hidden")}>
          {railPane}
        </div>
      </div>
    </div>
  )
}

/** Hook: tracks whether the viewport is below the lg breakpoint (1024px). */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)")
    const handler = (e: MediaQueryListEvent | MediaQueryList) =>
      setIsMobile("matches" in e ? e.matches : (e as MediaQueryList).matches)
    handler(mq)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return isMobile
}

/** Hook: tracks whether the viewport is below the sm breakpoint (640px). */
export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const handler = (e: MediaQueryListEvent | MediaQueryList) =>
      setNarrow("matches" in e ? e.matches : (e as MediaQueryList).matches)
    handler(mq)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return narrow
}
