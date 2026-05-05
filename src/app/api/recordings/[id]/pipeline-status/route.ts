import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * GET /api/recordings/[id]/pipeline-status
 *
 * Polled every ~1.5s by the RecordingModal during the "processing" phase
 * to drive the real progress bar (Phase D — replaces the fake 200ms
 * timer). The phase + percent come from the new `pipeline_phase` /
 * `pipeline_percent` columns on `recordings` (migration
 * 20260505_recordings_pipeline_state.sql), which the analyze /
 * build-automation / self-test routes update on entry/exit.
 *
 * Phase budgets (rough):
 *   analyzing       0-25
 *   building        25-50
 *   self_testing    50-90
 *   auto_repairing  90-99   (Phase E)
 *   active          100
 *   needs_rerecording  100  (terminal failure)
 *
 * Returns 200 with a stable shape even when the pipeline columns are
 * still NULL (e.g., before the migration runs in preview), so the UI
 * can degrade gracefully.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("recordings")
    .select(
      "id, status, pipeline_phase, pipeline_percent, pipeline_started_at, name, platform, action_type, last_error"
    )
    .eq("id", id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "recording not found" }, { status: 404 })
  }

  // Surface the most recent test attempts so the failure card can show
  // what George tried before giving up. Best-effort — if the table or
  // join fails, we still return the phase data so the modal poll keeps
  // working.
  let recentAttempts: Array<{
    strategy: string
    status: string
    error?: string | null
    ran_at?: string | null
  }> = []
  try {
    const { data: log } = await supabase
      .from("automation_test_log")
      .select("strategy, status, error, created_at")
      .or(`recording_id.eq.${id},automation_id.in.(select id from automations where recording_id=${id})`)
      .order("created_at", { ascending: false })
      .limit(10)
    if (Array.isArray(log)) {
      recentAttempts = log.map((r) => ({
        strategy: r.strategy as string,
        status: r.status as string,
        error: (r as { error?: string | null }).error ?? null,
        ran_at: (r as { created_at?: string | null }).created_at ?? null,
      }))
    }
  } catch {
    // table shape may differ in older deploys; swallow
  }

  return NextResponse.json({
    id: data.id,
    name: data.name,
    platform: data.platform,
    action_type: data.action_type,
    status: data.status,
    phase: (data.pipeline_phase as string) || null,
    percent:
      typeof data.pipeline_percent === "number" ? data.pipeline_percent : null,
    started_at: data.pipeline_started_at || null,
    last_error: data.last_error || null,
    recent_attempts: recentAttempts,
  })
}
