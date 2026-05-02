import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

/**
 * /api/cron/automations-health-score
 *
 * Daily cron that walks every active-ish automation, looks at its last
 * 30 automation_runs, and computes a 0-100 `health_score` written back
 * to the automations row.
 *
 * Formula (matches Automations.md spec lines 136-137, 466-467):
 *
 *   pass_rate (50%)  = (passed + healed) / total runs in last 30 days
 *   recency   (30%)  = 1 - (days_since_last_test / 30) clamped to [0,1]
 *   stability (20%)  = 100 if no `healed` runs in last 5 (else 50)
 *
 *   health_score = round(pass_rate * 0.5 + recency * 0.3 + stability * 0.2)
 *
 * Designed to run AFTER /api/cron/automations-maintenance (which writes
 * status + last_tested_at + new automation_runs rows). Schedule chosen
 * is 0 11 * * * (UTC) — 60 min after maintenance kicks off at 0 10 — so
 * the maintenance pass has time to land its writes before we summarize.
 *
 * Bearer-gated with CRON_SECRET, like all other crons in this repo.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: {
      // Same no-store guard as the rest of the dashboard — Next.js will
      // otherwise cache supabase-js fetches inside the warm function.
      fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
    },
  }
)

interface RunRow {
  status: string | null
  started_at: string | null
}

interface HealthResult {
  automation_id: string
  name: string
  health_score: number
  pass_rate: number
  recency: number
  stability: number
  runs_considered: number
  previous_score: number | null
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

export async function handle(req: NextRequest) {
  // Bearer auth — match other crons in this repo.
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    )
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const startedAt = new Date()
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString()

  // Pull every automation that's actually in play. Skip drafts (no
  // health to score yet) and `needs_recording` (waiting on user action).
  const { data: automations, error } = await supabase
    .from("automations")
    .select("id, name, status, last_tested_at, health_score")
    .in("status", ["active", "needs_rerecording", "fixing", "broken"])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list =
    (automations || []) as Array<{
      id: string
      name: string
      status: string
      last_tested_at: string | null
      health_score: number | null
    }>

  const results: HealthResult[] = []
  const updateErrors: Array<{ automation_id: string; message: string }> = []

  for (const auto of list) {
    // Pull the last 30 runs in the trailing 30 days so a stale row with
    // no recent activity doesn't get inflated by year-old passes.
    const { data: runs, error: runsErr } = await supabase
      .from("automation_runs")
      .select("status, started_at")
      .eq("automation_id", auto.id)
      .gte("started_at", thirtyDaysAgo)
      .order("started_at", { ascending: false })
      .limit(30)

    if (runsErr) {
      updateErrors.push({
        automation_id: auto.id,
        message: `runs query failed: ${runsErr.message}`,
      })
      continue
    }

    const r = (runs || []) as RunRow[]
    const finished = r.filter(
      (x) => x.status === "passed" || x.status === "failed" || x.status === "healed"
    )

    // Pass rate (50% weight). If we have NO runs, fall back to 100 so
    // a freshly-recorded automation that hasn't been touched yet doesn't
    // get punished for the maintenance cron not having run yet.
    const passRate =
      finished.length === 0
        ? 100
        : (finished.filter((x) => x.status === "passed" || x.status === "healed")
            .length /
            finished.length) *
          100

    // Recency (30% weight). Days since last tested → 0..30 → linear penalty.
    const daysSinceTest = auto.last_tested_at
      ? Math.floor(
          (Date.now() - new Date(auto.last_tested_at).getTime()) /
            (24 * 60 * 60 * 1000)
        )
      : 999
    const recency = Math.max(0, Math.min(100, 100 - (daysSinceTest / 30) * 100))

    // Stability (20% weight). If the most recent 5 runs include any
    // `healed` (auto-repair fired), that's a sign of selector drift —
    // stability dips to 50. No heals in last 5 → 100.
    const recentFive = r.slice(0, 5)
    const recentHeals = recentFive.filter((x) => x.status === "healed").length
    const stability = recentHeals === 0 ? 100 : 50

    const score = clampScore(
      passRate * 0.5 + recency * 0.3 + stability * 0.2
    )

    const { error: updErr } = await supabase
      .from("automations")
      .update({ health_score: score })
      .eq("id", auto.id)

    if (updErr) {
      updateErrors.push({
        automation_id: auto.id,
        message: `update failed: ${updErr.message}`,
      })
      continue
    }

    results.push({
      automation_id: auto.id,
      name: auto.name,
      health_score: score,
      pass_rate: Math.round(passRate),
      recency: Math.round(recency),
      stability: Math.round(stability),
      runs_considered: finished.length,
      previous_score:
        typeof auto.health_score === "number" ? auto.health_score : null,
    })
  }

  const finishedAt = new Date()
  return NextResponse.json({
    ok: true,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    scanned: list.length,
    updated: results.length,
    update_errors: updateErrors,
    results,
  })
}

// Vercel cron sends GET; allow POST for manual trigger via curl.
export async function GET(req: NextRequest) {
  return handle(req)
}
export async function POST(req: NextRequest) {
  return handle(req)
}
