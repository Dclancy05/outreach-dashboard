import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Runs at 00:00 UTC every day. Zeroes out the per-day counters that gate
// daily caps. Idempotent — running it twice in the same midnight just sets
// the same rows back to 0 again, which is harmless. Without this cron the
// caps stay tripped forever and outreach silently freezes.
async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected)
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  if (auth !== `Bearer ${expected}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const startedAt = Date.now()

  try {
    // Reset every non-deleted account's daily counters. We use a broad
    // .not("deleted_at", "is.not", null) — postgrest expects "is" with null.
    const { data, error, count } = await supabase
      .from("accounts")
      .update({ sends_today: 0, replies_today: 0 }, { count: "exact" })
      .is("deleted_at", null)
      .select("account_id")

    if (error) {
      console.error("[rate-limit-reset] supabase update error:", error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const reset_count = count ?? (data?.length || 0)

    // Best-effort log — table may not exist on every environment.
    try {
      await supabase.from("cron_run_log").insert({
        cron_name: "rate-limit-reset",
        ran_at: new Date(startedAt).toISOString(),
        ms: Date.now() - startedAt,
        status: "ok",
        info: { reset_count },
      })
    } catch (logErr) {
      console.log(
        `[rate-limit-reset] reset_count=${reset_count} (cron_run_log not available)`
      )
    }

    return NextResponse.json({ ok: true, reset_count, ms: Date.now() - startedAt })
  } catch (e) {
    console.error("[rate-limit-reset] unhandled error:", e)
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}
export async function POST(req: NextRequest) {
  return handle(req)
}
