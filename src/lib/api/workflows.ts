// Typed client for /api/workflows/*. The whole xyflow graph is one jsonb
// column — see src/lib/workflow/graph.ts for the WorkflowGraph type.

import type { WorkflowGraph } from "@/lib/workflow/graph"

export type WorkflowStatus = "draft" | "active" | "archived"

export interface Workflow {
  id: string
  name: string
  description: string | null
  emoji: string | null
  graph: WorkflowGraph
  entry_node_id: string | null
  status: WorkflowStatus
  is_template: boolean
  budget_usd: number
  max_steps: number
  max_loop_iters: number
  use_count: number
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export async function listWorkflows(params: { status?: WorkflowStatus; templates_only?: boolean } = {}): Promise<Workflow[]> {
  const sp = new URLSearchParams()
  if (params.status) sp.set("status", params.status)
  if (params.templates_only) sp.set("templates_only", "true")
  const r = await fetch(`/api/workflows?${sp.toString()}`, { cache: "no-store" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to list workflows")
  return (await r.json()).data
}

export async function getWorkflow(id: string): Promise<Workflow> {
  const r = await fetch(`/api/workflows/${id}`, { cache: "no-store" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to load workflow")
  return (await r.json()).data
}

export async function createWorkflow(input: Partial<Workflow> & { name: string }): Promise<Workflow> {
  const r = await fetch("/api/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to create workflow")
  return data.data
}

export async function updateWorkflow(id: string, patch: Partial<Workflow>): Promise<Workflow> {
  const r = await fetch(`/api/workflows/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to update workflow")
  return data.data
}

export async function deleteWorkflow(id: string): Promise<void> {
  const r = await fetch(`/api/workflows/${id}`, { method: "DELETE" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to delete workflow")
}

export async function explainWorkflow(id: string): Promise<{ explanation: string }> {
  const r = await fetch(`/api/workflows/${id}/explain`, { method: "POST" })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to explain workflow")
  return data
}

export async function dryRunWorkflow(id: string, input: Record<string, unknown>): Promise<{ run_id: string }> {
  const r = await fetch(`/api/workflows/${id}/dry-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to start dry run")
  return data
}

export async function runWorkflow(id: string, input: Record<string, unknown>): Promise<{ run_id: string }> {
  const r = await fetch(`/api/workflows/${id}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to start run")
  return data
}
