import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { extractAdminId } from "@/lib/audit"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/observability/chrome-goto?minutes=5&action=goto|login-status|all
//
// Reads the audit_log table to surface every Chrome-driving call in the
// last N minutes (default 5). Used by:
//   1. Harness audit-log-scraper to verify network monitor matches reality
//   2. Phase 4.4 dashboard "Chrome Activity" tab — Dylan can see if anything
//      is silently driving Chrome (the 2026-05-02 incident pattern)
//
// Returns:
//   {
//     count: number,
//     window_minutes: number,
//     by_platform: { instagram: 3, facebook: 1, ... },
//     by_action: { "POST /api/platforms/goto": 4, "POST /api/platforms/login-status?refresh=1": 0, ... },
//     timeline: [{ at, action, resource, user_id, status }]
//   }

export async function GET(req: NextRequest) {
  // Auth — admin session only. PIN-gated app, so this is fine for ops surfaces.
  const adminId = extractAdminId(req.headers.get("cookie"))
  if (!adminId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const minutes = Math.min(60, Math.max(1, Number(url.searchParams.get("minutes") || 5)))
  const action = (url.searchParams.get("action") || "all").toLowerCase()
  const since = new Date(Date.now() - minutes * 60_000).toISOString()

  // We scope to actions/resources that touch Chrome.
  const RESOURCE_PATTERNS = [
    "/api/platforms/goto",
    "/api/platforms/login-status",
    "/api/platforms/start",
    "/api/platforms/replay",
    "/api/recordings/start",
    "/api/recordings/replay",
  ]

  const { data, error } = await supabase
    .from("audit_log")
    .select("created_at, action, resource, user_id, payload, ip")
    .gte("created_at", since)
    .or(RESOURCE_PATTERNS.map((p) => `resource.eq.${p}`).join(","))
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Filter further by ?action= if requested
  const filtered = (data || []).filter((row: any) => {
    if (action === "all") return true
    if (action === "goto") return /\/goto/.test(row.resource || "")
    if (action === "login-status") return /\/login-status/.test(row.resource || "")
    return true
  })

  // Bucket
  const byAction: Record<string, number> = {}
  const byPlatform: Record<string, number> = {}
  for (const row of filtered) {
    const k = `${row.action || "?"}`
    byAction[k] = (byAction[k] || 0) + 1
    // Try to extract platform from payload.body or resource
    const body = row.payload?.body
    const platform =
      (body && typeof body === "object" && (body.platform || body.network)) ||
      null
    if (platform) {
      const pk = String(platform).toLowerCase()
      byPlatform[pk] = (byPlatform[pk] || 0) + 1
    }
  }

  return NextResponse.json({
    ok: true,
    window_minutes: minutes,
    count: filtered.length,
    by_action: byAction,
    by_platform: byPlatform,
    timeline: filtered.map((r: any) => ({
      at: r.created_at,
      action: r.action,
      resource: r.resource,
      user_id: r.user_id,
      status: r.payload?.status ?? null,
      platform: r.payload?.body?.platform ?? r.payload?.body?.network ?? null,
    })),
  })
}
