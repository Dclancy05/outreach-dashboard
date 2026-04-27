// /api/agents/[id] — GET, PATCH, DELETE for a single agent.
// File body is edited through /api/memory-vault/file (existing endpoint);
// this route handles the DB-only metadata fields (archived, persona_id,
// parent_agent_id, etc).

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const { data, error } = await supabase.from("agents").select("*").eq("id", id).single()
  if (error || !data) return NextResponse.json({ error: error?.message || "not found" }, { status: 404 })
  return NextResponse.json({ data })
}

const PATCHABLE_FIELDS = new Set([
  "name", "emoji", "description", "parent_agent_id", "persona_id",
  "model", "tools", "max_tokens", "is_orchestrator", "archived",
])

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const k of Object.keys(body)) {
    if (PATCHABLE_FIELDS.has(k)) patch[k] = body[k]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no patchable fields supplied" }, { status: 400 })
  }
  const { data, error } = await supabase.from("agents").update(patch).eq("id", id).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const { data: agent } = await supabase.from("agents").select("file_path, slug").eq("id", id).single()
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 })

  // Soft-delete: archive the row + delete the file. We don't hard-delete the
  // row so workflow_steps.agent_id FKs stay valid.
  await supabase.from("agents").update({ archived: true }).eq("id", id)

  await deleteVaultFile(agent.file_path).catch(() => null)

  return NextResponse.json({ ok: true })
}

async function deleteVaultFile(path: string) {
  const API_URL = ((await getSecret("MEMORY_VAULT_API_URL")) || "").replace(/\/+$/, "")
  const TOKEN = (await getSecret("MEMORY_VAULT_TOKEN")) || ""
  if (!API_URL || !TOKEN) return
  await fetch(`${API_URL}/file?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${TOKEN}` },
  })
}
