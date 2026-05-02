// Workflows source — fetches /api/workflows (excludes archived + templates by
// API default; we still defensively filter here).

export interface WorkflowHit {
  id: string
  title: string
  hint?: string
  emoji?: string
  status?: string
}

interface WorkflowApiRow {
  id: string
  name: string
  description?: string | null
  emoji?: string | null
  status?: string
  is_template?: boolean
}

interface WorkflowApiResponse {
  data?: WorkflowApiRow[]
  error?: string
}

export async function fetchWorkflowHits(): Promise<WorkflowHit[]> {
  try {
    const res = await fetch("/api/workflows", { cache: "no-store" })
    if (!res.ok) return []
    const json = (await res.json()) as WorkflowApiResponse
    const rows = json.data ?? []
    return rows
      .filter((r) => !r.is_template && r.status !== "archived")
      .map((r) => ({
        id: r.id,
        title: r.name,
        hint: r.description?.trim() || undefined,
        emoji: r.emoji ?? undefined,
        status: r.status,
      }))
  } catch {
    return []
  }
}

export function filterWorkflowHits(hits: WorkflowHit[], query: string, limit = 6): WorkflowHit[] {
  if (!query.trim()) return hits.slice(0, limit)
  const q = query.toLowerCase()
  return hits
    .filter(
      (h) =>
        h.title.toLowerCase().includes(q) ||
        (h.hint?.toLowerCase().includes(q) ?? false)
    )
    .slice(0, limit)
}
