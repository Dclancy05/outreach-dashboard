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
    let query = supabase.from("content_clips").select("*")

    const category = searchParams.get("category")
    const mood = searchParams.get("mood")
    const energy_level = searchParams.get("energy_level")
    const source = searchParams.get("source")
    const persona_match = searchParams.get("persona_match")
    const limit = searchParams.get("limit")

    if (category) query = query.eq("category", category)
    if (mood) query = query.eq("mood", mood)
    if (energy_level) query = query.eq("energy_level", energy_level)
    if (source) query = query.eq("source", source)
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
    const { data, error } = await supabase.from("content_clips").insert(body).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
