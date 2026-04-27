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
