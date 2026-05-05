/**
 * Shared "run a maintenance pass" implementation. Both the
 * /api/cron/automations-maintenance daily cron AND the new
 * /api/automations/maintenance/run manual endpoint call this so the two
 * paths are guaranteed to behave identically.
 *
 * Phase D: extracted out of the cron route (which used to inline the whole
 * thing), so the manual "Run maintenance now" button on the Maintenance
 * tab finally has a real backend instead of the previous 501 stub.
 */

import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function vpsUrl(): Promise<string> {
  return (
    (await getSecret("VPS_URL")) ||
    "https://srv1197943.taild42583.ts.net:10000"
  )
}

const TEST_TARGETS: Record<string, string> = {
  instagram: "https://www.instagram.com/mrbeast/",
  facebook: "https://www.facebook.com/zuck",
  tiktok: "https://www.tiktok.com/@mrbeast",
  linkedin: "https://www.linkedin.com/in/williamhgates/",
  youtube: "https://www.youtube.com/@MrBeast",
  twitter: "https://twitter.com/elonmusk",
  snapchat: "https://www.snapchat.com/add/team.snapchat",
  pinterest: "https://www.pinterest.com/starbucks/",
}

interface Step {
  description?: string
  kind?: string
  url?: string
  value?: string | null
  selectors?: { css?: string | null; xpath?: string | null }
}

export interface MaintenanceOptions {
  /** Restrict to specific automation ids; default = all eligible. */
  automationIds?: string[]
  /** Filter by `automations.status` (default: active + needs_rerecording + fixing). */
  statuses?: string[]
  /** Audit string for run_type (default: "maintenance"). Manual runs pass "manual" so the cron + manual graph is separable. */
  runType?: string
  /** Per-replay timeout, ms. Default 50s — replay can be slow. */
  timeoutMs?: number
  /**
   * Cap on the number of automations processed in one call. Bug #6 —
   * Vercel's `maxDuration: 60` for the cron / manual routes means a
   * naive loop over 100+ automations would be SIGKILL'd partway. Default
   * 50 keeps the wallclock under the 60s ceiling assuming ~1s per
   * automation including DB writes (replay timeout itself doesn't apply
   * when the call returns fast). The cron's 6am ET schedule fires daily,
   * so 50/day handles up to ~1500 active automations on a 30-day cycle.
   */
  maxAutomations?: number
}

export interface MaintenanceResult {
  ok: boolean
  ran_at: string
  took_ms: number
  tested: number
  passed: number
  failed: number
  skipped: number
  results: Array<{
    automation_id: string
    overall: "passed" | "failed" | "skipped"
    detail?: string
  }>
}

export async function runMaintenance(
  opts: MaintenanceOptions = {}
): Promise<MaintenanceResult> {
  const startedAt = new Date()
  const statuses = opts.statuses || [
    "active",
    "needs_rerecording",
    "fixing",
  ]
  const runType = opts.runType || "maintenance"
  const timeoutMs = opts.timeoutMs ?? 50_000

  const maxAutomations = opts.maxAutomations ?? 50

  let query = supabase
    .from("automations")
    .select("id, name, platform, status, steps, variables")
    .in("status", statuses)
    // Bug #6 fix — order by least-recently tested first so the cron's
    // batched coverage rotates through the fleet over time. Without
    // this, the same first 50 alphabetical-by-id automations would get
    // tested every day and the rest would never see maintenance.
    .order("last_tested_at", { ascending: true, nullsFirst: true })
    .limit(maxAutomations)

  if (opts.automationIds && opts.automationIds.length > 0) {
    query = query.in("id", opts.automationIds)
  }

  const { data: automations, error } = await query

  if (error) {
    return {
      ok: false,
      ran_at: startedAt.toISOString(),
      took_ms: Date.now() - startedAt.getTime(),
      tested: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      results: [{ automation_id: "(query)", overall: "failed", detail: error.message }],
    }
  }

  const list = (automations || []) as Array<{
    id: string
    name: string
    platform: string
    status: string
    steps: Step[] | null
    variables: Record<string, string> | null
  }>
  const results: MaintenanceResult["results"] = []

  for (const a of list) {
    const steps = Array.isArray(a.steps) ? a.steps : []
    if (!steps.length) {
      results.push({
        automation_id: a.id,
        overall: "skipped",
        detail: "no steps",
      })
      continue
    }

    const { data: runRow } = await supabase
      .from("automation_runs")
      .insert({
        automation_id: a.id,
        run_type: runType,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    const variables: Record<string, string> = {
      ...(a.variables || {}),
      username: (a.variables?.username as string) || "mrbeast",
      message: (a.variables?.message as string) || "[maintenance replay]",
      target_url: TEST_TARGETS[a.platform] || TEST_TARGETS.instagram,
    }

    let overall: "passed" | "failed" = "failed"
    let stepsCompleted = 0
    let lastError: string | null = null

    try {
      const VPS_URL = await vpsUrl()
      const res = await fetch(`${VPS_URL}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps, variables }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      const replayData = await res.json().catch(() => ({}))
      if (!res.ok) {
        lastError =
          (replayData as { error?: string }).error ||
          `Replay service returned ${res.status}`
      } else {
        const rSteps = Array.isArray(
          (replayData as { steps?: unknown }).steps
        )
          ? (replayData as { steps: Array<{ status: string }> }).steps
          : []
        stepsCompleted = rSteps.filter((s) => s.status === "passed").length
        const failed = rSteps.find((s) => s.status === "failed")
        overall = failed ? "failed" : "passed"
        lastError = (replayData as { lastError?: string }).lastError || null
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
          steps_completed: stepsCompleted,
          error: lastError || undefined,
        })
        .eq("id", runRow.id)
    }

    // Flag status: failure → needs_rerecording (unless already broken/draft).
    // Success from a previously-flagged state → active (the site self-healed).
    const updates: Record<string, unknown> = {
      last_tested_at: new Date().toISOString(),
    }
    const wasActive = a.status === "active"
    if (overall === "passed" && a.status !== "active") {
      updates.status = "active"
      updates.last_error = null
    }
    if (overall === "failed" && wasActive) {
      updates.status = "needs_rerecording"
      updates.last_error = lastError || "Replay failed during maintenance"
    }
    await supabase.from("automations").update(updates).eq("id", a.id)

    // Notification bell wiring (only on first transition active →
    // needs_rerecording — dedupe is enforced by the unique partial index
    // installed by 20260502_inbox_seeders.sql).
    if (overall === "failed" && wasActive) {
      try {
        await supabase.from("notifications").insert({
          type: "automation_failed",
          title: `Automation ${a.name || a.id} needs re-recording`,
          message: lastError
            ? `Maintenance replay failed: ${lastError.slice(0, 240)}`
            : "Maintenance replay failed — selector drift on the target platform.",
          source_kind: "automation",
          source_id: a.id,
        })
      } catch (e) {
        console.warn("[maintenance-runner] notify insert failed:", e)
      }
    }

    results.push({
      automation_id: a.id,
      overall,
      detail: lastError || undefined,
    })
  }

  return {
    ok: true,
    ran_at: startedAt.toISOString(),
    took_ms: Date.now() - startedAt.getTime(),
    tested: results.length,
    passed: results.filter((r) => r.overall === "passed").length,
    failed: results.filter((r) => r.overall === "failed").length,
    skipped: results.filter((r) => r.overall === "skipped").length,
    results,
  }
}
