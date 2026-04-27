// Typed client for /api/agents/*. Mirrors the shape of src/lib/api/memory.ts
// but uses proper REST routes (GET/POST collection, GET/PATCH/DELETE per id).

export type AgentModel = "opus" | "sonnet" | "haiku"

export interface Agent {
  id: string
  name: string
  slug: string
  emoji: string | null
  description: string | null
  file_path: string
  parent_agent_id: string | null
  persona_id: string | null
  model: AgentModel
  tools: string[]
  max_tokens: number
  is_orchestrator: boolean
  archived: boolean
  last_used_at: string | null
  use_count: number
  created_at: string
  updated_at: string
}

export interface AgentTestResult {
  run_id: string
  /** SSE log endpoint to subscribe to for streaming output */
  log_url: string
}

export async function listAgents(params: { include_archived?: boolean; q?: string } = {}): Promise<Agent[]> {
  const sp = new URLSearchParams()
  if (params.include_archived) sp.set("include_archived", "true")
  if (params.q) sp.set("q", params.q)
  const r = await fetch(`/api/agents?${sp.toString()}`, { cache: "no-store" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to list agents")
  return (await r.json()).data
}

export async function getAgent(id: string): Promise<Agent> {
  const r = await fetch(`/api/agents/${id}`, { cache: "no-store" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to load agent")
  return (await r.json()).data
}

export async function createAgent(input: Partial<Agent> & { name: string; slug: string }): Promise<Agent> {
  const r = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to create agent")
  return data.data
}

export async function updateAgent(id: string, patch: Partial<Agent>): Promise<Agent> {
  const r = await fetch(`/api/agents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to update agent")
  return data.data
}

export async function deleteAgent(id: string): Promise<void> {
  const r = await fetch(`/api/agents/${id}`, { method: "DELETE" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to delete agent")
}

export async function testAgent(id: string, input: { prompt: string; vars?: Record<string, unknown> }): Promise<AgentTestResult> {
  const r = await fetch(`/api/agents/${id}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to start test run")
  return data
}

export const AVAILABLE_TOOLS = [
  "Bash", "Read", "Write", "Edit", "WebFetch", "WebSearch",
  "Grep", "Glob", "TodoWrite", "Task",
] as const

export const MODEL_OPTIONS: Array<{ value: AgentModel; label: string; cost: string }> = [
  { value: "opus",   label: "Opus 4.7",   cost: "$$$ — slow but smartest" },
  { value: "sonnet", label: "Sonnet 4.6", cost: "$$ — balanced default" },
  { value: "haiku",  label: "Haiku 4.5",  cost: "$ — fast cheap classifier" },
]
