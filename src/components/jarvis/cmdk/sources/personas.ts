// Personas source — fetches /api/personas and exposes filterable hits.
//
// Returns empty array on any failure (401, 5xx, network) so the palette
// gracefully omits the Personas group.

export interface PersonaHit {
  id: string
  title: string         // persona name
  hint?: string         // description preview
  emoji?: string
  is_default?: boolean
  memory_count?: number
}

interface PersonaApiRow {
  id: string
  name: string
  description?: string | null
  emoji?: string | null
  is_default?: boolean
  is_archived?: boolean
  memory_count?: number
}

interface PersonaApiResponse {
  data?: PersonaApiRow[]
  error?: string
}

export async function fetchPersonaHits(): Promise<PersonaHit[]> {
  try {
    const res = await fetch("/api/personas", { cache: "no-store" })
    if (!res.ok) return []
    const json = (await res.json()) as PersonaApiResponse
    const rows = json.data ?? []
    return rows
      .filter((r) => !r.is_archived)
      .map((r) => ({
        id: r.id,
        title: r.name,
        hint: r.description?.trim() || undefined,
        emoji: r.emoji ?? undefined,
        is_default: !!r.is_default,
        memory_count: r.memory_count ?? 0,
      }))
  } catch {
    return []
  }
}

export function filterPersonaHits(hits: PersonaHit[], query: string, limit = 6): PersonaHit[] {
  if (!query.trim()) return hits.slice(0, limit)
  const q = query.toLowerCase()
  return hits
    .filter((h) => h.title.toLowerCase().includes(q) || (h.hint?.toLowerCase().includes(q) ?? false))
    .slice(0, limit)
}
