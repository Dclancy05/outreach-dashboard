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
    const id = searchParams.get("id")

    if (id) {
      const { data, error } = await supabase.from("content_pieces").select("*").eq("id", id).single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    let query = supabase.from("content_pieces").select("*")

    const status = searchParams.get("status")
    const platform = searchParams.get("platform")
    const persona_id = searchParams.get("persona_id")
    const account_index = searchParams.get("account_index")
    const limit = searchParams.get("limit")

    if (status) query = query.eq("status", status)
    if (platform) query = query.eq("platform", platform)
    if (persona_id) query = query.eq("persona_id", persona_id)
    if (account_index) query = query.eq("account_index", parseInt(account_index))

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
    const { data, error } = await supabase.from("content_pieces").insert(body).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    updates.updated_at = new Date().toISOString()
    const { data, error } = await supabase.from("content_pieces").update(updates).eq("id", id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
