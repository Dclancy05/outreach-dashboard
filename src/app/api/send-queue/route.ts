import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

// Server-side only — uses service_role key. Browser must call this route
// instead of hitting Supabase REST directly so we can lock down the DB with RLS.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/send-queue
 *
 * Query params:
 *   campaign_id: string (required) — filter to one campaign
 *   mode:        "stats" | "list" | "status" (default "list")
 *   limit:       number (optional, only for mode=list)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get("campaign_id")
  const mode = searchParams.get("mode") || "list"

  if (!campaignId) {
    return NextResponse.json({ error: "Missing campaign_id" }, { status: 400 })
  }

  if (mode === "stats" || mode === "status") {
    const { data, error } = await supabase
      .from("send_queue")
      .select("status")
      .eq("campaign_id", campaignId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // mode=list — full rows, optionally limited
  const limitStr = searchParams.get("limit")
  let query = supabase
    .from("send_queue")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
  if (limitStr) {
    const n = parseInt(limitStr)
    if (!isNaN(n) && n > 0) query = query.limit(n)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/**
 * POST /api/send-queue
 *
 * Body:
 *   entries: Array<Row>  — batch insert into send_queue
 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const entries = body.entries
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "Missing entries array" }, { status: 400 })
  }
  // Batch insert in chunks of 500
  const BATCH = 500
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH)
    const { error } = await supabase.from("send_queue").insert(chunk)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, inserted: entries.length })
}

/**
 * PATCH /api/send-queue
 *
 * Body:
 *   campaign_id: string (required)
 *   where_status?: string    — only update rows matching this current status
 *   set: { status?, ... }    — fields to update
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const campaignId = body.campaign_id
  const whereStatus = body.where_status
  const set = body.set
  if (!campaignId || !set || typeof set !== "object") {
    return NextResponse.json({ error: "Missing campaign_id or set" }, { status: 400 })
  }
  let query = supabase.from("send_queue").update(set).eq("campaign_id", campaignId)
  if (whereStatus) query = query.eq("status", whereStatus)
  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
