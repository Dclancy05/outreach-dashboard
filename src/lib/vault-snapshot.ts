/**
 * Vault snapshot service — daily full snapshots of the markdown memory vault
 * so the Time Machine UI (Phase 4) can reconstruct the tree at any past date.
 *
 * Storage strategy:
 *   - One row per (snapshot_date, file_path) per day (UNIQUE constraint).
 *   - If the file's content_hash matches the most recent prior snapshot for
 *     that path, we still write a row but set content=NULL and
 *     content_ref_date=<that earlier date>. Read-side resolves the chain.
 *   - INSERT ... ON CONFLICT DO NOTHING makes re-running a given day idempotent.
 *
 * Skips:
 *   - non-markdown files
 *   - files inside /.trash (already-deleted)
 *   - files > 1 MB (defensive cap; vault has none today)
 */
import { createHash } from "crypto"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

const MAX_FILE_BYTES = 1_000_000
const REF_CHAIN_HOPS_MAX = 3

type VaultTreeNode = {
  name: string
  path: string
  kind: "file" | "folder"
  size?: number
  updated_at?: string
  is_symlink?: boolean
  children?: VaultTreeNode[]
}

type VaultTreeResponse = {
  root: string
  tree: VaultTreeNode[]
}

type VaultFileResponse = {
  path: string
  content: string
  size?: number
  updated_at?: string
}

export type TreeNode = {
  name: string
  path: string
  kind: "file" | "folder"
  size?: number
  children?: TreeNode[]
}

export type SnapshotResult = {
  inserted: number
  refOnly: number
  skipped: number
  errors: Array<{ path: string; error: string }>
}

export type VaultStateAtResult = {
  files: Array<{
    path: string
    content: string
    size_bytes: number
    snapshot_date: string
  }>
  tree: TreeNode[]
}

type SnapshotRow = {
  snapshot_date: string
  file_path: string
  content: string | null
  content_hash: string
  size_bytes: number | null
  content_ref_date: string | null
}

/** YYYY-MM-DD in UTC. */
function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex")
}

/** Lazy service-role Supabase client — same pattern as src/lib/secrets.ts. */
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      "supabase env not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
    )
  }
  return createClient(url.replace(/\\n$/, "").trim(), key.replace(/\\n$/, "").trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function vaultEnv(): Promise<{ apiUrl: string; token: string }> {
  const apiUrl = ((await getSecret("MEMORY_VAULT_API_URL")) || "").replace(/\/+$/, "").trim()
  const token = ((await getSecret("MEMORY_VAULT_TOKEN")) || "").trim()
  if (!apiUrl || !token) {
    throw new Error(
      "memory-vault not configured: MEMORY_VAULT_API_URL and MEMORY_VAULT_TOKEN required",
    )
  }
  return { apiUrl, token }
}

/** Walk the recursive tree response into a flat list of markdown file entries. */
function flattenMarkdownFiles(
  nodes: VaultTreeNode[],
): Array<{ path: string; size: number }> {
  const out: Array<{ path: string; size: number }> = []
  const stack: VaultTreeNode[] = [...nodes]
  while (stack.length) {
    const n = stack.pop()!
    if (n.kind === "file") {
      if (!n.path.endsWith(".md")) continue
      // Skip the .trash bin — those are already-deleted files.
      if (n.path.startsWith("/.trash") || n.path.startsWith(".trash")) continue
      out.push({ path: n.path, size: typeof n.size === "number" ? n.size : 0 })
    } else if (n.kind === "folder") {
      // Skip the .trash subtree entirely.
      if (n.path === "/.trash" || n.path.startsWith("/.trash/")) continue
      if (n.children) for (const c of n.children) stack.push(c)
    }
  }
  return out
}

/** Build a hierarchical tree from a flat list of file paths. */
function buildTreeFromPaths(
  files: Array<{ path: string; size_bytes: number }>,
): TreeNode[] {
  type Mut = TreeNode & { childMap?: Map<string, Mut> }
  const root: Mut = { name: "", path: "", kind: "folder", children: [], childMap: new Map() }
  for (const f of files) {
    const parts = f.path.replace(/^\/+/, "").split("/").filter(Boolean)
    let cur: Mut = root
    let acc = ""
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      acc = `${acc}/${part}`
      const isLeaf = i === parts.length - 1
      if (!cur.childMap) cur.childMap = new Map()
      let next = cur.childMap.get(part)
      if (!next) {
        next = isLeaf
          ? { name: part, path: acc, kind: "file", size: f.size_bytes }
          : { name: part, path: acc, kind: "folder", children: [], childMap: new Map() }
        cur.childMap.set(part, next)
        cur.children!.push(next)
      }
      cur = next
    }
  }
  // Strip childMap helpers before returning.
  const strip = (n: Mut): TreeNode => {
    const { childMap: _cm, children, ...rest } = n
    return {
      ...rest,
      ...(children ? { children: children.map((c) => strip(c as Mut)) } : {}),
    }
  }
  return (root.children || []).map((c) => strip(c as Mut))
}

/**
 * Snapshot every markdown file in the vault for the given date.
 * Idempotent: re-running for the same date is a no-op (UNIQUE + ON CONFLICT DO NOTHING).
 */
export async function snapshotVault(
  date: Date = new Date(),
): Promise<SnapshotResult> {
  const result: SnapshotResult = { inserted: 0, refOnly: 0, skipped: 0, errors: [] }
  const snapshotDate = toDateOnly(date)
  const { apiUrl, token } = await vaultEnv()
  const sb = supabaseAdmin()

  // 1) Fetch the tree and flatten.
  let files: Array<{ path: string; size: number }>
  try {
    const r = await fetch(`${apiUrl}/tree`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    })
    if (!r.ok) throw new Error(`tree GET ${r.status}: ${await r.text().catch(() => "")}`)
    const body = (await r.json()) as VaultTreeResponse
    files = flattenMarkdownFiles(body.tree || [])
  } catch (e) {
    throw new Error(`vault tree fetch failed: ${(e as Error).message}`)
  }

  // 2) Per-file: hash, dedupe vs previous, insert.
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      result.skipped++
      continue
    }
    try {
      const fr = await fetch(
        `${apiUrl}/file?path=${encodeURIComponent(f.path)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(30_000),
        },
      )
      if (!fr.ok) {
        result.errors.push({ path: f.path, error: `file GET ${fr.status}` })
        continue
      }
      const fileBody = (await fr.json()) as VaultFileResponse
      const content = typeof fileBody.content === "string" ? fileBody.content : ""
      const sizeBytes = typeof fileBody.size === "number"
        ? fileBody.size
        : Buffer.byteLength(content, "utf8")
      if (sizeBytes > MAX_FILE_BYTES) {
        result.skipped++
        continue
      }
      const hash = sha256(content)

      // Look up previous snapshot for this path (any date strictly earlier).
      const { data: prevRow, error: prevErr } = await sb
        .from("vault_snapshots")
        .select("snapshot_date, content_hash, content_ref_date, content")
        .eq("file_path", f.path)
        .lt("snapshot_date", snapshotDate)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (prevErr) {
        result.errors.push({ path: f.path, error: `prev lookup: ${prevErr.message}` })
        continue
      }

      let row: SnapshotRow
      if (prevRow && prevRow.content_hash === hash) {
        // Reference the row that actually holds the content. If prevRow is itself
        // a ref-only row, follow its content_ref_date so we always point at the
        // canonical full-content row.
        const refDate: string =
          prevRow.content_ref_date && !prevRow.content
            ? prevRow.content_ref_date
            : prevRow.snapshot_date
        row = {
          snapshot_date: snapshotDate,
          file_path: f.path,
          content: null,
          content_hash: hash,
          size_bytes: sizeBytes,
          content_ref_date: refDate,
        }
      } else {
        row = {
          snapshot_date: snapshotDate,
          file_path: f.path,
          content,
          content_hash: hash,
          size_bytes: sizeBytes,
          content_ref_date: null,
        }
      }

      // ON CONFLICT DO NOTHING via upsert with ignoreDuplicates.
      const { error: insErr, count } = await sb
        .from("vault_snapshots")
        .upsert(row, {
          onConflict: "snapshot_date,file_path",
          ignoreDuplicates: true,
          count: "exact",
        })
      if (insErr) {
        result.errors.push({ path: f.path, error: `insert: ${insErr.message}` })
        continue
      }
      // count is null when no row was inserted (conflict), 1 when inserted.
      const wasInserted = count === null ? false : count > 0
      if (!wasInserted) {
        // already had a row for (date, path) — count as skipped, not inserted.
        result.skipped++
        continue
      }
      if (row.content === null) result.refOnly++
      else result.inserted++
    } catch (e) {
      result.errors.push({ path: f.path, error: (e as Error).message })
    }
  }

  return result
}

/**
 * Reconstruct the vault state as it existed at `timestamp`.
 * For each unique file_path, returns the latest snapshot row with
 * snapshot_date <= date(timestamp), resolving content_ref_date chains.
 */
export async function getVaultStateAt(timestamp: Date): Promise<VaultStateAtResult> {
  const asOf = toDateOnly(timestamp)
  const sb = supabaseAdmin()

  // Page through all rows up to `asOf` ordered so we can keep the newest per path.
  // Vault is small (~80 files * ~30 days = ~2400 rows) so we can pull broadly.
  const pageSize = 1000
  const rowsByPath = new Map<
    string,
    {
      snapshot_date: string
      content: string | null
      content_hash: string
      content_ref_date: string | null
      size_bytes: number | null
    }
  >()

  let from = 0
  // Rough cap: 50k rows. Anything beyond this means the vault has scaled past our
  // simple approach and we'd want a windowed query — for now this is plenty.
  const HARD_CAP = 50_000
  while (from < HARD_CAP) {
    const { data, error } = await sb
      .from("vault_snapshots")
      .select("snapshot_date, file_path, content, content_hash, content_ref_date, size_bytes")
      .lte("snapshot_date", asOf)
      .order("snapshot_date", { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`vault_snapshots read: ${error.message}`)
    if (!data || data.length === 0) break
    for (const r of data) {
      // First seen wins because we ordered by snapshot_date desc.
      if (!rowsByPath.has(r.file_path)) {
        rowsByPath.set(r.file_path, {
          snapshot_date: r.snapshot_date,
          content: r.content,
          content_hash: r.content_hash,
          content_ref_date: r.content_ref_date,
          size_bytes: r.size_bytes,
        })
      }
    }
    if (data.length < pageSize) break
    from += pageSize
  }

  // Resolve ref chains: if content is null, fetch the row at content_ref_date.
  const files: VaultStateAtResult["files"] = []
  for (const [path, row] of rowsByPath.entries()) {
    let content: string | null = row.content
    let resolvedDate: string = row.snapshot_date
    let hops = 0
    let cur = row
    while (content === null && cur.content_ref_date && hops < REF_CHAIN_HOPS_MAX) {
      const refDate = cur.content_ref_date
      const { data: refRow, error: refErr } = await sb
        .from("vault_snapshots")
        .select("snapshot_date, content, content_ref_date")
        .eq("file_path", path)
        .eq("snapshot_date", refDate)
        .maybeSingle()
      if (refErr || !refRow) break
      content = refRow.content
      resolvedDate = refRow.snapshot_date
      cur = {
        snapshot_date: refRow.snapshot_date,
        content: refRow.content,
        content_hash: row.content_hash,
        content_ref_date: refRow.content_ref_date,
        size_bytes: row.size_bytes,
      }
      hops++
    }
    if (content === null) {
      // Couldn't resolve — skip but don't throw.
      continue
    }
    files.push({
      path,
      content,
      size_bytes: row.size_bytes ?? Buffer.byteLength(content, "utf8"),
      snapshot_date: resolvedDate,
    })
  }

  // Sort for stable output.
  files.sort((a, b) => a.path.localeCompare(b.path))
  const tree = buildTreeFromPaths(
    files.map((f) => ({ path: f.path, size_bytes: f.size_bytes })),
  )
  return { files, tree }
}
