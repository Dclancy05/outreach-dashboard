/**
 * Cron tick — drains new events from (ai_agent_log, workflow_runs,
 * accounts) into `notifications` so the inbox UI always has fresh items
 * within 5 minutes of an upstream event.
 *
 * Wired in vercel.json at every-5-minutes. Idempotent (partial unique index
 * on (source_kind, source_id)) so concurrent ticks or replay-after-crash
 * never double-write.
 */
import { NextRequest, NextResponse } from "next/server"
import { seedNotifications } from "@/lib/notifications-seeder"
import { withCronHandler } from "@/lib/cron-handler"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const handler = withCronHandler("inbox-tick", async () => {
  const result = await seedNotifications()
  return NextResponse.json({ ok: true, ...result })
})

export const GET = handler
export const POST = handler
