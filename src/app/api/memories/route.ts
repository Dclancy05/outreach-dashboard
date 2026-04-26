import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ALLOWED_TYPES = ["user", "feedback", "project", "reference"] as const
type MemoryType = (typeof ALLOWED_TYPES)[number]

function bizScope(value: string | null) {
  if (!value || value === "all") return null
  return value
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const businessId = bizScope(sp.get("business_id"))
  const personaId = sp.get("persona_id")
  const type = sp.get("type") as MemoryType | null
  const includeArchived = sp.get("include_archived") === "true"
  const search = sp.get("q")?.trim()
  const tag = sp.get("tag")?.trim()
  const pinnedOnly = sp.get("pinned") === "true"
  const limit = Math.min(parseInt(sp.get("limit") || "200", 10), 500)

  let query = supabase
    .from("memories")
    .select("*", { count: "exact" })
    .order("pinned", { ascending: false })
    .order("injection_priority", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (businessId === null) {
    // global view: include both global and per-business memories
  } else {
    query = query.or(`business_id.eq.${businessId},business_id.is.null`)
  }
  if (personaId && personaId !== "all") {
    query = personaId === "global"
      ? query.is("persona_id", null)
      : query.or(`persona_id.eq.${personaId},persona_id.is.null`)
  }
  if (type && ALLOWED_TYPES.includes(type)) query = query.eq("type", type)
  if (!includeArchived) query = query.eq("archived", false)
  if (pinnedOnly) query = query.eq("pinned", true)
  if (tag) query = query.contains("tags", [tag])
  if (search) query = query.textSearch("search_tsv", search, { type: "websearch", config: "english" })

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [], count: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const action = body.action as string

  if (action === "create") {
    if (!body.title) return NextResponse.json({ error: "title required" }, { status: 400 })
    let type: MemoryType
    if (body.type === undefined || body.type === null || body.type === "") {
      type = "user"
    } else if (ALLOWED_TYPES.includes(body.type)) {
      type = body.type
    } else {
      return NextResponse.json(
        { error: `invalid type "${body.type}", must be one of: ${ALLOWED_TYPES.join(", ")}` },
        { status: 400 }
      )
    }
    const row = {
      business_id: body.business_id || null,
      persona_id: body.persona_id || null,
      type,
      title: String(body.title).slice(0, 200),
      description: body.description ? String(body.description).slice(0, 500) : null,
      body: String(body.body || ""),
      emoji: body.emoji || "📝",
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 20) : [],
      pinned: !!body.pinned,
      archived: false,
      injection_priority: typeof body.injection_priority === "number" ? body.injection_priority : 50,
      why: body.why || null,
      how_to_apply: body.how_to_apply || null,
      trigger_keywords: Array.isArray(body.trigger_keywords) ? body.trigger_keywords : [],
      source: body.source || "ui",
    }
    const { data, error } = await supabase.from("memories").insert(row).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === "update") {
    const { id } = body
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
    const updates: Record<string, unknown> = {}
    const fields = [
      "title", "description", "body", "emoji", "tags", "pinned", "archived",
      "injection_priority", "why", "how_to_apply", "trigger_keywords",
      "type", "persona_id", "business_id",
    ]
    for (const f of fields) {
      if (f in body) updates[f] = body[f]
    }
    const { data, error } = await supabase.from("memories").update(updates).eq("id", id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === "delete") {
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 })
    const { error } = await supabase.from("memories").delete().eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "pin") {
    const { id, pinned } = body
    const { data, error } = await supabase.from("memories").update({ pinned: !!pinned }).eq("id", id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === "archive") {
    const { id, archived } = body
    const { data, error } = await supabase.from("memories").update({ archived: !!archived }).eq("id", id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === "reorder") {
    const items: Array<{ id: string; injection_priority: number }> = body.items || []
    const updates = items.map((it) =>
      supabase.from("memories").update({ injection_priority: it.injection_priority }).eq("id", it.id)
    )
    const results = await Promise.all(updates)
    const failed = results.find((r) => r.error)
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 })
    return NextResponse.json({ success: true, count: items.length })
  }

  if (action === "bulk_archive") {
    const ids: string[] = body.ids || []
    const olderThanDays: number | null = body.older_than_days ?? null
    let q = supabase.from("memories").update({ archived: true })
    if (ids.length > 0) q = q.in("id", ids)
    else if (olderThanDays != null) {
      const cutoff = new Date(Date.now() - olderThanDays * 86400 * 1000).toISOString()
      q = q.lt("updated_at", cutoff).eq("pinned", false).eq("archived", false)
    } else {
      return NextResponse.json({ error: "Specify ids or older_than_days" }, { status: 400 })
    }
    const { error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "duplicate") {
    const { id } = body
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
    const { data: src, error: e1 } = await supabase.from("memories").select("*").eq("id", id).single()
    if (e1 || !src) return NextResponse.json({ error: e1?.message || "not found" }, { status: 404 })
    const copy = {
      ...src,
      title: `${src.title} (copy)`,
      pinned: false,
    }
    delete (copy as Record<string, unknown>).id
    delete (copy as Record<string, unknown>).created_at
    delete (copy as Record<string, unknown>).updated_at
    delete (copy as Record<string, unknown>).search_tsv
    delete (copy as Record<string, unknown>).use_count
    delete (copy as Record<string, unknown>).last_used_at
    const { data, error } = await supabase.from("memories").insert(copy).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
