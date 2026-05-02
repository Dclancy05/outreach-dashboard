"use client"

// Tool-call history strip — last 20 calls for the (server, tool) pair.
//
// Backed by GET /api/mcp/calls?server_id=<id>&tool=<name>&limit=20. Note that
// `tool` is a hint — B1's calls route currently filters by server only, so we
// also filter client-side to stay accurate when the server adds the param.
//
// Each row renders:
//   - timestamp (relative, with full timestamp on hover)
//   - status badge
//   - duration_ms
//   - args preview (mono, single-line, truncated)
//   - Replay button → calls onReplay() with args_redacted (raw args may have
//     been scrubbed by the broker, so replay rehydrates with what we have).

import * as React from "react"
import useSWR from "swr"
import { Play } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ListCallsResponse, McpToolCall } from "@/lib/mcp/types"

interface ToolCallHistoryProps {
  serverId: string
  toolName: string | null
  /** Optimistic prepended row (added immediately after a Run, before SWR refetch). */
  pendingRow?: McpToolCall | null
  /** Bumped by parent after a successful run so SWR refetches. */
  refreshKey?: number
  onReplay: (args: Record<string, unknown>) => void
  className?: string
}

interface CallsFetchKey {
  url: string
  refreshKey: number
}

const fetcher = async (key: CallsFetchKey): Promise<ListCallsResponse> => {
  const res = await fetch(key.url, {
    credentials: "include",
    cache: "no-store",
  })
  if (res.status === 404) return { calls: [], next_cursor: null }
  if (!res.ok) throw new Error(`Failed to load history: ${res.status}`)
  return (await res.json()) as ListCallsResponse
}

export function ToolCallHistory({
  serverId,
  toolName,
  pendingRow,
  refreshKey = 0,
  onReplay,
  className,
}: ToolCallHistoryProps) {
  const url = React.useMemo(() => {
    const p = new URLSearchParams()
    p.set("server_id", serverId)
    if (toolName) p.set("tool", toolName)
    p.set("limit", "20")
    return `/api/mcp/calls?${p.toString()}`
  }, [serverId, toolName])

  const { data, error, isLoading } = useSWR<ListCallsResponse>(
    { url, refreshKey },
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  )

  const all: McpToolCall[] = React.useMemo(() => {
    const fromApi = data?.calls ?? []
    // Filter client-side to the active tool (B1 may not honor `tool=`).
    const filtered = toolName ? fromApi.filter((c) => c.tool_name === toolName) : fromApi
    if (pendingRow) {
      return [pendingRow, ...filtered].slice(0, 20)
    }
    return filtered.slice(0, 20)
  }, [data, toolName, pendingRow])

  if (isLoading && !data) {
    return (
      <div className={cn("space-y-1", className)}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-7 animate-pulse rounded bg-mem-surface-2"
          />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <p className={cn("text-[11px] text-red-300", className)}>
        Couldn&apos;t load history.
      </p>
    )
  }

  if (all.length === 0) {
    return (
      <p
        className={cn(
          "rounded-md border border-dashed border-mem-border bg-mem-surface-2 p-2 text-center text-[11px] text-mem-text-muted",
          className
        )}
      >
        No calls yet for this tool.
      </p>
    )
  }

  return (
    <ul
      className={cn("space-y-0.5", className)}
      data-testid="mcps-tool-history"
      aria-label={`Recent calls for ${toolName ?? "tool"}`}
    >
      {all.map((c) => (
        <HistoryRow key={c.id || `${c.created_at}-${c.tool_name}`} call={c} onReplay={onReplay} />
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Row                                        */
/* -------------------------------------------------------------------------- */

function HistoryRow({
  call,
  onReplay,
}: {
  call: McpToolCall
  onReplay: (args: Record<string, unknown>) => void
}) {
  const args = call.args_redacted ?? call.args_json ?? {}
  const argsPreview = React.useMemo(() => {
    if (!args || (typeof args === "object" && Object.keys(args as Record<string, unknown>).length === 0)) {
      return "—"
    }
    try {
      const s = JSON.stringify(args)
      return s.length > 64 ? `${s.slice(0, 61)}…` : s
    } catch {
      return "—"
    }
  }, [args])

  const statusClass =
    call.status === "ok"
      ? "bg-green-500/10 text-green-300"
      : call.status === "rejected"
        ? "bg-amber-500/10 text-amber-300"
        : "bg-red-500/10 text-red-300"

  const tsTitle = call.created_at
  const tsRelative = formatRelativeShort(call.created_at)

  return (
    <li className="group flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-[11px] transition-colors hover:border-mem-border hover:bg-mem-surface-2">
      <time
        dateTime={call.created_at}
        title={tsTitle}
        className="w-10 shrink-0 font-mono text-[10px] text-mem-text-muted"
      >
        {tsRelative}
      </time>
      <span
        className={cn(
          "shrink-0 rounded px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em]",
          statusClass
        )}
      >
        {call.status}
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-[10px] text-mem-text-secondary">
        {call.duration_ms != null ? `${call.duration_ms}ms` : "—"}
      </span>
      <code className="flex-1 truncate font-mono text-[10.5px] text-mem-text-secondary">
        {argsPreview}
      </code>
      <button
        type="button"
        onClick={() => onReplay((args && typeof args === "object" ? args : {}) as Record<string, unknown>)}
        aria-label="Replay this call"
        className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-mem-text-muted transition-colors hover:bg-white/[0.04] hover:text-mem-text-primary"
      >
        <Play className="h-3 w-3" />
        <span className="font-mono text-[10px] uppercase tracking-[0.06em]">Replay</span>
      </button>
    </li>
  )
}

function formatRelativeShort(iso: string): string {
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return "—"
  const delta = Math.max(0, Date.now() - ts)
  const sec = Math.floor(delta / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  return `${day}d`
}
