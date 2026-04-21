import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * GET /api/ai-agent/log?status=open|proposed|applied|rejected&limit=50&offset=0
 *
 * Paginated listing of the self-heal queue. Used by a future UI tab so Dylan
 * can eyeball proposed fixes before applying them (or revoke a bad apply).
 *
 * Auth: shared CRON_SECRET bearer — same as /scan. This endpoint is read-only
 * but reveals internal state so we still gate it.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const url = req.nextUrl
  const status = url.searchParams.get("status")
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200)
  const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0

  let q = supabase
    .from("ai_agent_log")
    .select(
      "id, automation_id, run_id, failed_step_index, error, selectors_snapshot, screenshot_url, proposed_fix, status, created_at, resolved_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) {
    if (!["open", "proposed", "applied", "rejected"].includes(status)) {
      return NextResponse.json({ error: "invalid status filter" }, { status: 400 })
    }
    q = q.eq("status", status)
  }

  const { data, error, count } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: data || [],
    total: count ?? (data || []).length,
    limit,
    offset,
  })
}
