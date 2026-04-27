// Typed client for /api/runs/*. Runs are read-mostly from the UI side; the
// actual execution is driven by the Inngest function in
// src/lib/inngest/functions/run-workflow.ts.

export type RunStatus =
  | "queued" | "running" | "paused" | "succeeded"
  | "failed" | "aborted" | "budget_exceeded"

export type StepStatus =
  | "pending" | "running" | "succeeded" | "failed"
  | "skipped" | "awaiting_approval"

export type StepNodeType =
  | "trigger" | "agent" | "orchestrator" | "loop"
  | "router" | "approval" | "output"

export type RunTrigger = "manual" | "schedule" | "api" | "test" | "dry_run"

export interface WorkflowRun {
  id: string
  workflow_id: string
  schedule_id: string | null
  trigger: RunTrigger
  status: RunStatus
  inngest_run_id: string | null
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  summary: string | null
  cost_usd: number
  total_tokens: number
  started_at: string | null
  finished_at: string | null
  error: string | null
  created_at: string
  /** Joined for the list view */
  workflow_name?: string
  workflow_emoji?: string | null
}

export interface WorkflowStep {
  id: string
  run_id: string
  parent_step_id: string | null
  node_id: string
  node_type: StepNodeType
  agent_id: string | null
  iteration: number
  status: StepStatus
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  cost_usd: number
  tokens: number
  log_url: string | null
  started_at: string | null
  finished_at: string | null
  error: string | null
  created_at: string
}

export async function listRuns(params: {
  workflow_id?: string
  status?: RunStatus
  limit?: number
} = {}): Promise<WorkflowRun[]> {
  const sp = new URLSearchParams()
  if (params.workflow_id) sp.set("workflow_id", params.workflow_id)
  if (params.status) sp.set("status", params.status)
  if (params.limit) sp.set("limit", String(params.limit))
  const r = await fetch(`/api/runs?${sp.toString()}`, { cache: "no-store" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to list runs")
  return (await r.json()).data
}

export async function getRun(id: string): Promise<WorkflowRun> {
  const r = await fetch(`/api/runs/${id}`, { cache: "no-store" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to load run")
  return (await r.json()).data
}

export async function listSteps(run_id: string): Promise<WorkflowStep[]> {
  const r = await fetch(`/api/runs/${run_id}/steps`, { cache: "no-store" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to load steps")
  return (await r.json()).data
}

export async function controlRun(id: string, action: "pause" | "resume" | "abort"): Promise<void> {
  const r = await fetch(`/api/runs/${id}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Failed to ${action} run`)
}

export async function approveStep(run_id: string, step_id: string, decision: "approve" | "reject", note?: string): Promise<void> {
  const r = await fetch(`/api/runs/${run_id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step_id, decision, note }),
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to record approval")
}

export async function summarizeRun(id: string): Promise<{ summary: string }> {
  const r = await fetch(`/api/runs/${id}/summarize`, { method: "POST" })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to summarize run")
  return data
}

/**
 * Open an SSE stream of live log lines for a step. Caller is responsible for
 * closing the EventSource. Returns null if the browser doesn't support SSE.
 */
export function streamStepLogs(run_id: string, step_id: string, onLine: (line: string) => void): EventSource | null {
  if (typeof EventSource === "undefined") return null
  const es = new EventSource(`/api/runs/${run_id}/steps/${step_id}/logs`)
  es.onmessage = (ev) => onLine(String(ev.data))
  return es
}

// ─── Display helpers ────────────────────────────────────────────────────────

export const STATUS_BADGE: Record<RunStatus, { label: string; className: string }> = {
  queued:           { label: "Queued",         className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30" },
  running:          { label: "Running",        className: "bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse" },
  paused:           { label: "Paused",         className: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  succeeded:        { label: "Succeeded",      className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  failed:           { label: "Failed",         className: "bg-red-500/10 text-red-400 border-red-500/30" },
  aborted:          { label: "Aborted",        className: "bg-zinc-500/10 text-zinc-500 border-zinc-500/30" },
  budget_exceeded:  { label: "Budget hit",     className: "bg-orange-500/10 text-orange-400 border-orange-500/30" },
}

export const STEP_ICON: Record<StepStatus, string> = {
  pending: "⏳",
  running: "⚙️",
  succeeded: "✓",
  failed: "✗",
  skipped: "↷",
  awaiting_approval: "⏸",
}

export function isTerminal(status: RunStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "aborted" || status === "budget_exceeded"
}
