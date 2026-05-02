/**
 * Cron tick — drains new events from (ai_agent_log, workflow_runs,
 * accounts) into `notifications` so the inbox UI always has fresh items
 * within 5 minutes of an upstream event.
 *
 * Wired in vercel.json at every-5-minutes. Idempotent (partial unique index
 * on (source_kind, source_id)) so concurrent ticks or replay-after-crash
 * never double-write.
 *
 * Auth: Bearer ${CRON_SECRET} — same pattern as cookie-backup. Middleware
 * whitelists /api/cron/* so the cookie gate doesn't block Vercel's
 * scheduled invocation.
 */
import { NextRequest, NextResponse } from "next/server"
import { seedNotifications } from "@/lib/notifications-seeder"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const result = await seedNotifications()
  return NextResponse.json({ ok: true, ...result })
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
