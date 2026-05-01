// /api/agents — list (GET) + create (POST).
// Agents are markdown files in the vault (Jarvis/agent-skills/{slug}.md). The
// agents table is just an index. Create writes the file via the vault API,
// which in turn fires the file-watcher SSE that triggers /sync-from-vault.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const AGENT_DIR = "Jarvis/agent-skills"

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const includeArchived = sp.get("include_archived") === "true"
  const q = sp.get("q")?.trim()

  let query = supabase
    .from("agents")
    .select("*")
    .order("name", { ascending: true })

  if (!includeArchived) query = query.eq("archived", false)
  if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%,description.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-bootstrap: if the agents table is empty but the vault has agent
  // skills on disk, sync them once. Covers the case where the vault file
  // watcher missed initial files (or a new install runs before any watcher
  // event has fired). After the table has any row, this branch never runs.
  if ((data || []).length === 0 && !q) {
    const synced = await bulkSyncFromVault()
    if (synced > 0) {
      const reread = await supabase
        .from("agents")
        .select("*")
        .eq("archived", false)
        .order("name", { ascending: true })
      return NextResponse.json({ data: reread.data || [], bootstrapped: synced })
    }
  }

  return NextResponse.json({ data: data || [] })
}

interface CreateAgentInput {
  name: string
  slug: string
  emoji?: string
  description?: string
  model?: "opus" | "sonnet" | "haiku"
  tools?: string[]
  parent_agent_id?: string | null
  persona_id?: string | null
  max_tokens?: number
  is_orchestrator?: boolean
  /** Body of the .md file (system prompt). If omitted, a stub is written. */
  system_prompt?: string
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as CreateAgentInput | null
  if (!body?.name || !body?.slug) {
    return NextResponse.json({ error: "name and slug are required" }, { status: 400 })
  }
  if (!/^[a-z0-9-]+$/.test(body.slug)) {
    return NextResponse.json({ error: "slug must be lowercase letters, digits, or dashes" }, { status: 400 })
  }

  const file_path = `${AGENT_DIR}/${body.slug}.md`
  const fileContent = renderAgentMarkdown(body)

  // Write the file via the vault API. The watcher will eventually sync the DB
  // row too, but we write the row inline here so the create response is usable
  // immediately by the client.
  const wrote = await writeVaultFile(file_path, fileContent)
  if (!wrote.ok) return NextResponse.json({ error: `Vault write failed: ${wrote.error}` }, { status: 503 })

  const { data, error } = await supabase
    .from("agents")
    .insert({
      name: body.name,
      slug: body.slug,
      emoji: body.emoji || null,
      description: body.description || null,
      file_path,
      parent_agent_id: body.parent_agent_id || null,
      persona_id: body.persona_id || null,
      model: body.model || "sonnet",
      tools: body.tools || ["Bash", "Read"],
      max_tokens: body.max_tokens ?? 8000,
      is_orchestrator: body.is_orchestrator || false,
    })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function renderAgentMarkdown(input: CreateAgentInput): string {
  const tools = (input.tools || ["Bash", "Read"]).map(t => `"${t}"`).join(", ")
  const fm = [
    "---",
    `name: ${input.slug}`,
    `description: ${escapeYaml(input.description || input.name)}`,
    input.emoji ? `emoji: "${input.emoji}"` : null,
    `model: ${input.model || "sonnet"}`,
    `tools: [${tools}]`,
    input.parent_agent_id ? `parent: ${input.parent_agent_id}` : null,
    input.persona_id ? `persona: ${input.persona_id}` : null,
    `max_tokens: ${input.max_tokens ?? 8000}`,
    input.is_orchestrator ? "is_orchestrator: true" : null,
    "---",
    "",
  ].filter(Boolean).join("\n")
  const body = input.system_prompt?.trim() || `You are the ${input.name} agent.\n\nDescribe what you do here. Keep it specific — what input do you expect, what output should you return?\n`
  return fm + "\n" + body + "\n"
}

function escapeYaml(s: string): string {
  if (/[:#\n"]/.test(s)) return JSON.stringify(s)
  return s
}

// One-time bootstrap: list the vault's agent-skills folder and upsert one
// row per .md file (skipping `_*.md` capability matrices). Returns the number
// of rows synced. Idempotent — safe to call again on a non-empty table.
async function bulkSyncFromVault(): Promise<number> {
  const API_URL = ((await getSecret("MEMORY_VAULT_API_URL")) || "").replace(/\/+$/, "")
  const TOKEN = (await getSecret("MEMORY_VAULT_TOKEN")) || ""
  if (!API_URL || !TOKEN) return 0

  // The vault /tree endpoint returns the full tree regardless of `?path=`.
  // Walk it to find the AGENT_DIR (Jarvis/agent-skills) folder's direct children.
  type TreeNode = { name: string; kind: "file" | "folder"; path?: string; children?: TreeNode[] }
  let fullTree: TreeNode[] = []
  try {
    const treeRes = await fetch(`${API_URL}/tree`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!treeRes.ok) return 0
    const json = await treeRes.json().catch(() => null) as { tree?: TreeNode[] } | null
    fullTree = json?.tree || []
  } catch { return 0 }

  function findFolder(nodes: TreeNode[], parts: string[]): TreeNode | null {
    if (parts.length === 0) return null
    const [head, ...rest] = parts
    const found = nodes.find(n => n.kind === "folder" && n.name === head)
    if (!found) return null
    if (rest.length === 0) return found
    return findFolder(found.children || [], rest)
  }
  const skillsFolder = findFolder(fullTree, AGENT_DIR.split("/"))
  const entries = (skillsFolder?.children || [])

  let count = 0
  for (const e of entries) {
    if (e.kind !== "file") continue
    if (!e.name.endsWith(".md")) continue
    if (e.name.startsWith("_")) continue // capability matrices, not agents
    const slug = e.name.replace(/\.md$/, "")
    const fileText = await readVaultFile(`${AGENT_DIR}/${e.name}`)
    if (!fileText) continue
    const fm = parseFrontmatter(fileText).frontmatter
    const row = {
      name: typeof fm.name === "string" ? fm.name : slug,
      slug,
      emoji: typeof fm.emoji === "string" ? fm.emoji : null,
      description: typeof fm.description === "string" ? fm.description : null,
      file_path: `${AGENT_DIR}/${e.name}`,
      parent_agent_id: typeof fm.parent === "string" ? fm.parent : null,
      persona_id: typeof fm.persona === "string" ? fm.persona : null,
      model: ["opus", "sonnet", "haiku"].includes(fm.model as string) ? fm.model as string : "sonnet",
      tools: Array.isArray(fm.tools) ? fm.tools.filter((t): t is string => typeof t === "string") : [],
      max_tokens: typeof fm.max_tokens === "number" ? fm.max_tokens : 8000,
      is_orchestrator: fm.is_orchestrator === true,
      archived: false,
    }
    const { error } = await supabase.from("agents").upsert(row, { onConflict: "slug" })
    if (!error) count += 1
  }
  return count
}

async function readVaultFile(path: string): Promise<string | null> {
  const API_URL = ((await getSecret("MEMORY_VAULT_API_URL")) || "").replace(/\/+$/, "")
  const TOKEN = (await getSecret("MEMORY_VAULT_TOKEN")) || ""
  if (!API_URL || !TOKEN) return null
  const res = await fetch(`${API_URL}/file?path=${encodeURIComponent(path)}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!res.ok) return null
  const json = await res.json().catch(() => null) as { content?: string } | null
  return json?.content ?? null
}

// Tiny YAML frontmatter parser — same subset as sync-from-vault/route.ts.
function parseFrontmatter(text: string): { frontmatter: Record<string, unknown>; body: string } {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text)
  if (!m) return { frontmatter: {}, body: text }
  const fmText = m[1]
  const body = m[2] || ""
  const fm: Record<string, unknown> = {}
  for (const line of fmText.split(/\r?\n/)) {
    const kv = /^([\w_]+)\s*:\s*(.*)$/.exec(line.trim())
    if (!kv) continue
    fm[kv[1]] = parseYamlScalar(kv[2].trim())
  }
  return { frontmatter: fm, body }
}

function parseYamlScalar(raw: string): unknown {
  if (raw === "" || raw === "null" || raw === "~") return null
  if (raw === "true") return true
  if (raw === "false") return false
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10)
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw)
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(",").map(p => parseYamlScalar(p.trim()))
  }
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    try { return JSON.parse(raw.replace(/^'/, '"').replace(/'$/, '"')) } catch { return raw.slice(1, -1) }
  }
  return raw
}

async function writeVaultFile(path: string, content: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const API_URL = ((await getSecret("MEMORY_VAULT_API_URL")) || "").replace(/\/+$/, "")
  const TOKEN = (await getSecret("MEMORY_VAULT_TOKEN")) || ""
  if (!API_URL || !TOKEN) return { ok: false, error: "vault not configured" }
  try {
    const res = await fetch(`${API_URL}/file`, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    })
    if (!res.ok) return { ok: false, error: `${res.status} ${await res.text().catch(() => "")}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
