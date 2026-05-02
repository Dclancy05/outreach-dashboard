// Memory source — pulls the vault tree from /api/memory-vault/tree and
// flattens to a list of file nodes. The Jarvis cmdk filters in-memory; vault
// tree is the source of truth (we deliberately bypass /api/memories so the
// palette shows literally everything in the markdown vault, including agent
// skills, sessions, and reference docs).
//
// Returns empty array on 401 (memory-vault not configured) or any failure —
// the palette will simply omit the Memory group.

export interface MemoryHit {
  id: string         // file path
  title: string      // file name without extension
  hint?: string      // parent folder path
  path: string       // full vault path (used to build the editor href)
}

interface VaultTreeNode {
  name: string
  path: string
  kind: "file" | "folder"
  children?: VaultTreeNode[]
}

interface VaultTreeResponse {
  root?: string
  tree?: VaultTreeNode[]
}

function flatten(nodes: VaultTreeNode[], parentPath: string, out: MemoryHit[]): void {
  for (const node of nodes) {
    if (node.kind === "folder" && node.children?.length) {
      flatten(node.children, node.path, out)
    } else if (node.kind === "file") {
      // Skip hidden / non-markdown nodes — palette is for human-readable docs.
      if (node.name.startsWith(".")) continue
      const isMd = /\.(md|mdx|markdown)$/i.test(node.name)
      if (!isMd) continue
      const title = node.name.replace(/\.(md|mdx|markdown)$/i, "")
      const hint = parentPath || undefined
      out.push({ id: node.path, title, hint, path: node.path })
    }
  }
}

export async function fetchMemoryHits(): Promise<MemoryHit[]> {
  try {
    const res = await fetch("/api/memory-vault/tree", { cache: "no-store" })
    if (!res.ok) return []
    const data = (await res.json()) as VaultTreeResponse
    if (!Array.isArray(data.tree)) return []
    const out: MemoryHit[] = []
    flatten(data.tree, "", out)
    return out
  } catch {
    return []
  }
}

export function filterMemoryHits(hits: MemoryHit[], query: string, limit = 8): MemoryHit[] {
  if (!query.trim()) return hits.slice(0, limit)
  const q = query.toLowerCase()
  return hits
    .map((h) => ({ hit: h, score: scoreHit(h, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.hit)
}

function scoreHit(h: MemoryHit, q: string): number {
  const title = h.title.toLowerCase()
  const path = h.path.toLowerCase()
  if (title === q) return 100
  if (title.startsWith(q)) return 80
  if (title.includes(q)) return 60
  if (path.includes(q)) return 30
  return 0
}
