/**
 * Manual stuck-runs sweeper trigger.
 *
 * Re-uses the same logic as the cron at /api/cron/sweep-stuck-runs but is
 * PIN-gated (admin middleware) instead of CRON_SECRET-gated, so the Jarvis
 * health panel can fire it on-demand without exposing the cron secret to the
 * browser.
 *
 * Implementation: forwards to the cron handler with a synthesized auth header.
 * This keeps the actual sweep logic in one place — the cron route — so any
 * future change to "what counts as stuck" only touches that file.
 */
import { NextResponse } from "next/server"
import { GET as sweepHandler } from "@/app/api/cron/sweep-stuck-runs/route"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET || ""
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on the server" },
      { status: 500 },
    )
  }

  // Build a Request with the auth the cron handler expects. The handler reads
  // headers + URL but not body, so a minimal GET against the dashboard origin
  // is enough.
  const fakeReq = new Request("http://internal/api/cron/sweep-stuck-runs", {
    method: "GET",
    headers: { authorization: `Bearer ${cronSecret}` },
  })
  // Cast: NextRequest is structurally compatible with Request for our needs.
  return sweepHandler(fakeReq as unknown as Parameters<typeof sweepHandler>[0])
}
