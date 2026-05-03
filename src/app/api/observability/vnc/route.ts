import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST /api/observability/vnc
//
// Two kinds of payloads land here:
//
//   kind: "vnc_event"  (default — back-compat)
//     {kind, requested_platform, expected_url, actual_url, session_id,
//      account_id, detail}
//     → vnc_observability table (URL-mismatch debugging)
//
//   kind: "vnc_health"
//     {session_id, account_id, fps, ping_ms, freeze_ms, quality, compression}
//     → vnc_health_log table (Phase 1.3 telemetry — sparkline source)
//
//   kind: "vnc_url_transition" (Phase 1.5)
//     {session_id, account_id, platform, expected_url, actual_url, vnc_state}
//     → vnc_observability table tagged kind=vnc_url_transition
//
// Best-effort — if a table doesn't exist, swallow and return ok. We never
// want a missing logs table to break the user's login or VNC flow.
export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  const kind = String(body?.kind || "vnc_event")

  if (kind === "vnc_health") {
    const row = {
      session_id: body?.session_id || null,
      account_id: body?.account_id || null,
      fps: typeof body?.fps === "number" ? body.fps : null,
      ping_ms: typeof body?.ping_ms === "number" ? body.ping_ms : null,
      freeze_ms: typeof body?.freeze_ms === "number" ? body.freeze_ms : null,
      quality: typeof body?.quality === "number" ? body.quality : null,
      compression: typeof body?.compression === "number" ? body.compression : null,
      created_at: new Date().toISOString(),
    }
    try { await supabase.from("vnc_health_log").insert(row) } catch {}
    return NextResponse.json({ ok: true })
  }

  // Default: vnc_event / vnc_url_transition / anything else → vnc_observability
  const row = {
    kind,
    requested_platform: body?.requested_platform || body?.platform || null,
    expected_url: body?.expected_url || null,
    actual_url: body?.actual_url || null,
    session_id: body?.session_id || null,
    account_id: body?.account_id || null,
    detail: body?.detail || (body?.vnc_state ? { vnc_state: body.vnc_state } : null),
    created_at: new Date().toISOString(),
  }
  try { await supabase.from("vnc_observability").insert(row) } catch {}
  console.log("[observability/vnc]", JSON.stringify(row))
  return NextResponse.json({ ok: true })
}

// GET /api/observability/vnc?session_id=X
//
// Reads vnc_health_log + vnc_observability for a session (or recent window).
// Used by the observability page sparkline widget.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const sessionId = url.searchParams.get("session_id")
  const minutes = Math.min(120, Math.max(1, Number(url.searchParams.get("minutes") || 60)))
  const since = new Date(Date.now() - minutes * 60_000).toISOString()

  const healthQuery = supabase
    .from("vnc_health_log")
    .select("created_at, fps, ping_ms, freeze_ms, quality, session_id")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(2000)

  const eventsQuery = supabase
    .from("vnc_observability")
    .select("created_at, kind, requested_platform, expected_url, actual_url, session_id, detail")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200)

  if (sessionId) {
    healthQuery.eq("session_id", sessionId)
    eventsQuery.eq("session_id", sessionId)
  }

  const [{ data: health }, { data: events }] = await Promise.all([healthQuery, eventsQuery])

  return NextResponse.json({
    ok: true,
    window_minutes: minutes,
    health: health || [],
    events: events || [],
  })
}
