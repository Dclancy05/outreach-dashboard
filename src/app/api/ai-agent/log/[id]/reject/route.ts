import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * POST /api/ai-agent/log/:id/reject
 *
 * Marks a proposed self-heal as rejected so the scan loop never re-proposes
 * the same fix. The underlying automation row is left in whatever state it's
 * currently in (typically `needs_rerecording`) — Dylan's rejection is the
 * signal that this particular diagnosis isn't worth following up on.
 *
 * Auth: shared CRON_SECRET bearer.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = params
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("ai_agent_log")
    .update({
      status: "rejected",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true, data })
}
