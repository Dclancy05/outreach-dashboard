import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST /api/observability/vnc
// Lightweight client-side logging sink. The VNC login flow fires this when
// the tab opens a URL we didn't ask for (e.g. the "Login Instagram → LinkedIn"
// bug), so we can spot systemic misroutes without tailing browser consoles.
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  const row = {
    kind: String(body?.kind || "vnc_event"),
    requested_platform: body?.requested_platform || null,
    expected_url: body?.expected_url || null,
    actual_url: body?.actual_url || null,
    session_id: body?.session_id || null,
    account_id: body?.account_id || null,
    detail: body?.detail || null,
    created_at: new Date().toISOString(),
  }

  // Best-effort — if the table doesn't exist, swallow and return ok. We don't
  // want a missing logs table to break the user's login flow.
  try {
    await supabase.from("vnc_observability").insert(row)
  } catch {}

  // Also console.log on the server for immediate tailing in Vercel logs
  console.log("[observability/vnc]", JSON.stringify(row))

  return NextResponse.json({ ok: true })
}
