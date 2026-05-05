import { NextRequest, NextResponse } from "next/server"
import { runMaintenance } from "@/lib/automations/maintenance-runner"
import { extractAdminId } from "@/lib/audit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

/**
 * POST /api/automations/maintenance/run
 *
 * Manual "Run maintenance now" button on the Maintenance tab. Same logic
 * as the daily cron at /api/cron/automations-maintenance, but gated by
 * the dashboard's PIN-cookie auth (via extractAdminId) instead of
 * CRON_SECRET. Phase D — replaces the previous 501 stub.
 *
 * Body (optional):
 *   { automation_ids?: string[] }
 *     If supplied, only those automations are tested; otherwise the
 *     default sweep (all active + needs_rerecording + fixing) runs.
 */
export async function POST(req: NextRequest) {
  const adminId = extractAdminId(req.headers.get("cookie"))
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Bug #8 fix — validate array contents + cap. Without these, a malformed
  // body could slip non-string values into Supabase's .in() filter, and
  // an oversized list could blow the 60s wallclock budget. The
  // UUID regex matches canonical 8-4-4-4-12 hex format; ids that fail
  // are silently dropped (caller can re-submit cleaned list).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const MAX_IDS = 50
  let automationIds: string[] | undefined
  try {
    const ct = req.headers.get("content-type") || ""
    if (ct.includes("application/json")) {
      const body = (await req.json()) as { automation_ids?: unknown }
      if (Array.isArray(body?.automation_ids)) {
        const cleaned = body.automation_ids
          .filter((v): v is string => typeof v === "string" && UUID_RE.test(v))
          .slice(0, MAX_IDS)
        if (cleaned.length > 0) automationIds = cleaned
      }
    }
  } catch {
    // empty body is fine — full sweep
  }

  const result = await runMaintenance({
    runType: "manual",
    automationIds,
  })
  return NextResponse.json(result)
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    ready: true,
    note: "POST to trigger a manual maintenance run. Optional body { automation_ids?: string[] }.",
  })
}
