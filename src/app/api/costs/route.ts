import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type") || "costs"
  const businessId = searchParams.get("business_id")

  if (type === "revenue") {
    let query = supabase.from("revenue").select("*").order("date", { ascending: false })
    if (businessId) query = query.eq("business_id", businessId)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  let query = supabase.from("costs").select("*").order("date", { ascending: false })
  if (businessId) query = query.eq("business_id", businessId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, type, ...rest } = body

  if (action === "create") {
    const table = type === "revenue" ? "revenue" : "costs"
    const { data, error } = await supabase.from(table).insert(rest).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  }

  if (action === "delete") {
    const table = type === "revenue" ? "revenue" : "costs"
    const { error } = await supabase.from(table).delete().eq("id", rest.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
