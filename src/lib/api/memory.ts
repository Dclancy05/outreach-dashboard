// ─── Types ──────────────────────────────────────────────────────────────

export type MemoryType = "user" | "feedback" | "project" | "reference"

export interface Memory {
  id: string
  business_id: string | null
  persona_id: string | null
  type: MemoryType
  title: string
  description: string | null
  body: string
  emoji: string
  tags: string[]
  pinned: boolean
  archived: boolean
  injection_priority: number
  why: string | null
  how_to_apply: string | null
  trigger_keywords: string[]
  use_count: number
  last_used_at: string | null
  source: string
  created_at: string
  updated_at: string
}

export interface Persona {
  id: string
  business_id: string | null
  parent_persona_id: string | null
  name: string
  emoji: string
  description: string | null
  system_prompt: string
  tone_terse: number
  tone_formal: number
  emoji_mode: "off" | "auto" | "on"
  is_default: boolean
  is_archived: boolean
  last_used_at: string | null
  use_count: number
  memory_count?: number
  created_at: string
  updated_at: string
}

export interface MemoryVersion {
  id: string
  memory_id: string
  title: string | null
  body: string | null
  description: string | null
  emoji: string | null
  tags: string[] | null
  changed_by: string
  change_summary: string | null
  created_at: string
}

export interface MemorySettings {
  business_id: string
  default_persona_id: string | null
  token_budget: number
  mcp_enabled: boolean
  mcp_api_key: string
  local_sync_enabled: boolean
  local_sync_path: string
  auto_suggest: boolean
  health_scan_at: string | null
  created_at: string
  updated_at: string
}

// ─── Memories ───────────────────────────────────────────────────────────

export async function listMemories(params: {
  business_id?: string | null
  persona_id?: string | null
  type?: MemoryType
  q?: string
  tag?: string
  pinned?: boolean
  include_archived?: boolean
  limit?: number
}): Promise<{ data: Memory[]; count: number }> {
  const sp = new URLSearchParams()
  if (params.business_id) sp.set("business_id", params.business_id)
  if (params.persona_id) sp.set("persona_id", params.persona_id)
  if (params.type) sp.set("type", params.type)
  if (params.q) sp.set("q", params.q)
  if (params.tag) sp.set("tag", params.tag)
  if (params.pinned) sp.set("pinned", "true")
  if (params.include_archived) sp.set("include_archived", "true")
  if (params.limit) sp.set("limit", String(params.limit))
  const r = await fetch(`/api/memories?${sp.toString()}`, { cache: "no-store" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to list memories")
  return r.json()
}

export async function createMemory(
  input: Partial<Memory> & { title: string; type?: MemoryType }
): Promise<Memory> {
  const r = await fetch("/api/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", ...input }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to create memory")
  return data.data
}

export async function updateMemory(id: string, patch: Partial<Memory>): Promise<Memory> {
  const r = await fetch("/api/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update", id, ...patch }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to update memory")
  return data.data
}

export async function deleteMemory(id: string): Promise<void> {
  const r = await fetch("/api/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", id }),
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to delete memory")
}

export async function pinMemory(id: string, pinned: boolean): Promise<Memory> {
  const r = await fetch("/api/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pin", id, pinned }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to pin")
  return data.data
}

export async function archiveMemory(id: string, archived: boolean): Promise<Memory> {
  const r = await fetch("/api/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "archive", id, archived }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to archive")
  return data.data
}

export async function reorderMemories(items: Array<{ id: string; injection_priority: number }>): Promise<void> {
  const r = await fetch("/api/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reorder", items }),
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to reorder")
}

export async function duplicateMemory(id: string): Promise<Memory> {
  const r = await fetch("/api/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "duplicate", id }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to duplicate")
  return data.data
}

export async function getVersions(memoryId: string): Promise<MemoryVersion[]> {
  const r = await fetch(`/api/memories/${memoryId}/versions`, { cache: "no-store" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to load versions")
  return (await r.json()).data
}

export async function restoreVersion(memoryId: string, versionId: string): Promise<Memory> {
  const r = await fetch(`/api/memories/${memoryId}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restore", version_id: versionId }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to restore")
  return data.data
}

export async function previewInjection(params: {
  persona_id?: string | null
  business_id?: string | null
  max_tokens?: number
  q?: string
}): Promise<{ tokens_used: number; max_tokens: number; memory_ids: string[]; markdown: string; persona_name: string }> {
  const sp = new URLSearchParams()
  if (params.persona_id) sp.set("persona_id", params.persona_id)
  if (params.business_id) sp.set("business_id", params.business_id)
  if (params.max_tokens) sp.set("max_tokens", String(params.max_tokens))
  if (params.q) sp.set("q", params.q)
  sp.set("format", "json")
  sp.set("client", "web-ui")
  const r = await fetch(`/api/memories/inject?${sp.toString()}`, { cache: "no-store" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to preview")
  return r.json()
}

// ─── Personas ───────────────────────────────────────────────────────────

export async function listPersonas(params: { business_id?: string | null; include_archived?: boolean }): Promise<Persona[]> {
  const sp = new URLSearchParams()
  if (params.business_id) sp.set("business_id", params.business_id)
  if (params.include_archived) sp.set("include_archived", "true")
  const r = await fetch(`/api/personas?${sp.toString()}`, { cache: "no-store" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to list personas")
  return (await r.json()).data
}

export async function createPersona(input: Partial<Persona> & { name: string }): Promise<Persona> {
  const r = await fetch("/api/personas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", ...input }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to create persona")
  return data.data
}

export async function updatePersona(id: string, patch: Partial<Persona>): Promise<Persona> {
  const r = await fetch("/api/personas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update", id, ...patch }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to update persona")
  return data.data
}

export async function deletePersona(id: string): Promise<void> {
  const r = await fetch("/api/personas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", id }),
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to delete persona")
}

export async function setDefaultPersona(id: string, business_id?: string | null): Promise<Persona> {
  const r = await fetch("/api/personas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "set_default", id, business_id }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to set default")
  return data.data
}

export async function duplicatePersona(id: string): Promise<Persona> {
  const r = await fetch("/api/personas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "duplicate", id }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to duplicate")
  return data.data
}

// ─── Settings ───────────────────────────────────────────────────────────

export async function getSettings(business_id?: string | null): Promise<MemorySettings> {
  const sp = new URLSearchParams()
  if (business_id) sp.set("business_id", business_id)
  const r = await fetch(`/api/memory-settings?${sp.toString()}`, { cache: "no-store" })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to load settings")
  return (await r.json()).data
}

export async function updateSettings(patch: Partial<MemorySettings>, business_id?: string | null): Promise<MemorySettings> {
  const r = await fetch("/api/memory-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update", business_id, ...patch }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to update settings")
  return data.data
}

export async function rotateMcpKey(business_id?: string | null): Promise<MemorySettings> {
  const r = await fetch("/api/memory-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rotate_mcp_key", business_id }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || "Failed to rotate key")
  return data.data
}

// ─── Constants ──────────────────────────────────────────────────────────

export const MEMORY_TYPES: Array<{ value: MemoryType; label: string; emoji: string; color: string; help: string }> = [
  { value: "user",      label: "User",      emoji: "👤", color: "blue",   help: "Who you are, role, preferences" },
  { value: "feedback",  label: "Feedback",  emoji: "💬", color: "amber",  help: "Rules — apply these every turn" },
  { value: "project",   label: "Project",   emoji: "📋", color: "green",  help: "Goals, deadlines, in-flight work" },
  { value: "reference", label: "Reference", emoji: "🔗", color: "violet", help: "Where to find external info" },
]

export const TYPE_BG: Record<MemoryType, string> = {
  user: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  feedback: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  project: "bg-green-500/10 text-green-400 border-green-500/30",
  reference: "bg-violet-500/10 text-violet-400 border-violet-500/30",
}

// rough token estimate for UI (1 token ≈ 4 chars)
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}
