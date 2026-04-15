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
    let query = supabase.from("content_hooks").select("*")

    const category = searchParams.get("category")
    const platform = searchParams.get("platform")
    const min_rating = searchParams.get("min_rating")
    const limit = searchParams.get("limit")

    if (category) query = query.eq("category", category)
    if (platform) query = query.eq("platform", platform)
    if (min_rating) query = query.gte("performance_rating", parseInt(min_rating))

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
    const { data, error } = await supabase.from("content_hooks").insert(body).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
