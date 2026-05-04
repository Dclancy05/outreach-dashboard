/**
 * /api/terminals/cost-today — global cost rollup for the current UTC day.
 *
 * Backs Phase 4 #3: every terminal pane shows a sticky badge `$X.XX / $Y.YY
 * today` so the user can see at a glance how much the workspace has burnt.
 *
 * Reads the `terminal_sessions_daily` view created in the
 * 20260504_terminal_sessions_daily.sql migration. The cap comes from an env
 * var (`TERMINALS_DAILY_COST_CAP_USD`) with a $25 default — generous enough to
 * not get in the way, low enough to flash red if you spawn a runaway swarm.
 */
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export async function GET(): Promise<NextResponse> {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const cap = Number(process.env.TERMINALS_DAILY_COST_CAP_USD || "25") || 25

  try {
    const { data, error } = await db()
      .from("terminal_sessions_daily")
      .select("day, session_count, cost_usd_total, tokens_total")
      .eq("day", today)
      .maybeSingle()

    if (error) {
      // View missing? Fall back to a direct sum so the UI doesn't break.
      const { data: rows } = await db()
        .from("terminal_sessions")
        .select("cost_usd, total_tokens")
        .gte("created_at", `${today}T00:00:00Z`)
      const cost = (rows || []).reduce(
        (s, r: { cost_usd?: number | null }) => s + Number(r.cost_usd || 0),
        0,
      )
      const tokens = (rows || []).reduce(
        (s, r: { total_tokens?: number | null }) => s + Number(r.total_tokens || 0),
        0,
      )
      return NextResponse.json({
        day: today,
        session_count: (rows || []).length,
        cost_usd_total: Math.round(cost * 10000) / 10000,
        tokens_total: tokens,
        cap_usd: cap,
      })
    }

    return NextResponse.json({
      day: today,
      session_count: data?.session_count ?? 0,
      cost_usd_total: Number(data?.cost_usd_total ?? 0),
      tokens_total: Number(data?.tokens_total ?? 0),
      cap_usd: cap,
    })
  } catch (e) {
    return NextResponse.json(
      { day: today, session_count: 0, cost_usd_total: 0, tokens_total: 0, cap_usd: cap, error: (e as Error).message },
      { status: 200 },
    )
  }
}
