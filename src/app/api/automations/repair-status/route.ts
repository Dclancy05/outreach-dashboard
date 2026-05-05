import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * GET /api/automations/repair-status
 *
 * Returns a map of automation_id → last AI-repair info, drawn from the
 * `v_automation_last_repair` view (Phase E migration). The Maintenance
 * tab fetches this once on mount and renders a "Repaired by AI" badge
 * on rows whose automation_id is present in the response.
 *
 * Stable response shape even when the view doesn't exist (pre-migration
 * preview) — returns `{ ok: true, repairs: {} }` so the UI degrades to
 * "no badges" rather than throwing.
 */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("v_automation_last_repair")
      .select(
        "automation_id, last_repair_at, repair_log_id, last_repair_error, last_repair_success"
      )

    if (error) {
      // Likely the view doesn't exist yet (migration not applied) — degrade
      // silently. UI gets an empty map and shows no badges; no crash.
      return NextResponse.json({
        ok: true,
        repairs: {},
        note: "v_automation_last_repair view not available — apply migrations/20260506_repair_attribution.sql to enable AI-repair badges.",
      })
    }

    const repairs: Record<
      string,
      {
        last_repair_at: string
        repair_log_id: string | null
        success: boolean | null
        error: string | null
      }
    > = {}
    for (const row of data || []) {
      if (!row.automation_id) continue
      repairs[row.automation_id] = {
        last_repair_at: row.last_repair_at as string,
        repair_log_id: (row.repair_log_id as string | null) ?? null,
        success: (row.last_repair_success as boolean | null) ?? null,
        error: (row.last_repair_error as string | null) ?? null,
      }
    }

    return NextResponse.json({ ok: true, repairs })
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "unknown error",
        repairs: {},
      },
      { status: 200 } // Never 5xx — the UI doesn't depend on this.
    )
  }
}
