import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Runs once a day (Vercel cron or external scheduler POST). Advances every
// active account's warmup_day by 1 if they sent at least one DM yesterday.
// Accounts that didn't send are held back — this protects the ramp curve so
// a day of downtime doesn't fake progress into a higher daily cap.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || req.nextUrl.searchParams.get("token") || ""
  const expected = process.env.CRON_SECRET || ""
  if (expected && auth !== `Bearer ${expected}` && auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const startedAt = new Date()
  const { data: rows, error } = await supabase
    .from("accounts")
    .select("account_id, warmup_sequence_id, warmup_day, warmup_last_sent_at, warmup_paused, status")
    .not("warmup_sequence_id", "is", null)
    .eq("warmup_paused", false)
    .in("status", ["active", "warming"])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const since = new Date(Date.now() - 30 * 60 * 60 * 1000) // 30h window — tolerant of timezone drift
  let advanced = 0
  let skipped = 0

  for (const r of rows || []) {
    const sentRecently = r.warmup_last_sent_at && new Date(r.warmup_last_sent_at) > since
    if (!sentRecently) {
      skipped++
      continue
    }
    const nextDay = (r.warmup_day || 0) + 1
    const { error: upErr } = await supabase
      .from("accounts")
      .update({
        warmup_day: nextDay,
        warmup_last_ticked_at: startedAt.toISOString(),
        warmup_started_at: r.warmup_day === 0 ? startedAt.toISOString() : undefined,
      })
      .eq("account_id", r.account_id)
    if (upErr) skipped++
    else advanced++
  }

  try {
    await supabase.from("warmup_tick_log").insert({
      ran_at: startedAt.toISOString(),
      accounts_advanced: advanced,
      accounts_skipped: skipped,
      notes: `total=${(rows || []).length}`,
    })
  } catch {}

  return NextResponse.json({
    ok: true,
    ran_at: startedAt.toISOString(),
    accounts_total: (rows || []).length,
    accounts_advanced: advanced,
    accounts_skipped: skipped,
  })
}
