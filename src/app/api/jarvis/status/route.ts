/**
 * Combined Jarvis health endpoint.
 *
 * One round-trip that tells the dashboard everything it needs to render the
 * Jarvis health panel:
 *   - Are the required secrets present?
 *   - Is the Telegram webhook registered + pointed at this dashboard?
 *   - Is the VPS agent-runner reachable + warm?
 *   - Are the 5 seed workflows present in the DB?
 *   - How many runs in the last 24h, by status?
 *
 * Auth: PIN-gated (lives behind the admin middleware — caller must already
 * be authenticated with the dashboard).
 *
 * Returns 200 always; success/failure is encoded inside the response body
 * so the UI can render partial state instead of throwing.
 */
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"
import { getWebhookInfo } from "@/lib/telegram"
import { WORKFLOW_TEMPLATES } from "@/lib/workflows/templates"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

interface CheckResult {
  ok: boolean
  detail?: string
  meta?: Record<string, unknown>
}

interface StatusResponse {
  ok: boolean
  checked_at: string
  checks: {
    secrets: CheckResult
    webhook: CheckResult
    agent_runner: CheckResult
    workflows: CheckResult
    runs_24h: CheckResult
  }
}

/** Check all secrets Jarvis needs. Returns ok=true only when EVERY required
 *  one is set; the per-secret booleans go in meta so the UI can show
 *  a checklist. */
async function checkSecrets(): Promise<CheckResult> {
  const required = [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "TELEGRAM_WEBHOOK_SECRET",
    "AGENT_RUNNER_URL",
    "AGENT_RUNNER_TOKEN",
  ]
  const optional = ["TELEGRAM_ALLOWED_CHAT_IDS", "INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"]

  const present: Record<string, boolean> = {}
  for (const k of [...required, ...optional]) {
    present[k] = Boolean(await getSecret(k))
  }
  const missing = required.filter((k) => !present[k])
  return {
    ok: missing.length === 0,
    detail: missing.length === 0 ? "All required secrets present" : `Missing: ${missing.join(", ")}`,
    meta: { present, missing, required, optional },
  }
}

/** Ask Telegram what URL it's currently posting to. */
async function checkWebhook(): Promise<CheckResult> {
  const info = (await getWebhookInfo()) as
    | {
        url?: string
        has_custom_certificate?: boolean
        pending_update_count?: number
        last_error_date?: number
        last_error_message?: string
        max_connections?: number
        ip_address?: string
      }
    | null

  if (!info) {
    return {
      ok: false,
      detail: "Couldn't reach Telegram — TELEGRAM_BOT_TOKEN missing or invalid",
    }
  }

  const url = info.url || ""
  if (!url) {
    return {
      ok: false,
      detail: "Webhook not registered. Click 'Register webhook' to set it up.",
      meta: { info },
    }
  }

  // Check the URL points at /api/webhooks/telegram on a domain that looks like ours.
  const expectedSuffix = "/api/webhooks/telegram"
  const looksRight = url.endsWith(expectedSuffix)
  return {
    ok: looksRight && !info.last_error_message,
    detail: looksRight
      ? info.last_error_message
        ? `Last delivery error: ${info.last_error_message}`
        : "Webhook registered and healthy"
      : `Webhook points elsewhere: ${url}`,
    meta: {
      url,
      pending_updates: info.pending_update_count ?? 0,
      last_error_date: info.last_error_date,
      last_error_message: info.last_error_message,
    },
  }
}

/** Hit the agent-runner /healthz endpoint. */
async function checkAgentRunner(): Promise<CheckResult> {
  const url = await getSecret("AGENT_RUNNER_URL")
  const token = await getSecret("AGENT_RUNNER_TOKEN")
  if (!url) return { ok: false, detail: "AGENT_RUNNER_URL not set" }

  const t0 = Date.now()
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/healthz`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    })
    const latency_ms = Date.now() - t0
    if (!res.ok) {
      return {
        ok: false,
        detail: `agent-runner returned ${res.status}`,
        meta: { latency_ms, status: res.status },
      }
    }
    return {
      ok: true,
      detail: `agent-runner reachable (${latency_ms}ms)`,
      meta: { latency_ms },
    }
  } catch (e) {
    return {
      ok: false,
      detail: `agent-runner unreachable: ${(e as Error).message}`,
      meta: { latency_ms: Date.now() - t0 },
    }
  }
}

/** Make sure all 5 seed workflows exist by id. */
async function checkWorkflows(): Promise<CheckResult> {
  const ids = WORKFLOW_TEMPLATES.map((t) => t.id)
  const { data, error } = await supabase
    .from("workflows")
    .select("id, name, status")
    .in("id", ids)

  if (error) {
    return { ok: false, detail: `DB query failed: ${error.message}` }
  }
  const present = new Set((data || []).map((r) => r.id))
  const missing = WORKFLOW_TEMPLATES.filter((t) => !present.has(t.id))
  return {
    ok: missing.length === 0,
    detail:
      missing.length === 0
        ? `All ${ids.length} workflows seeded`
        : `Missing: ${missing.map((t) => t.name).join(", ")}`,
    meta: {
      expected: ids.length,
      present: present.size,
      missing_names: missing.map((t) => t.name),
      missing_ids: missing.map((t) => t.id),
    },
  }
}

/** Snapshot of the last 24h of runs by status. Useful at-a-glance and lets
 *  the UI flag stuck rows without a separate query. */
async function checkRuns24h(): Promise<CheckResult> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("id, status, created_at, started_at, finished_at")
    .gte("created_at", since)
    .limit(500)

  if (error) return { ok: false, detail: `DB query failed: ${error.message}` }

  const byStatus: Record<string, number> = {}
  let stuck = 0
  const now = Date.now()
  for (const r of data || []) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1
    if (r.status === "running" && r.started_at) {
      const ageMs = now - new Date(r.started_at).getTime()
      if (ageMs > 10 * 60 * 1000) stuck++
    }
    if (r.status === "queued" && r.created_at) {
      const ageMs = now - new Date(r.created_at).getTime()
      if (ageMs > 30 * 60 * 1000) stuck++
    }
  }

  return {
    ok: stuck === 0,
    detail:
      stuck === 0
        ? `${data?.length || 0} runs in last 24h`
        : `${stuck} run(s) stuck — sweeper will clean them up next cycle`,
    meta: { total: data?.length || 0, by_status: byStatus, stuck },
  }
}

export async function GET(): Promise<NextResponse<StatusResponse>> {
  // Run all checks in parallel — they don't depend on each other and the
  // slowest (agent-runner /healthz) caps at 8s, so a parallel call returns
  // in ~the slowest single check rather than the sum.
  const [secrets, webhook, agent_runner, workflows, runs_24h] = await Promise.all([
    checkSecrets(),
    checkWebhook(),
    checkAgentRunner(),
    checkWorkflows(),
    checkRuns24h(),
  ])

  const ok =
    secrets.ok && webhook.ok && agent_runner.ok && workflows.ok && runs_24h.ok

  return NextResponse.json({
    ok,
    checked_at: new Date().toISOString(),
    checks: { secrets, webhook, agent_runner, workflows, runs_24h },
  })
}
