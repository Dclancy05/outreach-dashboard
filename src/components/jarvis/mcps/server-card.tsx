"use client"

// MCP server card — the unit of the grid view.
//
// Layout (~280×180):
//   ┌─────────────────────────────────────────────────────┐
//   │  [emoji]  Name                       [status pill]  │
//   │           provider · transport                       │
//   │                                                     │
//   │  description goes here, single line, truncated      │
//   │                                                     │
//   │  health-checked 2m ago                              │
//   │  ▰▰▰▰▰▱▱▱▱▱   42 / 250 calls today                  │
//   └─────────────────────────────────────────────────────┘
//
// Hover: lifts 1px + soft accent shadow.
// Click: bubbles to onSelect(id) so the parent can open the drawer.

import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { McpHealthBadge } from "./mcp-health-badge"
import type { McpServer } from "@/lib/mcp/types"

interface ServerCardProps {
  server: McpServer
  onSelect: (id: string) => void
}

const PROVIDER_EMOJI: Record<string, string> = {
  playwright: "🎭",
  postgres: "🗄️",
  "brave-search": "🦁",
  github: "🐙",
  vercel: "▲",
  sentry: "🛡️",
  custom: "🔌",
}

function emojiFor(provider: string): string {
  return PROVIDER_EMOJI[provider] ?? "🔌"
}

function formatRelative(iso: string | null): string {
  if (!iso) return "never"
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return "never"
  const delta = Date.now() - ts
  const sec = Math.floor(delta / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

export function ServerCard({ server, onSelect }: ServerCardProps) {
  const reduced = useReducedMotion()
  const cap = Math.max(server.daily_call_cap || 1, 1)
  const used = Math.min(server.calls_today || 0, cap)
  const pct = Math.round((used / cap) * 100)
  const overCap = used >= cap

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(server.id)}
      whileHover={reduced ? undefined : { y: -2 }}
      transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
      aria-label={`Open ${server.name} details`}
      data-testid={`mcp-server-card-${server.slug}`}
      className={cn(
        "group flex h-[180px] w-full flex-col justify-between rounded-xl border border-mem-border bg-mem-surface-1 p-4 text-left transition-colors",
        "hover:border-mem-border-strong hover:shadow-[0_8px_24px_-12px_rgba(124,92,255,0.35)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mem-accent focus-visible:ring-offset-2 focus-visible:ring-offset-mem-bg"
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mem-surface-2 text-lg"
          >
            {emojiFor(server.provider)}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-semibold text-mem-text-primary">
              {server.name}
            </h3>
            <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-mem-text-muted">
              {server.provider} · {server.transport}
            </p>
          </div>
        </div>
        <McpHealthBadge status={server.status} />
      </div>

      {/* Mid: 1-line description */}
      <p
        className="mt-2 line-clamp-1 text-[12px] text-mem-text-secondary"
        title={describeServer(server)}
      >
        {describeServer(server)}
      </p>

      {/* Footer: last health + cap meter */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between font-mono text-[10px] text-mem-text-muted">
          <span>checked {formatRelative(server.last_health_check_at)}</span>
          <span
            className={cn(
              overCap && "text-amber-300"
            )}
          >
            {used}/{cap}
          </span>
        </div>
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-mem-surface-2"
          role="progressbar"
          aria-label={`${used} of ${cap} daily calls used`}
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={cap}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              overCap
                ? "bg-amber-400"
                : pct > 75
                  ? "bg-mem-accent/80"
                  : "bg-mem-accent/60"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </motion.button>
  )
}

function describeServer(server: McpServer): string {
  const tools = server.capabilities?.tools?.length ?? 0
  if (tools > 0) {
    return `${tools} tool${tools === 1 ? "" : "s"} available${
      server.endpoint_url ? ` · ${shortHost(server.endpoint_url)}` : ""
    }`
  }
  if (server.last_error) return server.last_error
  if (server.endpoint_url) return shortHost(server.endpoint_url)
  return "No description"
}

function shortHost(url: string): string {
  try {
    const u = new URL(url)
    return u.host + (u.pathname && u.pathname !== "/" ? u.pathname : "")
  } catch {
    return url
  }
}
