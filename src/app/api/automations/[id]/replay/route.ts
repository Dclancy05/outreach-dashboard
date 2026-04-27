import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const dynamic = "force-dynamic"
export const maxDuration = 60

interface StepPayload {
  index?: number
  description?: string
  kind?: string
  url?: string
  value?: string | null
  selectors?: { css?: string | null; xpath?: string | null }
  [k: string]: unknown
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}))
  const { target_url: targetUrl, variables: reqVars } = body as { target_url?: string; variables?: Record<string, string> }

  const { data: automation, error } = await supabase
    .from("automations")
    .select("id, name, platform, status, steps, variables")
    .eq("id", params.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!automation) return NextResponse.json({ error: "Automation not found" }, { status: 404 })

  const steps: StepPayload[] = Array.isArray(automation.steps) ? (automation.steps as StepPayload[]) : []
  if (!steps.length) return NextResponse.json({ error: "Automation has no steps to replay" }, { status: 400 })

  // Variables: merge automation defaults, caller-supplied, and target_url fallback
  const variables: Record<string, string> = {
    ...(automation.variables as Record<string, string> | null || {}),
    ...(reqVars || {}),
  }
  if (targetUrl && !variables.target_url) variables.target_url = targetUrl
  // Reasonable defaults so Instagram/Facebook templates resolve even without a lead
  if (!variables.username) {
    try {
      const u = new URL(targetUrl || steps[0]?.url || "")
      const guess = u.pathname.split("/").filter(Boolean)[0]
      if (guess) variables.username = guess
    } catch {}
    if (!variables.username) variables.username = "mrbeast"
  }
  if (!variables.message) variables.message = "Test message from outreach HQ"

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

  let stepResults: Array<{ index: number; description: string; status: string; detail?: string }> = []
  let overall: "passed" | "failed" = "failed"
  let lastError: string | null = null

  const VPS_URL =
    (await getSecret("VPS_URL")) ||
    (await getSecret("RECORDING_SERVER_URL")) ||
    "https://srv1197943.taild42583.ts.net:10000"

  try {
    const res = await fetch(`${VPS_URL}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps, variables }),
      signal: AbortSignal.timeout(55000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.ok) {
      lastError = data?.error || `Replay service returned ${res.status}`
    } else {
      stepResults = data.steps || []
      overall = data.overall === "passed" ? "passed" : "failed"
      lastError = data.lastError || null
    }
  } catch (e) {
    lastError = (e as Error).message
  }

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

    const autoUpdates: Record<string, unknown> = { last_tested_at: new Date().toISOString() }
    if (overall === "passed") {
      autoUpdates.last_error = null
      // Heal a previously flagged automation if the replay now passes.
      if ((automation as { status?: string }).status === "needs_rerecording") {
        autoUpdates.status = "active"
      }
    } else {
      autoUpdates.last_error = lastError || "Replay failed"
      if ((automation as { status?: string }).status === "active") {
        autoUpdates.status = "needs_rerecording"
      }
    }
    await supabase.from("automations").update(autoUpdates).eq("id", automation.id)
  }

  return NextResponse.json({
    data: {
      run_id: runRow?.id || null,
      automation_id: automation.id,
      automation_name: automation.name,
      overall,
      steps: stepResults,
      note: lastError || (overall === "passed" ? "Replay executed against live browser." : "Replay failed."),
    },
  })
}
