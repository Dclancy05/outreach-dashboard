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
    let query = supabase.from("content_inspiration").select("*")

    const platform = searchParams.get("platform")
    const hook_type = searchParams.get("hook_type")
    const mood = searchParams.get("mood")
    const format_type = searchParams.get("format_type")
    const persona_match = searchParams.get("persona_match")
    const limit = searchParams.get("limit")

    if (platform) query = query.eq("platform", platform)
    if (hook_type) query = query.eq("hook_type", hook_type)
    if (mood) query = query.eq("mood", mood)
    if (format_type) query = query.eq("format_type", format_type)
    if (persona_match) query = query.eq("persona_match", persona_match)

    query = query.order("created_at", { ascending: false })
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
    const { data, error } = await supabase.from("content_inspiration").insert(body).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
