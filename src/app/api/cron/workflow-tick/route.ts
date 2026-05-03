// Drains due schedules into the queue and fires Inngest events. Inngest then
// runs the workflows asynchronously, so this handler returns in milliseconds
// even when many schedules are due.
//
// Two callers:
//   1. Vercel cron — runs at the time configured in vercel.json (Hobby is
//      daily-only, which is too coarse for "schedule a 3am job"). Uses the
//      CRON_SECRET Vercel env var.
//   2. VPS systemd timer — runs every minute on srv1197943, gives us
//      minute-level scheduling resolution. Uses the WORKFLOW_TICK_VPS_TOKEN
//      stored in the api_keys table (read via getSecret).
//
// Either auth path is sufficient. Token compare is constant-time.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { parseExpression as parseCronExpression } from "cron-parser"
import crypto from "crypto"
import { inngest, EVENT_RUN_QUEUED } from "@/lib/inngest/client"
import { checkGlobalDailyBudget, BudgetExceededError } from "@/lib/workflow/cost-guards"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function constantTimeEq(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : ""

  const cronSecret = process.env.CRON_SECRET || ""
  const vpsToken = (await getSecret("WORKFLOW_TICK_VPS_TOKEN")) || ""

  const ok =
    (cronSecret && constantTimeEq(presented, cronSecret)) ||
    (vpsToken && constantTimeEq(presented, vpsToken))

  if (!cronSecret && !vpsToken) {
    return NextResponse.json({ error: "no auth configured (CRON_SECRET or WORKFLOW_TICK_VPS_TOKEN)" }, { status: 500 })
  }
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

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

  // Defensive: any enabled schedule with NULL next_fire_at can't fire. Compute
  // it now (don't fire on the same tick — let the next compare pick it up).
  // This catches rows created before the POST handler computed next_fire_at,
  // and rows manually inserted into the table without going through the API.
  const { data: nullRows } = await supabase
    .from("schedules")
    .select("id, cron, timezone")
    .eq("enabled", true)
    .is("next_fire_at", null)
  for (const s of nullRows || []) {
    try {
      const next = parseCronExpression(s.cron, { tz: s.timezone || "America/New_York" }).next().toDate().toISOString()
      await supabase.from("schedules").update({ next_fire_at: next }).eq("id", s.id)
    } catch { /* invalid cron — skip; the dashboard surfaces this in the schedules view */ }
  }

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

import { wrapCron } from "@/lib/cron-handler"
const wrapped = wrapCron("workflow-tick", handle)
export async function POST(req: NextRequest) { return wrapped(req) }
export async function GET(req: NextRequest)  { return wrapped(req) }
