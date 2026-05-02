// Runs source — fetches /api/runs?limit=20.
//
// Decision: this surfaces the 20 most recent runs (any status) — not just
// in-progress. Reasoning: the palette is a jump-anywhere navigator, and
// recently-completed runs are the most common thing a user wants to revisit
// (e.g. "what did the last run output?"). Live in-progress runs are already
// visible from the status bar.

export interface RunHit {
  id: string
  title: string
  hint?: string
  emoji?: string
  status?: string
  workflowId?: string
  createdAt?: string
}

interface RunApiRow {
  id: string
  status?: string
  created_at?: string
  workflow_id?: string
  workflow_name?: string | null
  workflow_emoji?: string | null
}

interface RunApiResponse {
  data?: RunApiRow[]
  error?: string
}

export async function fetchRunHits(): Promise<RunHit[]> {
  try {
    const res = await fetch("/api/runs?limit=20", { cache: "no-store" })
    if (!res.ok) return []
    const json = (await res.json()) as RunApiResponse
    const rows = json.data ?? []
    return rows.map((r) => ({
      id: r.id,
      title: r.workflow_name
        ? `${r.workflow_name} run`
        : `Run ${r.id.slice(0, 8)}`,
      hint: r.status
        ? `${r.status}${r.created_at ? ` · ${formatTime(r.created_at)}` : ""}`
        : undefined,
      emoji: r.workflow_emoji ?? undefined,
      status: r.status,
      workflowId: r.workflow_id,
      createdAt: r.created_at,
    }))
  } catch {
    return []
  }
}

export function filterRunHits(hits: RunHit[], query: string, limit = 6): RunHit[] {
  if (!query.trim()) return hits.slice(0, limit)
  const q = query.toLowerCase()
  return hits
    .filter(
      (h) =>
        h.title.toLowerCase().includes(q) ||
        (h.status?.toLowerCase().includes(q) ?? false) ||
        h.id.toLowerCase().includes(q)
    )
    .slice(0, limit)
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const diffMs = Date.now() - d.getTime()
    const m = Math.round(diffMs / 60000)
    if (m < 1) return "just now"
    if (m < 60) return `${m}m ago`
    const h = Math.round(m / 60)
    if (h < 24) return `${h}h ago`
    const days = Math.round(h / 24)
    return `${days}d ago`
  } catch {
    return iso
  }
}
