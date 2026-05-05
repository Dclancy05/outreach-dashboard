/**
 * Tiny helper for the analyze / build-automation / self-test routes to
 * report progress into the new `recordings.pipeline_phase` /
 * `pipeline_percent` columns added by Phase D's migration.
 *
 * Write is fire-and-forget + try/catch wrapped: if the migration hasn't
 * been applied yet (preview deploys ahead of the SQL), the underlying
 * pipeline still completes successfully — only the UI progress poll
 * degrades to "phase unknown."
 */

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export type PipelinePhase =
  | "analyzing"
  | "building"
  | "self_testing"
  | "auto_repairing"
  | "active"
  | "needs_rerecording"

const PHASE_PERCENT: Record<PipelinePhase, number> = {
  analyzing: 25,
  building: 50,
  self_testing: 90,
  auto_repairing: 99,
  active: 100,
  needs_rerecording: 100,
}

/**
 * Update `recordings.pipeline_phase` + `pipeline_percent`. Best-effort —
 * any error (column missing, row missing, network blip) is swallowed and
 * logged. Always pass the recording_id; if you have it as a string from a
 * route handler, pass it as-is.
 *
 * Pass an explicit `percent` to override the default for the phase
 * (handy for "self_testing 50% → 70% → 90%" granularity).
 */
export async function setPipelinePhase(
  recordingId: string | null | undefined,
  phase: PipelinePhase,
  percent?: number
): Promise<void> {
  if (!recordingId) return
  try {
    const update: Record<string, unknown> = {
      pipeline_phase: phase,
      pipeline_percent: percent ?? PHASE_PERCENT[phase],
    }
    if (phase === "analyzing") {
      // Stamp the start time only on the first phase update.
      update.pipeline_started_at = new Date().toISOString()
    }
    await supabase.from("recordings").update(update).eq("id", recordingId)
  } catch (e) {
    console.warn(
      `[pipeline-status] phase update failed for ${recordingId}:`,
      e
    )
  }
}
