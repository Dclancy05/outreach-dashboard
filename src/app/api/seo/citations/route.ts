import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  let query = supabase.from("ai_citations").select("*")

  const platform = searchParams.get("ai_platform")
  const wasCited = searchParams.get("was_cited")
  const dateFrom = searchParams.get("date_from")
  const dateTo = searchParams.get("date_to")

  if (platform) query = query.eq("ai_platform", platform)
  if (wasCited) query = query.eq("was_cited", wasCited === "true")
  if (dateFrom) query = query.gte("checked_at", dateFrom)
  if (dateTo) query = query.lte("checked_at", dateTo)

  const { data, error } = await query.order("checked_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await supabase.from("ai_citations").insert(body).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
