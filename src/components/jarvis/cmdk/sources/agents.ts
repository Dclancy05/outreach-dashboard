// Agents source — fetches /api/agents.

export interface AgentHit {
  id: string
  slug: string
  title: string         // agent display name
  hint?: string         // short description
  emoji?: string
}

interface AgentApiRow {
  id: string
  name: string
  slug: string
  emoji?: string | null
  description?: string | null
  archived?: boolean
}

interface AgentApiResponse {
  data?: AgentApiRow[]
  error?: string
}

export async function fetchAgentHits(): Promise<AgentHit[]> {
  try {
    const res = await fetch("/api/agents", { cache: "no-store" })
    if (!res.ok) return []
    const json = (await res.json()) as AgentApiResponse
    const rows = json.data ?? []
    return rows
      .filter((r) => !r.archived)
      .map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.name,
        hint: r.description?.trim() || undefined,
        emoji: r.emoji ?? undefined,
      }))
  } catch {
    return []
  }
}

export function filterAgentHits(hits: AgentHit[], query: string, limit = 6): AgentHit[] {
  if (!query.trim()) return hits.slice(0, limit)
  const q = query.toLowerCase()
  return hits
    .filter(
      (h) =>
        h.title.toLowerCase().includes(q) ||
        h.slug.toLowerCase().includes(q) ||
        (h.hint?.toLowerCase().includes(q) ?? false)
    )
    .slice(0, limit)
}
