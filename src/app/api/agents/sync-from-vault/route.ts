// Internal endpoint hit by the vault file-watcher (and the dashboard's
// debounced subscriber to /api/memory-vault/events) whenever a file under
// Jarvis/agent-skills/ changes. Parses the markdown frontmatter and upserts
// the agents table row to match.
//
// Auth: shares the CRON_SECRET so only internal callers can hit it.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface SyncBody {
  /** Vault-relative path: "Jarvis/agent-skills/code-tester.md" */
  path: string
  event: "created" | "updated" | "deleted"
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null) as SyncBody | null
  if (!body?.path) return NextResponse.json({ error: "path required" }, { status: 400 })

  if (!body.path.startsWith("Jarvis/agent-skills/") || !body.path.endsWith(".md")) {
    return NextResponse.json({ ok: true, skipped: "not an agent file" })
  }

  const slug = body.path.replace(/^Jarvis\/agent-skills\//, "").replace(/\.md$/, "")

  if (body.event === "deleted") {
    await supabase.from("agents").update({ archived: true }).eq("slug", slug)
    return NextResponse.json({ ok: true, action: "archived", slug })
  }

  // Fetch the file from the vault and parse frontmatter
  const fileText = await readVaultFile(body.path)
  if (!fileText) return NextResponse.json({ error: "could not read vault file" }, { status: 503 })

  const parsed = parseFrontmatter(fileText)
  const fm = parsed.frontmatter

  const row = {
    name: typeof fm.name === "string" ? fm.name : slug,
    slug,
    emoji: typeof fm.emoji === "string" ? fm.emoji : null,
    description: typeof fm.description === "string" ? fm.description : null,
    file_path: body.path,
    parent_agent_id: typeof fm.parent === "string" ? fm.parent : null,
    persona_id: typeof fm.persona === "string" ? fm.persona : null,
    model: ["opus", "sonnet", "haiku"].includes(fm.model as string) ? fm.model as string : "sonnet",
    tools: Array.isArray(fm.tools) ? fm.tools.filter((t): t is string => typeof t === "string") : [],
    max_tokens: typeof fm.max_tokens === "number" ? fm.max_tokens : 8000,
    is_orchestrator: fm.is_orchestrator === true,
    archived: false,
  }

  const { data, error } = await supabase
    .from("agents")
    .upsert(row, { onConflict: "slug" })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, action: "upserted", agent: data })
}

async function readVaultFile(path: string): Promise<string | null> {
  const API_URL = ((await getSecret("MEMORY_VAULT_API_URL")) || "").replace(/\/+$/, "")
  const TOKEN = (await getSecret("MEMORY_VAULT_TOKEN")) || ""
  if (!API_URL || !TOKEN) return null
  const res = await fetch(`${API_URL}/file?path=${encodeURIComponent(path)}`, {
    headers: { "Authorization": `Bearer ${TOKEN}` },
  })
  if (!res.ok) return null
  const json = await res.json().catch(() => null) as { content?: string } | null
  return json?.content ?? null
}

// Tiny YAML frontmatter parser — handles the subset we emit (scalars +
// inline arrays). Avoids pulling in gray-matter for one use site.
function parseFrontmatter(text: string): { frontmatter: Record<string, unknown>; body: string } {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text)
  if (!m) return { frontmatter: {}, body: text }
  const fmText = m[1]
  const body = m[2] || ""
  const fm: Record<string, unknown> = {}
  for (const line of fmText.split(/\r?\n/)) {
    const kv = /^([\w_]+)\s*:\s*(.*)$/.exec(line.trim())
    if (!kv) continue
    const key = kv[1]
    const raw = kv[2].trim()
    fm[key] = parseYamlScalar(raw)
  }
  return { frontmatter: fm, body }
}

function parseYamlScalar(raw: string): unknown {
  if (raw === "" || raw === "null" || raw === "~") return null
  if (raw === "true") return true
  if (raw === "false") return false
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10)
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw)
  // inline array: [a, "b", c]
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(",").map(p => parseYamlScalar(p.trim()))
  }
  // quoted string
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    try { return JSON.parse(raw.replace(/^'/, '"').replace(/'$/, '"')) } catch { return raw.slice(1, -1) }
  }
  return raw
}
