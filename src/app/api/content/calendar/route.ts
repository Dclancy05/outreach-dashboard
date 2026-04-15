import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    let query = supabase.from("content_calendar").select("*")

    const status = searchParams.get("status")
    const platform = searchParams.get("platform")
    const persona_id = searchParams.get("persona_id")
    const account_index = searchParams.get("account_index")
    const date_from = searchParams.get("date_from")
    const date_to = searchParams.get("date_to")
    const limit = searchParams.get("limit")

    if (status) query = query.eq("status", status)
    if (platform) query = query.eq("platform", platform)
    if (persona_id) query = query.eq("persona_id", persona_id)
    if (account_index) query = query.eq("account_index", parseInt(account_index))
    if (date_from) query = query.gte("scheduled_date", date_from)
    if (date_to) query = query.lte("scheduled_date", date_to)

    query = query.order("scheduled_date", { ascending: true }).order("scheduled_time", { ascending: true })
    if (limit) query = query.limit(parseInt(limit))

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data, error } = await supabase.from("content_calendar").insert(body).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
