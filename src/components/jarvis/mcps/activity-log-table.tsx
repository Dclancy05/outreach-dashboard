"use client"

// Activity log table — paginated calls list, backed by GET /api/mcp/calls.
//
// Two modes:
//   1. drawer mode  — server_id passed in; renders a compact list scoped to that server.
//   2. page mode    — server_id omitted; renders all calls (used by the "Activity Log" tab).
//
// Pagination is cursor-based (next_cursor from ListCallsResponse). The fetcher
// uses credentials: 'include' so admin_session cookie rides along.
//
// While B1's API is in flight, this falls back to an empty list with a friendly
// "No calls yet" empty state — never throws.

import * as React from "react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { McpsActivityRowSkeleton } from "./loading-skeleton"
import { McpsEmptyState } from "./empty-state"
import type { ListCallsResponse, McpToolCall } from "@/lib/mcp/types"

interface ActivityLogTableProps {
  serverId?: string
  pageSize?: number
  className?: string
}

interface CallsFetchKey {
  url: string
}

const fetcher = async (key: CallsFetchKey): Promise<ListCallsResponse> => {
  const res = await fetch(key.url, {
    credentials: "include",
    cache: "no-store",
  })
  if (!res.ok) {
    // Soft-fail: return empty so UI shows the empty state, not a crash.
    if (res.status === 404) return { calls: [], next_cursor: null }
    throw new Error(`Failed to fetch calls: ${res.status}`)
  }
  return (await res.json()) as ListCallsResponse
}

export function ActivityLogTable({
  serverId,
  pageSize = 25,
  className,
}: ActivityLogTableProps) {
  const [cursor, setCursor] = React.useState<string | null>(null)

  const url = React.useMemo(() => {
    const params = new URLSearchParams()
    if (serverId) params.set("server_id", serverId)
    params.set("limit", String(pageSize))
    if (cursor) params.set("cursor", cursor)
    return `/api/mcp/calls?${params.toString()}`
  }, [serverId, pageSize, cursor])

  const { data, error, isLoading } = useSWR<ListCallsResponse>(
    { url },
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  )

  if (isLoading && !data) {
    return (
      <div className={className}>
        <McpsActivityRowSkeleton rows={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-md border border-red-400/30 bg-red-400/5 p-4 text-[12px] text-red-300",
          className
        )}
        role="alert"
      >
        Couldn&apos;t load activity. Try again in a moment.
      </div>
    )
  }

  const calls = data?.calls ?? []
  if (calls.length === 0) {
    return (
      <div className={className}>
        <McpsEmptyState
          onAdd={() => {
            /* no-op for activity empty */
          }}
          title="No tool calls yet"
          description={
            serverId
              ? "Once Jarvis calls a tool on this server, it'll show up here."
              : "When Jarvis runs an MCP tool, the call lands here in real time."
          }
          ctaLabel="Run a tool"
        />
      </div>
    )
  }

  return (
    <div className={cn("space-y-2", className)} data-testid="mcps-activity-log">
      <div className="overflow-hidden rounded-md border border-mem-border">
        <table className="w-full text-left text-[12px]">
          <thead className="bg-mem-surface-2 font-mono text-[10px] uppercase tracking-[0.08em] text-mem-text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Tool</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Duration</th>
              <th className="px-3 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => (
              <CallRow key={c.id} call={c} />
            ))}
          </tbody>
        </table>
      </div>

      {data?.next_cursor && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCursor(data.next_cursor)}
            className="h-8 text-[12px]"
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}

function CallRow({ call }: { call: McpToolCall }) {
  const statusColor =
    call.status === "ok"
      ? "text-green-400"
      : call.status === "rejected"
        ? "text-amber-300"
        : "text-red-300"

  return (
    <tr className="border-t border-mem-border bg-mem-surface-1 hover:bg-mem-surface-2">
      <td className="px-3 py-2 font-mono text-[11px] text-mem-text-primary">
        {call.tool_name}
      </td>
      <td className={cn("px-3 py-2 text-[11px] font-medium", statusColor)}>
        {call.status}
      </td>
      <td className="px-3 py-2 font-mono text-[10px] text-mem-text-secondary">
        {call.duration_ms != null ? `${call.duration_ms}ms` : "—"}
      </td>
      <td className="px-3 py-2 font-mono text-[10px] text-mem-text-muted">
        {formatRelativeShort(call.created_at)}
      </td>
    </tr>
  )
}

function formatRelativeShort(iso: string): string {
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return "—"
  const delta = Date.now() - ts
  const sec = Math.floor(delta / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  return `${day}d`
}
