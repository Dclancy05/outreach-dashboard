"use client"
/**
 * /agency/send — Web compose page for Jarvis (Phase 2 — Agent T).
 *
 * Phone + desktop friendly form Dylan uses to fire off a workflow without
 * leaving the dashboard. Telegram is one channel; this is the other.
 *
 * Behavior:
 *  - On mount: GET /api/workflows -> populate Select. Default to "Quick Ask".
 *  - On Go: POST /api/workflows/[id]/run with { input: { message, _meta: { source: "web" } } }.
 *    Toast with link to /agency/runs/[run_id].
 *  - Recent runs: GET /api/runs?limit=5, polled every 5s. Each row links to the run page.
 *
 * Auth: inherits the dashboard layout's PIN gate (no extra gate needed here —
 * same pattern as /agency/memory).
 */
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { toast } from "sonner"
import { Send as SendIcon, Loader2, Rocket, Inbox } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"

type Workflow = {
  id: string
  name: string
  description: string | null
  emoji: string | null
  status: string
}

type Run = {
  id: string
  workflow_id: string
  workflow_name?: string
  workflow_emoji?: string | null
  status: string // queued | running | succeeded | failed | cancelled | needs_approval
  input: Record<string, unknown> | null
  created_at: string
}

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
})

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "succeeded":
      return { label: "done", className: "bg-emerald-500/15 text-emerald-300" }
    case "failed":
      return { label: "failed", className: "bg-red-500/15 text-red-300" }
    case "running":
      return { label: "running", className: "bg-amber-500/15 text-amber-300 animate-pulse" }
    case "queued":
      return { label: "queued", className: "bg-zinc-500/15 text-zinc-300" }
    case "cancelled":
      return { label: "cancelled", className: "bg-zinc-700/40 text-zinc-400" }
    case "needs_approval":
      return { label: "needs you", className: "bg-violet-500/15 text-violet-300" }
    default:
      return { label: status, className: "bg-zinc-500/15 text-zinc-300" }
  }
}

function previewMessage(run: Run): string {
  const input = run.input || {}
  const msg = (input as Record<string, unknown>).message
  if (typeof msg === "string" && msg.trim()) return msg.trim()
  // Fall back to first string value in input.
  for (const v of Object.values(input)) {
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return "(no message)"
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export default function SendPage() {
  const [workflowId, setWorkflowId] = useState<string>("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Workflow list — load once, no polling needed.
  const { data: wfData, error: wfError, isLoading: wfLoading } = useSWR<{ data: Workflow[] }>(
    "/api/workflows",
    fetcher,
  )
  const workflows: Workflow[] = useMemo(
    () => (wfData?.data || []).filter((w) => w.status !== "archived"),
    [wfData],
  )

  // Default to "Quick Ask" once workflows are loaded.
  useEffect(() => {
    if (workflowId || workflows.length === 0) return
    const quick = workflows.find((w) => /quick\s*ask/i.test(w.name))
    setWorkflowId(quick?.id || workflows[0].id)
  }, [workflows, workflowId])

  const selectedWorkflow = workflows.find((w) => w.id === workflowId) || null

  // Recent runs — poll every 5s.
  const { data: runsData, mutate: refetchRuns } = useSWR<{ data: Run[] }>(
    "/api/runs?limit=5",
    fetcher,
    { refreshInterval: 5000 },
  )
  const recentRuns: Run[] = runsData?.data || []

  async function handleGo() {
    const trimmed = message.trim()
    if (!trimmed) {
      toast.error("Type a message first.")
      return
    }
    if (!workflowId) {
      toast.error("Pick a workflow.")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/workflows/${workflowId}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input: {
            message: trimmed,
            _meta: { source: "web" },
          },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`)
      }
      const runId: string | undefined = json?.run_id
      const wfLabel = selectedWorkflow ? `${selectedWorkflow.emoji || ""} ${selectedWorkflow.name}`.trim() : "workflow"
      toast.success(`Running ${wfLabel}…`, {
        description: "Jarvis will reply on Telegram + here.",
        action: runId
          ? {
              label: "Open run",
              onClick: () => {
                if (typeof window !== "undefined") window.location.href = `/agency/runs/${runId}`
              },
            }
          : undefined,
      })
      setMessage("")
      // Refresh the recent-runs list immediately so Dylan sees it appear.
      refetchRuns()
    } catch (e) {
      toast.error(`Couldn't send: ${(e as Error).message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex flex-col gap-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <SendIcon className="w-5 h-5 text-amber-400" />
          <h1 className="text-xl font-semibold text-zinc-100">Send a task</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Talk to Jarvis. Pick a workflow, type, hit Go. He&apos;ll reply on Telegram + here.
        </p>
      </div>

      {/* Compose card */}
      <Card className="p-4 md:p-5 flex flex-col gap-4">
        {/* Workflow picker */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="workflow-select" className="text-sm">Workflow</Label>
          <Select value={workflowId} onValueChange={setWorkflowId} disabled={wfLoading || submitting}>
            <SelectTrigger id="workflow-select" className="h-12 text-base">
              <SelectValue placeholder={wfLoading ? "Loading workflows…" : "Pick a workflow"} />
            </SelectTrigger>
            <SelectContent>
              {workflows.length === 0 && !wfLoading && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No workflows yet — build one in Memory → Agent Workflows.
                </div>
              )}
              {workflows.map((w) => (
                <SelectItem key={w.id} value={w.id} className="text-base">
                  <span className="mr-1">{w.emoji || "⚙️"}</span>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {wfError && (
            <p className="text-xs text-red-400">Couldn&apos;t load workflows. Refresh and try again.</p>
          )}
          {selectedWorkflow?.description && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {selectedWorkflow.description}
            </p>
          )}
        </div>

        {/* Message */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="message" className="text-sm">Your message</Label>
          <Textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              // Cmd/Ctrl + Enter to fire.
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !submitting) {
                e.preventDefault()
                handleGo()
              }
            }}
            placeholder="Hey Jarvis, build me a page that…"
            rows={6}
            disabled={submitting}
            className="text-base resize-y min-h-[140px]"
          />
          <p className="text-[11px] text-muted-foreground/80">
            Tip: ⌘/Ctrl + Enter to send.
          </p>
        </div>

        {/* Go button — full width on mobile, auto on desktop */}
        <Button
          onClick={handleGo}
          disabled={submitting || !message.trim() || !workflowId}
          size="lg"
          className="w-full md:w-auto md:self-end h-12 px-6 text-base font-semibold"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…
            </>
          ) : (
            <>
              <Rocket className="w-4 h-4 mr-2" /> Go
            </>
          )}
        </Button>
      </Card>

      {/* Recent runs */}
      <Card className="p-4 md:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Inbox className="w-4 h-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-200">Recent runs</h2>
          <span className="text-xs text-muted-foreground">last 5</span>
        </div>

        {recentRuns.length === 0 && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No runs yet. Send your first task above.
          </div>
        )}

        <ul className="flex flex-col divide-y divide-zinc-800/60">
          {recentRuns.map((run) => {
            const badge = statusBadge(run.status)
            return (
              <li key={run.id}>
                <Link
                  href={`/agency/runs/${run.id}`}
                  className="flex items-start gap-3 py-3 hover:bg-zinc-900/40 -mx-2 px-2 rounded-md transition-colors"
                >
                  <span className="text-lg leading-none mt-0.5">
                    {run.workflow_emoji || "⚙️"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-zinc-100 truncate">
                        {run.workflow_name || "Workflow"}
                      </span>
                      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground ml-auto shrink-0">
                        {timeAgo(run.created_at)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      &ldquo;{previewMessage(run)}&rdquo;
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
