"use client"

// MCP tool playground.
//
// Mounts inside the drawer's Tools tab via the slot mechanism wired by W4.A.B2:
//
//   <div data-slot="tool-playground" data-server-id={serverId} />
//
// `<ToolPlaygroundSlot />` (exported below) scans the DOM for any element
// matching that selector and uses createPortal to render <ToolPlayground />
// into them. The shell mounts <ToolPlaygroundSlot /> once at the page level
// so every drawer instance gets filled — no per-drawer wiring required.
//
// The body of the playground (top-to-bottom):
//   1. Tool picker  (combobox; auto-selects first tool on mount)
//   2. JSON-Schema form derived from `inputSchema`
//   3. Run button
//   4. Result viewer (collapsible JSON tree + Shiki "Raw" mode)
//   5. History strip (last 20 calls; Replay rehydrates the form)

import * as React from "react"
import { createPortal } from "react-dom"
import useSWR from "swr"
import { Play, Loader2, RefreshCw, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { JsonSchemaForm } from "./json-schema-form"
import { ToolResultViewer } from "./tool-result-viewer"
import { ToolCallHistory } from "./tool-call-history"
import type {
  InvokeMcpToolBody,
  InvokeMcpToolResult,
  McpToolCall,
  McpToolDescriptor,
} from "@/lib/mcp/types"

interface ToolsListResponse {
  tools: McpToolDescriptor[]
  cached?: boolean
}

interface ToolsFetchKey {
  url: string
}

const toolsFetcher = async (key: ToolsFetchKey): Promise<ToolsListResponse> => {
  const res = await fetch(key.url, {
    credentials: "include",
    cache: "no-store",
  })
  if (!res.ok) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      // ignore
    }
    const msg = (body && typeof body === "object" && "error" in body
      ? String((body as Record<string, unknown>).error)
      : `tools/list failed: ${res.status}`)
    throw new Error(msg)
  }
  return (await res.json()) as ToolsListResponse
}

/* -------------------------------------------------------------------------- */
/*                              Public component                               */
/* -------------------------------------------------------------------------- */

export interface ToolPlaygroundProps {
  serverId: string
  className?: string
}

export function ToolPlayground({ serverId, className }: ToolPlaygroundProps) {
  const { data, error, isLoading, mutate } = useSWR<ToolsListResponse>(
    { url: `/api/mcp/servers/${serverId}/tools` },
    toolsFetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  )

  const tools: McpToolDescriptor[] = data?.tools ?? []

  const [selectedTool, setSelectedTool] = React.useState<string | null>(null)
  const [argValues, setArgValues] = React.useState<Record<string, unknown>>({})
  const [running, setRunning] = React.useState(false)
  const [runError, setRunError] = React.useState<string | null>(null)
  const [runResult, setRunResult] = React.useState<InvokeMcpToolResult | null>(null)
  const [pendingRow, setPendingRow] = React.useState<McpToolCall | null>(null)
  const [historyRefresh, setHistoryRefresh] = React.useState(0)

  // Auto-select the first tool when the list loads or the server changes.
  React.useEffect(() => {
    if (tools.length === 0) {
      setSelectedTool(null)
      return
    }
    setSelectedTool((prev) => {
      if (prev && tools.some((t) => t.name === prev)) return prev
      return tools[0].name
    })
  }, [tools, serverId])

  // Reset form state when switching tools.
  React.useEffect(() => {
    setArgValues({})
    setRunResult(null)
    setRunError(null)
    setPendingRow(null)
  }, [selectedTool])

  const activeTool = React.useMemo(
    () => tools.find((t) => t.name === selectedTool) ?? null,
    [tools, selectedTool]
  )

  /* -------------------------------- Run -------------------------------- */

  const handleRun = async () => {
    if (!activeTool || running) return
    setRunning(true)
    setRunError(null)
    setRunResult(null)

    const startedAt = new Date().toISOString()
    // Optimistic history row — replaced once the API returns the persisted call.
    const optimistic: McpToolCall = {
      id: `pending-${startedAt}`,
      server_id: serverId,
      tool_name: activeTool.name,
      args_json: argValues,
      args_redacted: argValues,
      result_json: null,
      status: "ok",
      duration_ms: null,
      error: null,
      agent_id: null,
      run_id: null,
      created_at: startedAt,
    }
    setPendingRow(optimistic)

    const body: InvokeMcpToolBody = {
      tool: activeTool.name,
      args: argValues,
    }

    try {
      const res = await fetch(`/api/mcp/servers/${serverId}/invoke`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = { error: text.slice(0, 400) }
      }
      if (!res.ok) {
        const errMsg = (parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as Record<string, unknown>).error)
          : `Run failed: ${res.status}`)
        setRunError(errMsg)
        setRunResult({
          ok: false,
          call_id: "",
          duration_ms: 0,
          status: res.status === 429 ? "rejected" : "error",
          error: errMsg,
        })
      } else {
        const result = parsed as InvokeMcpToolResult
        setRunResult(result)
        if (!result.ok && result.error) setRunError(result.error)
      }
    } catch (e) {
      const err = e as Error
      setRunError(err.message || "Network error")
      setRunResult({
        ok: false,
        call_id: "",
        duration_ms: 0,
        status: "error",
        error: err.message,
      })
    } finally {
      setRunning(false)
      setPendingRow(null)
      // Bump the SWR key on the history strip so it refetches.
      setHistoryRefresh((n) => n + 1)
    }
  }

  const handleReplay = (args: Record<string, unknown>) => {
    setArgValues(args)
    setRunResult(null)
    setRunError(null)
  }

  /* --------------------------------- Render --------------------------------- */

  return (
    <section
      className={cn("space-y-4", className)}
      data-testid="mcps-tool-playground"
      aria-label="MCP tool playground"
    >
      {/* Tool picker */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="jarvis-section-label">Tool</h4>
          <button
            type="button"
            onClick={() => mutate()}
            aria-label="Refresh tool list"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-mem-text-muted transition-colors hover:bg-white/[0.04] hover:text-mem-text-primary"
          >
            <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
            Refresh
          </button>
        </div>
        {error ? (
          <ToolsError error={error} onRetry={() => mutate()} />
        ) : isLoading && tools.length === 0 ? (
          <div className="h-9 animate-pulse rounded-md bg-mem-surface-2" />
        ) : tools.length === 0 ? (
          <p className="rounded-md border border-dashed border-mem-border bg-mem-surface-2 p-3 text-[12px] text-mem-text-muted">
            No tools advertised by this server. Try a manual refresh — or check the server&apos;s health.
          </p>
        ) : (
          <Select
            value={selectedTool ?? undefined}
            onValueChange={(v) => setSelectedTool(v)}
          >
            <SelectTrigger
              data-testid="mcps-tool-picker"
              className="h-9 bg-mem-surface-2 text-[13px]"
            >
              <SelectValue placeholder="Pick a tool" />
            </SelectTrigger>
            <SelectContent>
              {tools.map((t) => (
                <SelectItem key={t.name} value={t.name} className="text-[13px]">
                  <span className="font-mono">{t.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {activeTool?.description && (
          <p className="text-[11px] text-mem-text-muted">
            {activeTool.description}
          </p>
        )}
      </div>

      {/* Form */}
      {activeTool && (
        <div className="space-y-3">
          <h4 className="jarvis-section-label">Arguments</h4>
          <JsonSchemaForm
            schema={activeTool.inputSchema}
            value={argValues}
            onChange={setArgValues}
          />
        </div>
      )}

      {/* Run button */}
      {activeTool && (
        <div className="flex items-center justify-end gap-2">
          {runError && !running && (
            <span className="flex items-center gap-1 text-[11px] text-red-300">
              <AlertCircle className="h-3 w-3" />
              {runError.length > 80 ? `${runError.slice(0, 77)}…` : runError}
            </span>
          )}
          <Button
            type="button"
            onClick={handleRun}
            disabled={running}
            data-testid="mcps-tool-run"
            className="h-9 gap-1.5 bg-mem-accent text-white hover:brightness-110"
          >
            {running ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Running…
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Run
              </>
            )}
          </Button>
        </div>
      )}

      {/* Result viewer */}
      {(runResult || runError) && (
        <ToolResultViewer
          value={runResult?.result}
          error={runError}
          durationMs={runResult?.duration_ms ?? null}
          status={runResult?.status ?? (runError ? "error" : null)}
        />
      )}

      {/* History */}
      {activeTool && (
        <div className="space-y-1.5 border-t border-mem-border pt-3">
          <div className="flex items-center justify-between">
            <h4 className="jarvis-section-label">Recent calls</h4>
            <span className="font-mono text-[10px] text-mem-text-muted">last 20</span>
          </div>
          <ToolCallHistory
            serverId={serverId}
            toolName={activeTool.name}
            pendingRow={pendingRow}
            refreshKey={historyRefresh}
            onReplay={handleReplay}
          />
        </div>
      )}
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*                          Tools-list error message                           */
/* -------------------------------------------------------------------------- */

function ToolsError({
  error,
  onRetry,
}: {
  error: Error | unknown
  onRetry: () => void
}) {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div className="flex items-start gap-2 rounded-md border border-red-400/30 bg-red-400/5 p-3 text-[12px] text-red-300">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <p className="break-words">Couldn&apos;t load tools: {msg}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-red-400/30 px-2 py-0.5 text-[11px] uppercase tracking-[0.06em] text-red-300 transition-colors hover:bg-red-400/10"
        >
          Retry
        </button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                Self-mounting slot filler (DOM-watcher portal)               */
/* -------------------------------------------------------------------------- */

/**
 * Mounted once at page level — scans the DOM for `[data-slot="tool-playground"]`
 * elements and portal-renders <ToolPlayground /> into each one. Watches for
 * subsequent additions/removals via MutationObserver so a drawer that opens
 * after page mount still gets filled.
 *
 * Keeping this a single component (instead of forcing the drawer to import the
 * playground directly) means W4.A.B2's drawer file stays untouched.
 */
export function ToolPlaygroundSlot() {
  const [slots, setSlots] = React.useState<HTMLElement[]>([])

  React.useEffect(() => {
    if (typeof document === "undefined") return

    const collect = (): HTMLElement[] => {
      const found = document.querySelectorAll<HTMLElement>("[data-slot=\"tool-playground\"]")
      return Array.from(found)
    }

    const sync = () => {
      const next = collect()
      setSlots((prev) => {
        if (prev.length === next.length && prev.every((el, i) => el === next[i])) {
          return prev
        }
        return next
      })
    }

    // Initial scan + watch for mutations (drawer opens lazily).
    sync()
    const observer = new MutationObserver(() => sync())
    observer.observe(document.body, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [])

  if (slots.length === 0) return null

  return (
    <>
      {slots.map((el) => (
        <SlotPortal key={domKey(el)} target={el} />
      ))}
    </>
  )
}

function SlotPortal({ target }: { target: HTMLElement }) {
  // The slot div from the drawer has placeholder text styles attached via
  // Tailwind classes. We strip those when we take over so our content owns the
  // visual treatment.
  React.useEffect(() => {
    const before = target.className
    target.classList.remove(
      "flex",
      "min-h-[240px]",
      "flex-col",
      "items-center",
      "justify-center",
      "rounded-md",
      "border",
      "border-dashed",
      "border-mem-border",
      "bg-mem-surface-1",
      "p-6",
      "text-center"
    )
    target.setAttribute("data-slot-filled", "true")
    return () => {
      // Restore on unmount so the placeholder shows again if we ever detach.
      target.className = before
      target.removeAttribute("data-slot-filled")
    }
  }, [target])

  const serverId = target.getAttribute("data-server-id") ?? ""
  if (!serverId) return null

  return createPortal(<ToolPlayground serverId={serverId} />, target)
}

/**
 * Stable-ish React key for a DOM node. Uses a WeakMap counter so we don't
 * collide when the same element is observed twice between renders.
 */
const keyMap: WeakMap<HTMLElement, string> = new WeakMap()
let keyCounter = 0
function domKey(el: HTMLElement): string {
  const existing = keyMap.get(el)
  if (existing) return existing
  keyCounter += 1
  const next = `slot-${keyCounter}`
  keyMap.set(el, next)
  return next
}
