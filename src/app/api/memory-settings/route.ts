import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function scopeKey(businessId: string | null): string {
  return businessId && businessId !== "all" ? businessId : "__global__"
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("business_id")
  const scope = scopeKey(businessId)
  const { data, error } = await supabase
    .from("memory_settings")
    .select("*")
    .eq("business_id", scope)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) {
    // lazy create
    const seed = {
      business_id: scope,
      token_budget: 2000,
      mcp_enabled: true,
      mcp_api_key: crypto.randomBytes(24).toString("hex"),
      local_sync_enabled: false,
      auto_suggest: true,
    }
    const { data: created, error: e2 } = await supabase
      .from("memory_settings")
      .insert(seed)
      .select()
      .single()
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
    return NextResponse.json({ data: created })
  }
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const action = body.action as string
  const scope = scopeKey(body.business_id || null)

  if (action === "update") {
    const updates: Record<string, unknown> = {}
    const fields = [
      "default_persona_id", "token_budget", "mcp_enabled",
      "local_sync_enabled", "local_sync_path", "auto_suggest",
    ]
    for (const f of fields) if (f in body) updates[f] = body[f]
    const { data, error } = await supabase
      .from("memory_settings")
      .update(updates)
      .eq("business_id", scope)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === "rotate_mcp_key") {
    const newKey = crypto.randomBytes(24).toString("hex")
    const { data, error } = await supabase
      .from("memory_settings")
      .update({ mcp_api_key: newKey })
      .eq("business_id", scope)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
