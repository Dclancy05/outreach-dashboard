import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const businessId = sp.get("business_id")
  const includeArchived = sp.get("include_archived") === "true"

  let query = supabase
    .from("memory_personas")
    .select("*")
    .order("is_default", { ascending: false })
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (businessId && businessId !== "all") {
    query = query.or(`business_id.eq.${businessId},business_id.is.null`)
  }
  if (!includeArchived) query = query.eq("is_archived", false)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // count attached memories per persona (manual since the relation hint above may not resolve cleanly)
  const personas = data || []
  const ids = personas.map((p) => p.id)
  let counts: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: countRows } = await supabase
      .from("memories")
      .select("persona_id")
      .in("persona_id", ids)
      .eq("archived", false)
    for (const r of countRows || []) {
      const k = (r as { persona_id: string }).persona_id
      counts[k] = (counts[k] || 0) + 1
    }
  }
  const enriched = personas.map((p) => ({ ...p, memory_count: counts[p.id] || 0 }))
  return NextResponse.json({ data: enriched })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const action = body.action as string

  if (action === "create") {
    if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 })
    const row = {
      business_id: body.business_id || null,
      parent_persona_id: body.parent_persona_id || null,
      name: String(body.name).slice(0, 100),
      emoji: body.emoji || "🤖",
      description: body.description ? String(body.description).slice(0, 500) : null,
      system_prompt: body.system_prompt || "",
      tone_terse: typeof body.tone_terse === "number" ? body.tone_terse : 50,
      tone_formal: typeof body.tone_formal === "number" ? body.tone_formal : 50,
      emoji_mode: ["off", "auto", "on"].includes(body.emoji_mode) ? body.emoji_mode : "auto",
      is_default: false,
    }
    const { data, error } = await supabase.from("memory_personas").insert(row).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === "update") {
    const { id } = body
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
    const updates: Record<string, unknown> = {}
    const fields = [
      "name", "emoji", "description", "system_prompt",
      "tone_terse", "tone_formal", "emoji_mode",
      "parent_persona_id", "business_id", "is_archived",
    ]
    for (const f of fields) if (f in body) updates[f] = body[f]
    const { data, error } = await supabase.from("memory_personas").update(updates).eq("id", id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === "delete") {
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 })
    const { error } = await supabase.from("memory_personas").delete().eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "set_default") {
    const { id, business_id } = body
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
    const scope = business_id || null
    // unset previous default in same scope
    if (scope === null) {
      await supabase.from("memory_personas").update({ is_default: false }).is("business_id", null).eq("is_default", true)
    } else {
      await supabase.from("memory_personas").update({ is_default: false }).eq("business_id", scope).eq("is_default", true)
    }
    const { data, error } = await supabase.from("memory_personas").update({ is_default: true }).eq("id", id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === "duplicate") {
    const { id } = body
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
    const { data: src, error: e1 } = await supabase.from("memory_personas").select("*").eq("id", id).single()
    if (e1 || !src) return NextResponse.json({ error: e1?.message || "not found" }, { status: 404 })
    const copy = { ...src, name: `${src.name} (copy)`, is_default: false, use_count: 0, last_used_at: null }
    delete (copy as Record<string, unknown>).id
    delete (copy as Record<string, unknown>).created_at
    delete (copy as Record<string, unknown>).updated_at
    const { data, error } = await supabase.from("memory_personas").insert(copy).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === "touch") {
    const { id } = body
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
    const { error } = await supabase
      .from("memory_personas")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
