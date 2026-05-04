"use client"

/**
 * Left-rail session list. One row per active terminal. Click to focus, ⋯ menu
 * for rename/customise/stop. Idle/stopped/crashed states get distinct colored
 * dots so Dylan can scan all sessions at a glance.
 *
 * Phase 4 #7 + #11 surface:
 *   - per-session color + icon + nickname (rendered next to title)
 *   - 6-state lifecycle dot derived from `lifecycle_state` (with legacy
 *     `status` fallback) — see `terminal-style.ts` / `deriveLifecycle`.
 */
import { useState } from "react"
import { Loader2, X, MoreHorizontal, Pause, Palette } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { CustomizeSessionDialog } from "./customize-session-dialog"
import { colorClasses, iconFor, deriveLifecycle, LIFECYCLE_META } from "./terminal-style"

export interface SessionRow {
  id: string
  title: string
  branch?: string
  status?: "starting" | "running" | "idle" | "stopped" | "crashed" | "paused"
  /** Phase 4 #11 — preferred over legacy `status` when present. */
  lifecycle_state?: string | null
  created_at: string
  last_activity_at?: string
  cost_usd?: number
  cost_cap_usd?: number
  paused_reason?: string | null
  /** Phase 4 #7. */
  color?: string | null
  icon?: string | null
  nickname?: string | null
}

interface Props {
  sessions: SessionRow[]
  focusedId: string | null
  loading?: boolean
  onFocus: (id: string) => void
  onRename: (id: string, title: string) => void
  onStop: (id: string) => void
  /** Optimistic patch — caller should mirror locally so the dot/icon updates
   *  before the next list refresh. Optional; omitted callers wait for refresh. */
  onCustomized?: (id: string, patch: { color?: string | null; icon?: string | null; nickname?: string | null }) => void
}

export function SessionList({ sessions, focusedId, loading, onFocus, onRename, onStop, onCustomized }: Props) {
  const [customisingId, setCustomisingId] = useState<string | null>(null)
  const customising = customisingId ? sessions.find((s) => s.id === customisingId) : null

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-zinc-800/60 text-[10px] uppercase tracking-wider text-zinc-500 sticky top-0 bg-zinc-950/90 backdrop-blur z-10 flex items-center justify-between">
        <span>{sessions.length} session{sessions.length === 1 ? "" : "s"}</span>
        {loading && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 && !loading && (
          <div className="px-4 py-8 text-center text-xs text-zinc-500">
            No terminals yet.<br />
            Click <span className="text-zinc-300">+ New terminal</span> to start.
          </div>
        )}
        {sessions.map((s) => {
          const focused = focusedId === s.id
          const lifecycle = deriveLifecycle(s)
          const lc = LIFECYCLE_META[lifecycle]
          const colors = colorClasses(s.color)
          const Icon = iconFor(s.icon)
          const displayName = s.nickname?.trim() || s.title
          return (
            <div
              key={s.id}
              className={cn(
                "group relative border-b border-zinc-800/30 transition-colors",
                focused ? colors.bgSoft : "hover:bg-zinc-800/40",
              )}
            >
              <button
                onClick={() => onFocus(s.id)}
                className="block w-full text-left px-3 py-2.5 pr-9"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn("h-2 w-2 rounded-full shrink-0", lc.dot, lc.pulse && "animate-pulse")}
                    title={lc.label}
                  />
                  <Icon className={cn("w-3.5 h-3.5 shrink-0", colors.text)} />
                  <span className={cn(
                    "text-sm font-medium truncate",
                    focused ? colors.text : "text-zinc-200",
                  )}>
                    {displayName}
                  </span>
                </div>
                {s.nickname?.trim() && s.nickname.trim() !== s.title && (
                  <div className="text-[10px] text-zinc-500 mt-0.5 truncate pl-5">{s.title}</div>
                )}
                {s.branch && (
                  <div className="text-[11px] text-zinc-500 mt-1 truncate font-mono pl-5">
                    {s.branch}
                  </div>
                )}
                <div className="text-[10px] text-zinc-600 mt-0.5 flex items-center gap-2 pl-5">
                  <span>{timeAgo(s.last_activity_at || s.created_at)}</span>
                  <CostBadge cost={s.cost_usd || 0} cap={s.cost_cap_usd || 5} />
                  <span className={cn("inline-flex items-center gap-1", lc.text)}>
                    {lc.label}
                  </span>
                </div>
                {lifecycle === "paused" && s.paused_reason && (
                  <div className="text-[10px] text-orange-300 mt-1 flex items-center gap-1 pl-5">
                    <Pause className="w-2.5 h-2.5" />
                    <span className="truncate">{s.paused_reason}</span>
                  </div>
                )}
              </button>

              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-200"
                      title="More"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      className="min-w-[180px] bg-zinc-900 border border-zinc-800 rounded-md shadow-xl py-1 text-sm z-50"
                    >
                      <DropdownMenu.Item
                        onSelect={() => {
                          const next = window.prompt("Rename terminal", s.title)?.trim()
                          if (next && next !== s.title) onRename(s.id, next)
                        }}
                        className="px-3 py-1.5 cursor-pointer outline-none data-[highlighted]:bg-zinc-800 text-zinc-200"
                      >
                        Rename
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        onSelect={() => setCustomisingId(s.id)}
                        className="px-3 py-1.5 cursor-pointer outline-none data-[highlighted]:bg-zinc-800 text-zinc-200 flex items-center gap-2"
                      >
                        <Palette className="w-3.5 h-3.5" />
                        Color, icon &amp; nickname
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator className="h-px bg-zinc-800 my-1" />
                      <DropdownMenu.Item
                        onSelect={() => {
                          if (window.confirm(`Stop "${s.title}"? The branch is preserved.`)) {
                            onStop(s.id)
                          }
                        }}
                        className="px-3 py-1.5 cursor-pointer outline-none data-[highlighted]:bg-zinc-800 text-red-400 flex items-center gap-2"
                      >
                        <X className="w-3.5 h-3.5" />
                        Stop terminal
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            </div>
          )
        })}
      </div>
      {customising && (
        <CustomizeSessionDialog
          open={customisingId !== null}
          onOpenChange={(v) => { if (!v) setCustomisingId(null) }}
          sessionId={customising.id}
          current={{
            title: customising.title,
            color: customising.color,
            icon: customising.icon,
            nickname: customising.nickname,
          }}
          onChanged={(patch) => onCustomized?.(customising.id, patch)}
        />
      )}
    </div>
  )
}

function CostBadge({ cost, cap }: { cost: number; cap: number }) {
  const pct = cap > 0 ? cost / cap : 0
  const color =
    pct >= 0.8 ? "text-red-300" : pct >= 0.5 ? "text-amber-300" : "text-zinc-500"
  return (
    <span className={color} title={`${cost.toFixed(2)} of $${cap.toFixed(2)} cap`}>
      ${cost.toFixed(2)}
    </span>
  )
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return "just now"
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}
