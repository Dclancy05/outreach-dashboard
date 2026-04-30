/**
 * GET /api/terminals/events?limit=50
 *
 * Reads the recent terminal_events log (cost cap trips, crashes, file
 * changes, etc.) for the workspace's right-rail Activity Feed. Polled
 * every 5s by the dashboard — short, no realtime subscription complexity.
 *
 * Auth: PIN-gated by middleware.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return NextResponse.json({ error: "supabase not configured" }, { status: 503 })
  }
  const limit = Math.min(200, parseInt(req.nextUrl.searchParams.get("limit") || "50", 10))
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supa
    .from("terminal_events")
    .select("id, session_id, kind, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ events: data || [] })
}
