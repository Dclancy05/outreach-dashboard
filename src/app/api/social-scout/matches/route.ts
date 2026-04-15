import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")
  const campaign_id = searchParams.get("campaign_id")
  const count_only = searchParams.get("count_only")
  const sort = searchParams.get("sort") || "found_at"
  const limit = parseInt(searchParams.get("limit") || "50")

  let query = supabase.from("scout_matches").select("*, scout_campaigns(name), scout_replies(*)", { count: "exact" })

  if (status) query = query.eq("status", status)
  if (campaign_id) query = query.eq("campaign_id", campaign_id)
  
  if (sort === "score") {
    query = query.order("score", { ascending: false })
  } else {
    query = query.order("found_at", { ascending: false })
  }
  
  query = query.limit(limit)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (count_only === "true") {
    return NextResponse.json({ count: count || 0 })
  }

  return NextResponse.json({ data, count })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ids, ...updates } = body

  if (ids && Array.isArray(ids)) {
    // Bulk update
    const { error } = await supabase.from("scout_matches").update(updates).in("id", ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, updated: ids.length })
  }

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })
  const { data, error } = await supabase.from("scout_matches").update(updates).eq("id", id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
