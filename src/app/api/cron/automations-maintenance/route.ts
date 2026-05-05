import { NextRequest, NextResponse } from "next/server"
import { runMaintenance } from "@/lib/automations/maintenance-runner"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Daily 6am ET cron — replays every active / needs_rerecording / fixing
 * automation against safe public test targets to detect selector drift.
 * Implementation lives in `src/lib/automations/maintenance-runner.ts`
 * so the manual "Run maintenance now" button shares the same code path.
 *
 * Phase D refactor: extracted out the implementation, added the manual
 * counterpart at `/api/automations/maintenance/run` (replaces the previous
 * 501 stub).
 */

async function handle(req: NextRequest) {
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
  const result = await runMaintenance({ runType: "maintenance" })
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
export async function GET(req: NextRequest) {
  return handle(req)
}
