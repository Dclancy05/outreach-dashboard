"use client"

/**
 * Left-rail session list. One row per active terminal. Click to focus, ⋯ menu
 * for rename/stop. Idle/stopped/crashed states get distinct colored dots so
 * Dylan can scan all sessions at a glance.
 */
import { Loader2, X, MoreHorizontal, Pause } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"

export interface SessionRow {
  id: string
  title: string
  branch?: string
  status?: "starting" | "running" | "idle" | "stopped" | "crashed" | "paused"
  created_at: string
  last_activity_at?: string
  cost_usd?: number
  cost_cap_usd?: number
  paused_reason?: string | null
}

const STATUS_COLOR: Record<NonNullable<SessionRow["status"]>, string> = {
  starting: "bg-amber-400 animate-pulse",
  running: "bg-emerald-400",
  idle: "bg-zinc-500",
  stopped: "bg-zinc-700",
  crashed: "bg-red-500",
  paused: "bg-orange-400",
}

interface Props {
  sessions: SessionRow[]
  focusedId: string | null
  loading?: boolean
  onFocus: (id: string) => void
  onRename: (id: string, title: string) => void
  onStop: (id: string) => void
}

export function SessionList({ sessions, focusedId, loading, onFocus, onRename, onStop }: Props) {
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
          const status = s.status || "running"
          return (
            <div
              key={s.id}
              className={cn(
                "group relative border-b border-zinc-800/30 transition-colors",
                focused ? "bg-amber-500/10" : "hover:bg-zinc-800/40",
              )}
            >
              <button
                onClick={() => onFocus(s.id)}
                className="block w-full text-left px-3 py-2.5 pr-9"
              >
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full shrink-0", STATUS_COLOR[status])} />
                  <span className={cn("text-sm font-medium truncate", focused ? "text-amber-100" : "text-zinc-200")}>
                    {s.title}
                  </span>
                </div>
                {s.branch && (
                  <div className="text-[11px] text-zinc-500 mt-1 truncate font-mono">
                    {s.branch}
                  </div>
                )}
                <div className="text-[10px] text-zinc-600 mt-0.5 flex items-center gap-2">
                  <span>{timeAgo(s.last_activity_at || s.created_at)}</span>
                  <CostBadge cost={s.cost_usd || 0} cap={s.cost_cap_usd || 5} />
                </div>
                {status === "paused" && s.paused_reason && (
                  <div className="text-[10px] text-orange-300 mt-1 flex items-center gap-1">
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
                      className="min-w-[160px] bg-zinc-900 border border-zinc-800 rounded-md shadow-xl py-1 text-sm z-50"
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
