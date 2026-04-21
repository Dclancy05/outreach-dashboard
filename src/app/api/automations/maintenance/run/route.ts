import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * POST /api/automations/maintenance/run
 *
 * Placeholder for the manual "Run maintenance now" button on the Maintenance
 * tab. The real cron + replay engine lives in Phase 4 of the build plan —
 * this route exists so the UI can wire the button NOW without a 404.
 *
 * Returns 501 so callers can render "Coming soon" copy instead of a generic
 * failure toast. GET is a cheap healthcheck the maintenance UI uses to tell
 * Dylan "the route is reachable, the runner itself isn't built yet."
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      status: "not_implemented",
      message: "Maintenance runner is not wired yet. The 6am ET cron + replay engine lands in Phase 4 — this button will trigger it manually once that ships.",
    },
    { status: 501 }
  )
}

export async function GET(_req: NextRequest) {
  return NextResponse.json({ ok: true, ready: false, note: "Maintenance runner not yet implemented (Phase 4)." })
}
