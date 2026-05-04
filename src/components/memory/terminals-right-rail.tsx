"use client"
/**
 * Right rail variant rendered in `terminals` mode.
 *
 * Two tabs:
 *   - Activity → reuses the existing <ActivityFeed /> from /agency/terminals.
 *   - Siblings → placeholder for the Phase 2 sibling-aware panel (a per-session
 *                "doing right now" feed). Wires up empty-state messaging today
 *                so the surface exists; the data feed lands when the
 *                /api/terminals/siblings endpoint ships in Phase 2.
 *
 * The rail collapses to an icon strip on <md (matches RightRail behavior).
 */
import * as React from "react"
import { Activity, ChevronLeft, ChevronRight, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ActivityFeed } from "@/components/terminals/activity-feed"

type Tab = "activity" | "siblings"

interface Props {
  /** Map of session id → title so the feed can render readable labels. */
  sessionTitles: Record<string, string>
  defaultCollapsed?: boolean
}

function useBelowMd(): boolean {
  const [below, setBelow] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const handler = (e: MediaQueryListEvent | MediaQueryList) =>
      setBelow("matches" in e ? e.matches : (e as MediaQueryList).matches)
    handler(mq)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return below
}

export function TerminalsRightRail({ sessionTitles, defaultCollapsed = false }: Props) {
  const belowMd = useBelowMd()
  const [userCollapsed, setUserCollapsed] = React.useState(defaultCollapsed)
  const collapsed = belowMd ? true : userCollapsed
  const [tab, setTab] = React.useState<Tab>("activity")

  const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
    { id: "activity", label: "Activity", icon: Activity },
    { id: "siblings", label: "Siblings", icon: Users },
  ]

  return (
    <aside
      className={cn(
        "h-full bg-mem-surface-1 border-l border-mem-border flex flex-col transition-[width] duration-[220ms] ease-mem-spring shrink-0"
      )}
      style={{ width: collapsed ? 48 : 320 }}
      aria-label="Terminals side panel"
    >
      <div
        className={cn(
          "h-12 border-b border-mem-border flex items-center",
          collapsed ? "flex-col gap-2 py-3 h-auto" : "px-2 gap-1"
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-1 bg-mem-surface-2 border border-mem-border rounded-lg p-0.5 flex-wrap">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "h-6 px-2 rounded-md text-[11px] font-medium inline-flex items-center gap-1 transition-colors",
                    active
                      ? "bg-mem-surface-3 text-mem-text-primary"
                      : "text-mem-text-secondary hover:text-mem-text-primary"
                  )}
                  aria-pressed={active}
                >
                  <Icon size={11} />
                  {t.label}
                </button>
              )
            })}
          </div>
        )}
        {collapsed &&
          TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id)
                  if (!belowMd) setUserCollapsed(false)
                }}
                className={cn(
                  "h-7 w-7 grid place-items-center rounded-md transition-colors",
                  active
                    ? "bg-mem-surface-3 text-mem-text-primary"
                    : "text-mem-text-secondary hover:text-mem-text-primary hover:bg-mem-surface-2"
                )}
                aria-label={t.label}
                title={t.label}
              >
                <Icon size={14} />
              </button>
            )
          })}
        {!belowMd && (
          <button
            onClick={() => setUserCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand side panel" : "Collapse side panel"}
            className={cn(
              "h-6 w-6 grid place-items-center rounded-md text-mem-text-muted hover:text-mem-text-primary hover:bg-mem-surface-2 transition-colors",
              !collapsed && "ml-auto"
            )}
          >
            {collapsed ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="flex-1 min-h-0 flex flex-col">
          {tab === "activity" && (
            // ActivityFeed is styled for the dark zinc terminals workspace; we
            // wrap it in the mem-surface theme so it lives comfortably inside
            // the Memory rail.
            <div className="flex-1 min-h-0 bg-zinc-950">
              <ActivityFeed sessionTitles={sessionTitles} />
            </div>
          )}
          {tab === "siblings" && <SiblingsPlaceholder />}
        </div>
      )}
    </aside>
  )
}

function SiblingsPlaceholder() {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.04em] font-semibold text-mem-text-muted mb-2">
        Sibling sessions
      </div>
      <div className="rounded-xl border border-dashed border-mem-border bg-mem-surface-2 px-3 py-4 text-[11.5px] text-mem-text-secondary leading-relaxed">
        <p>
          A live &ldquo;what each terminal is doing right now&rdquo; panel lands
          in Phase 2. Each card will show a one-sentence status, the current
          todo, last error, and a one-tap focus button.
        </p>
        <p className="mt-2 text-[11px] text-mem-text-muted">
          The data already exists on the VPS at{" "}
          <code className="px-1 py-px rounded bg-mem-surface-3 text-mem-text-primary">
            /dev/shm/terminal-siblings/
          </code>
          . The /api/terminals/siblings endpoint will surface it.
        </p>
      </div>
    </div>
  )
}
