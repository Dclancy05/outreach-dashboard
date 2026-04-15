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
    let query = supabase.from("content_trends").select("*")

    const platform = searchParams.get("platform")
    const status = searchParams.get("status")
    const hook_type = searchParams.get("hook_type")
    const format = searchParams.get("format") || searchParams.get("format_type")
    const sort = searchParams.get("sort")
    const limit = searchParams.get("limit")

    // Only filter platform if not "All" or empty — case-insensitive via ilike
    if (platform && platform !== "All") query = query.ilike("platform", platform)
    if (status) query = query.eq("status", status)
    if (hook_type) query = query.eq("hook_type", hook_type)
    if (format && format !== "all") query = query.ilike("format_type", format)

    // Sort
    if (sort === "views") {
      query = query.order("views", { ascending: false })
    } else if (sort === "newest") {
      query = query.order("detected_at", { ascending: false })
    } else {
      // Default: virality
      query = query.order("virality_score", { ascending: false })
    }

    query = query.limit(limit ? parseInt(limit) : 50)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data, error } = await supabase.from("content_trends").insert(body).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
