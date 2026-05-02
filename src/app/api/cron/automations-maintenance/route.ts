import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function vpsUrl(): Promise<string> {
  return (await getSecret("VPS_URL")) || "https://srv1197943.taild42583.ts.net:10000"
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

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  if (auth !== `Bearer ${expected}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const startedAt = new Date()

  // Test every automation that has steps, regardless of status — a maintenance
  // pass exists to detect selector drift, so we need to verify currently-active
  // ones AND re-verify ones previously flagged `needs_rerecording` in case a
  // change on the target site fixed them.
  const { data: automations, error } = await supabase
    .from("automations")
    .select("id, name, platform, status, steps, variables")
    .in("status", ["active", "needs_rerecording", "fixing"])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = (automations || []) as Array<{ id: string; name: string; platform: string; status: string; steps: Step[] | null; variables: Record<string, string> | null }>
  const results: Array<{ automation_id: string; overall: "passed" | "failed" | "skipped"; detail?: string }> = []

  for (const a of list) {
    const steps = Array.isArray(a.steps) ? a.steps : []
    if (!steps.length) {
      results.push({ automation_id: a.id, overall: "skipped", detail: "no steps" })
      continue
    }

    const { data: runRow } = await supabase
      .from("automation_runs")
      .insert({
        automation_id: a.id,
        run_type: "maintenance",
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
    let replayData: { steps?: Array<{ status: string }>; lastError?: string } = {}

    try {
      const VPS_URL = await vpsUrl()
      const res = await fetch(`${VPS_URL}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps, variables }),
        signal: AbortSignal.timeout(50000),
      })
      replayData = await res.json().catch(() => ({}))
      if (!res.ok) {
        lastError = (replayData as { error?: string }).error || `Replay service returned ${res.status}`
      } else {
        const rSteps = Array.isArray((replayData as { steps?: unknown }).steps) ? (replayData as { steps: Array<{ status: string }> }).steps : []
        stepsCompleted = rSteps.filter(s => s.status === "passed").length
        const failed = rSteps.find(s => s.status === "failed")
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

    // Flag status: failure → needs_rerecording (unless it's already broken/draft).
    // Success from a previously flagged state → active (the site probably self-healed).
    const updates: Record<string, unknown> = { last_tested_at: new Date().toISOString() }
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

    // Notification bell wiring (Automations spec, audit item: notification
    // bell exists but no automation-failure path writes to it). Surface only
    // on first transition active → needs_rerecording, not every subsequent
    // maintenance pass — otherwise the inbox spams once per day per broken
    // automation. Idempotency: dedupe on source_id=automation_id with
    // unique partial index installed by 20260502_inbox_seeders.sql.
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
        console.warn("[automations-maintenance] notify insert failed:", e)
      }
    }

    results.push({ automation_id: a.id, overall, detail: lastError || undefined })
  }

  return NextResponse.json({
    ok: true,
    tested: results.length,
    passed: results.filter(r => r.overall === "passed").length,
    failed: results.filter(r => r.overall === "failed").length,
    skipped: results.filter(r => r.overall === "skipped").length,
    ran_at: startedAt.toISOString(),
    took_ms: Date.now() - startedAt.getTime(),
    results,
  })
}

export async function POST(req: NextRequest) { return handle(req) }
export async function GET(req: NextRequest) { return handle(req) }
