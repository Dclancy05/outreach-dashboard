// MCP source — placeholder. W4.A is building /api/mcp/servers; until that
// lands this returns an empty array so the MCP group disappears from the
// palette. The shape is locked in here so swapping the implementation later
// is a one-file change.

export interface McpHit {
  id: string
  title: string         // server name
  hint?: string         // status / endpoint
  emoji?: string
  status?: "connected" | "disconnected" | "error"
}

export async function fetchMcpHits(): Promise<McpHit[]> {
  // Wire to /api/mcp/servers when W4.A ships it.
  return []
}

export function filterMcpHits(hits: McpHit[], query: string, limit = 6): McpHit[] {
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
