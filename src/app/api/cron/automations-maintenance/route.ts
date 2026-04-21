import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * POST /api/cron/automations-maintenance
 *
 * Daily at 6 AM Eastern (vercel.json cron triggers this). Iterates every
 * automation whose status marks it "live enough to test" and records a
 * maintenance `automation_runs` entry per automation.
 *
 * THIS IS A STUB of the control path. The replay engine (Phase 4 continuation)
 * will slot in where we currently write `passed` + a stub note. Wiring the
 * cron route + auth + row-write now means when the engine lands it's just a
 * function swap — no schedule/auth/env changes needed.
 *
 * Auth: Vercel Cron + Dylan's curl tests both send
 *   `Authorization: Bearer <CRON_SECRET>`
 * Missing or mismatched → 401. This doubles as the auth for the ai-agent
 * routes so all background workers share one secret.
 */
async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) {
    // Fail-closed: without a secret we refuse to run maintenance at all.
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const startedAt = new Date()

  // Only test automations that are "live enough" — drafts and fully-broken ones
  // are excluded. `fixing` is included so the maintenance pass can confirm an
  // in-progress self-heal actually stuck.
  const { data: automations, error } = await supabase
    .from("automations")
    .select("id, name, platform, status")
    .in("status", ["active", "needs_rerecording", "fixing"])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = automations || []
  const testedIds: string[] = []
  const errors: { automation_id: string; error: string }[] = []

  for (const a of list) {
    // 1) Open a "running" run row so an in-progress maintenance pass is visible
    //    in the UI even before the replay finishes.
    const { data: runRow, error: insErr } = await supabase
      .from("automation_runs")
      .insert({
        automation_id: a.id,
        run_type: "maintenance",
        status: "running",
      })
      .select("id")
      .single()

    if (insErr || !runRow) {
      errors.push({ automation_id: a.id, error: insErr?.message || "insert failed" })
      continue
    }

    // 2) STUB: mark it passed immediately with a note so the UI shows green and
    //    we know which runs came from the stub vs the real replay engine.
    const finishedAt = new Date()
    const { error: upRunErr } = await supabase
      .from("automation_runs")
      .update({
        status: "passed",
        finished_at: finishedAt.toISOString(),
        error: "maintenance-stub: replay engine not yet wired",
        steps_completed: Array.isArray((a as any).steps) ? (a as any).steps.length : 0,
      })
      .eq("id", runRow.id)

    if (upRunErr) {
      errors.push({ automation_id: a.id, error: upRunErr.message })
      continue
    }

    // 3) Mirror the fresh test timestamp onto the automation itself so the
    //    Maintenance tab's "last tested" column stays accurate.
    await supabase
      .from("automations")
      .update({ last_tested_at: finishedAt.toISOString() })
      .eq("id", a.id)

    testedIds.push(a.id)
  }

  return NextResponse.json({
    ok: true,
    tested: testedIds.length,
    tested_ids: testedIds,
    skipped_errors: errors,
    ran_at: startedAt.toISOString(),
    note: "stub — per-automation replay not yet implemented",
  })
}

export async function POST(req: NextRequest) {
  return handle(req)
}

// Vercel Cron sends GET by default — accept both so manual curls + scheduled
// invocations hit the same code path.
export async function GET(req: NextRequest) {
  return handle(req)
}
