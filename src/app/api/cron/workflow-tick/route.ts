// Vercel cron — runs every minute. Drains due schedules into the queue and
// fires Inngest events. Inngest then runs the workflows asynchronously, so
// this handler returns in milliseconds even when many schedules are due.
//
// Auth: Bearer ${CRON_SECRET} — same pattern as /api/cron/automations-maintenance.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { parseExpression as parseCronExpression } from "cron-parser"
import { inngest, EVENT_RUN_QUEUED } from "@/lib/inngest/client"
import { checkGlobalDailyBudget, BudgetExceededError } from "@/lib/workflow/cost-guards"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  if (auth !== `Bearer ${expected}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  // Refuse to queue anything if today's spend has already hit the global cap.
  try {
    await checkGlobalDailyBudget()
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return NextResponse.json({ skipped: "global daily budget exceeded", err: err.message }, { status: 200 })
    }
    throw err
  }

  const now = new Date().toISOString()
  const { data: due, error } = await supabase
    .from("schedules")
    .select("id, workflow_id, cron, timezone, payload, fire_count")
    .eq("enabled", true)
    .lte("next_fire_at", now)
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const fired: string[] = []
  for (const s of (due || [])) {
    // Insert run row so it appears in /agency/memory#agent-workflows/runs immediately
    const { data: run } = await supabase.from("workflow_runs").insert({
      workflow_id: s.workflow_id,
      schedule_id: s.id,
      trigger: "schedule",
      status: "queued",
      input: s.payload || {},
    }).select("id").single()
    if (!run) continue

    await inngest.send({
      name: EVENT_RUN_QUEUED,
      data: { run_id: run.id, workflow_id: s.workflow_id, input: s.payload || {} },
    })

    // Advance next_fire_at
    let nextIso: string | null = null
    try {
      nextIso = parseCronExpression(s.cron, { tz: s.timezone, currentDate: new Date() }).next().toDate().toISOString()
    } catch { /* leave next_fire_at; the user has a bad cron and we'll surface it in UI */ }

    await supabase.from("schedules").update({
      last_fired_at: now,
      next_fire_at: nextIso,
      fire_count: (s.fire_count || 0) + 1,
    }).eq("id", s.id)

    fired.push(run.id)
  }

  return NextResponse.json({ ok: true, ran_at: now, fired_count: fired.length, fired })
}

export async function POST(req: NextRequest) { return handle(req) }
export async function GET(req: NextRequest)  { return handle(req) }
