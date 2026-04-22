import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const VNC_MANAGER_URL = process.env.VNC_MANAGER_URL || "http://127.0.0.1:18790"
const VNC_API_KEY = process.env.VNC_API_KEY || "vnc-mgr-2026-dylan"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/automations/:id/replay  — P9.3
 *
 * Replays a recorded automation step-by-step against a target URL. Writes an
 * automation_runs row so the Overview tab picks up the run, then returns a
 * per-step progress report for the UI dialog.
 *
 * Body: { target_url: string, session_id?: string }
 *
 * If `session_id` is supplied we forward each step's URL (derived from the
 * step's description or target_url fallback) to the VNC Manager's navigate
 * endpoint so the replay is actually visible in the noVNC pane. When the
 * session is unreachable we still complete the run in "stub" mode so Dylan
 * gets end-to-end visibility.
 */

interface StepPayload {
  index?: number
  description?: string
  kind?: string
  url?: string
  selectors?: Record<string, unknown>
  [k: string]: unknown
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}))
  const { target_url: targetUrl, session_id: sessionId } = body as { target_url?: string; session_id?: string }

  if (!targetUrl) {
    return NextResponse.json({ error: "target_url is required" }, { status: 400 })
  }

  const { data: automation, error } = await supabase
    .from("automations")
    .select("id, name, platform, steps")
    .eq("id", params.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!automation) return NextResponse.json({ error: "Automation not found" }, { status: 404 })

  const steps: StepPayload[] = Array.isArray(automation.steps) ? (automation.steps as StepPayload[]) : []

  // Kick off a run row so the Overview/Maintenance tabs see this activity.
  const { data: runRow } = await supabase
    .from("automation_runs")
    .insert({
      automation_id: automation.id,
      run_type: "replay",
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  const stepResults: Array<{
    index: number
    description: string
    status: "passed" | "failed" | "skipped"
    detail?: string
  }> = []

  let stubMode = !sessionId
  let lastError: string | null = null

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const description = (step.description as string) || `Step ${i + 1}`

    // The first step always navigates to the provided target URL. Subsequent
    // steps navigate to any URL explicitly stored on the step, or are
    // reported as "no-op / waiting on CDP recorder" in stub mode.
    const stepUrl = i === 0 ? targetUrl : (typeof step.url === "string" ? step.url : "")

    if (stubMode || !stepUrl) {
      stepResults.push({ index: i, description, status: "skipped", detail: stubMode ? "No VNC session — simulated" : "No URL on step" })
      continue
    }

    try {
      const navRes = await fetch(`${VNC_MANAGER_URL}/api/sessions/${sessionId}/navigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": VNC_API_KEY },
        body: JSON.stringify({ url: stepUrl }),
      })
      if (!navRes.ok) {
        // First failure flips us into stub mode so subsequent steps at least complete cleanly.
        stubMode = true
        lastError = `VNC navigate failed (${navRes.status})`
        stepResults.push({ index: i, description, status: "failed", detail: lastError })
      } else {
        stepResults.push({ index: i, description, status: "passed", detail: `Navigated to ${stepUrl}` })
      }
    } catch (e) {
      stubMode = true
      lastError = (e as Error).message
      stepResults.push({ index: i, description, status: "failed", detail: lastError })
    }
  }

  const allPassed = stepResults.every(r => r.status === "passed" || r.status === "skipped")
  const overall: "passed" | "failed" = allPassed ? "passed" : "failed"

  if (runRow?.id) {
    await supabase
      .from("automation_runs")
      .update({
        status: overall,
        finished_at: new Date().toISOString(),
        steps_completed: stepResults.filter(r => r.status === "passed").length,
        error: lastError || undefined,
      })
      .eq("id", runRow.id)
  }

  return NextResponse.json({
    data: {
      run_id: runRow?.id || null,
      automation_id: automation.id,
      automation_name: automation.name,
      overall,
      steps: stepResults,
      stub: stubMode,
      note: stubMode
        ? "Replay completed without a live VNC session. Pass session_id to run against a real browser."
        : "Replay executed against live browser session.",
    },
  })
}
