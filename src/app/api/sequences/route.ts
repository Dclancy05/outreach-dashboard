import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

// Server-side only — uses service_role key.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/sequences
 *   ?id=<sequence_id>   — fetch single sequence
 *   (no param)          — list all
 */
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id")
  if (id) {
    const { data, error } = await supabase.from("sequences").select("*").eq("sequence_id", id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json({ data })
  }
  const { data, error } = await supabase.from("sequences").select("*").order("sequence_id", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/**
 * POST /api/sequences
 *   Upsert a sequence. Body is the row (sequence_id, sequence_name, steps, is_active).
 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await supabase.from("sequences").upsert(body).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/**
 * PUT /api/sequences
 *   Body: { sequence_id, ...updates }
 */
export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { sequence_id, ...updates } = body
  if (!sequence_id) return NextResponse.json({ error: "Missing sequence_id" }, { status: 400 })
  const { data, error } = await supabase
    .from("sequences")
    .update(updates)
    .eq("sequence_id", sequence_id)
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/**
 * DELETE /api/sequences?id=<sequence_id>
 */
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })
  const { error } = await supabase.from("sequences").delete().eq("sequence_id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
