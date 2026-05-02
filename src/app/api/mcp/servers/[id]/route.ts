// /api/mcp/servers/[id] — GET / PATCH / DELETE one server.
// is_builtin servers cannot be deleted (returns 403).

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { McpApiError, McpServer, McpStatus, UpdateMcpServerBody } from "@/lib/mcp/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Ctx = { params: Promise<{ id: string }> }

const VALID_STATUSES: McpStatus[] = ["connected", "degraded", "disconnected", "error"]

export async function GET(_req: NextRequest, { params }: Ctx): Promise<NextResponse<{ server: McpServer } | McpApiError>> {
  const { id } = await params
  const { data, error } = await supabase
    .from("mcp_servers")
    .select("*")
    .eq("id", id)
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "not found", code: "not_found" }, { status: 404 })
  }
  return NextResponse.json({ server: data as McpServer })
}

function validatePatchBody(raw: unknown): UpdateMcpServerBody | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "body must be an object" }
  const b = raw as Record<string, unknown>
  const out: UpdateMcpServerBody = {}
  if ("name" in b) {
    if (typeof b.name !== "string" || b.name.length < 1) return { error: "name must be a non-empty string" }
    out.name = b.name
  }
  if ("endpoint_url" in b) {
    if (b.endpoint_url !== null && typeof b.endpoint_url !== "string") return { error: "endpoint_url must be a string or null" }
    out.endpoint_url = b.endpoint_url as string | null
  }
  if ("bearer_token_env_var" in b) {
    if (b.bearer_token_env_var !== null && typeof b.bearer_token_env_var !== "string") return { error: "bearer_token_env_var must be a string or null" }
    out.bearer_token_env_var = b.bearer_token_env_var as string | null
  }
  if ("oauth_provider" in b) {
    if (b.oauth_provider !== null && b.oauth_provider !== "github") return { error: "oauth_provider must be 'github' or null" }
    out.oauth_provider = b.oauth_provider as "github" | null
  }
  if ("daily_call_cap" in b) {
    if (typeof b.daily_call_cap !== "number" || b.daily_call_cap < 1 || b.daily_call_cap > 1_000_000) {
      return { error: "daily_call_cap must be 1..1000000" }
    }
    out.daily_call_cap = b.daily_call_cap
  }
  if ("status" in b) {
    if (typeof b.status !== "string" || !VALID_STATUSES.includes(b.status as McpStatus)) {
      return { error: `status must be one of ${VALID_STATUSES.join("|")}` }
    }
    out.status = b.status as McpStatus
  }
  if (Object.keys(out).length === 0) return { error: "no patchable fields supplied" }
  return out
}

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<NextResponse<{ server: McpServer } | McpApiError>> {
  const { id } = await params
  const raw = await req.json().catch(() => null)
  const v = validatePatchBody(raw)
  if ("error" in v) {
    return NextResponse.json({ error: v.error, code: "validation" }, { status: 400 })
  }
  const { data, error } = await supabase
    .from("mcp_servers")
    .update({ ...v, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "not found", code: error ? "internal" : "not_found" }, { status: error ? 500 : 404 })
  }
  return NextResponse.json({ server: data as McpServer })
}

export async function DELETE(_req: NextRequest, { params }: Ctx): Promise<NextResponse<{ ok: true } | McpApiError>> {
  const { id } = await params
  const { data: existing, error: readErr } = await supabase
    .from("mcp_servers")
    .select("id, is_builtin")
    .eq("id", id)
    .single()
  if (readErr || !existing) {
    return NextResponse.json({ error: readErr?.message || "not found", code: "not_found" }, { status: 404 })
  }
  if (existing.is_builtin) {
    return NextResponse.json(
      { error: "builtin MCPs cannot be deleted", code: "builtin_locked" },
      { status: 403 }
    )
  }
  const { error } = await supabase.from("mcp_servers").delete().eq("id", id)
  if (error) {
    return NextResponse.json({ error: error.message, code: "internal" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
