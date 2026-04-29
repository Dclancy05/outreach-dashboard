// Scheduled Inngest functions — fire on cron via Inngest's own scheduler.
// Used instead of Vercel cron entries to bypass the Hobby-tier cron limit.
//
// Two functions:
//   costCapCheck   — hourly: pause workflows when daily Anthropic spend hits cap
//   morningDigest  — daily  8am UTC: Telegram digest of last 24h of runs
//
// The cron cadence is enforced by Inngest. The same business logic also lives
// behind the corresponding Vercel HTTP routes (/api/cron/cost-cap and
// /api/cron/morning-digest) so it can be triggered manually for debugging via
// `curl -H "Authorization: Bearer $CRON_SECRET" …`.

import { createClient } from "@supabase/supabase-js"
import { inngest } from "@/lib/inngest/client"
import { dispatchNotification } from "@/lib/notifications/dispatch"
import { sendTelegram } from "@/lib/telegram"
import { getSecret } from "@/lib/secrets"

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// ─── cost-cap helpers ───────────────────────────────────────────────────────

const DEFAULT_CAP_USD = 20.0
const COST_CAP_KEY = "cost_cap"

function todayUtcMidnightIso(): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

async function resolveCap(): Promise<number> {
  const raw = await getSecret("DAILY_BUDGET_CAP_USD")
  if (raw) {
    const parsed = parseFloat(raw)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return DEFAULT_CAP_USD
}

export async function runCostCapCheck() {
  const supabase = sb()
  const cap = await resolveCap()

  const { data: rows, error: sumErr } = await supabase
    .from("workflow_runs")
    .select("cost_usd")
    .gte("created_at", todayUtcMidnightIso())
    .in("status", ["running", "succeeded", "failed", "paused", "budget_exceeded"])
  if (sumErr) throw new Error(`sum spend failed: ${sumErr.message}`)
  const spend = (rows || []).reduce((a, r) => a + (Number(r.cost_usd) || 0), 0)

  if (spend < cap) return { capped: false, spend, cap }

  const { data: stateRow } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", COST_CAP_KEY)
    .maybeSingle()
  const state = (stateRow?.value as Record<string, unknown>) || {}
  const today = todayUtcDate()
  if (state.last_capped_date === today) {
    return { capped: true, already_capped_today: true, spend, cap }
  }

  const { data: running, error: selErr } = await supabase
    .from("workflow_runs")
    .select("id")
    .in("status", ["running", "queued"])
  if (selErr) throw new Error(`select running failed: ${selErr.message}`)
  const ids = (running || []).map((r) => r.id as string)

  let pausedCount = 0
  if (ids.length > 0) {
    const reason = `cost_cap: daily spend $${spend.toFixed(2)} >= cap $${cap.toFixed(2)}`
    const { error: updErr } = await supabase
      .from("workflow_runs")
      .update({ status: "paused", error: reason, finished_at: new Date().toISOString() })
      .in("id", ids)
    if (updErr) throw new Error(`pause runs failed: ${updErr.message}`)
    pausedCount = ids.length
  }

  try {
    await dispatchNotification(
      "budget_exceeded",
      {
        run_id: "cost-cap-cron",
        workflow_name: "Daily cost cap",
        cost_so_far_usd: spend,
        budget_usd: cap,
        extra: { cap, paused_count: pausedCount, scope: "daily" },
      },
      { channels: ["telegram"] },
    )
  } catch (e) {
    console.error("[cost-cap] notification dispatch threw:", (e as Error).message)
  }

  await supabase.from("system_settings").upsert(
    {
      key: COST_CAP_KEY,
      value: {
        ...state,
        last_capped_date: today,
        last_capped_at: new Date().toISOString(),
        last_spend: spend,
        last_cap: cap,
        last_paused_count: pausedCount,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  )

  return { capped: true, paused: pausedCount, spend, cap }
}

// ─── morning-digest helpers ─────────────────────────────────────────────────

type RunRow = {
  id: string
  workflow_id: string
  status: string
  trigger: string
  cost_usd: number | string | null
  total_tokens: number | null
  started_at: string | null
  finished_at: string | null
  summary: string | null
  output: Record<string, unknown> | null
  error: string | null
  workflows: { name: string | null; emoji: string | null } | null
}

function escName(s: string): string {
  return s.replace(/([_*`\[])/g, "\\$1")
}

function pickRunLabel(r: RunRow): string {
  const wf = r.workflows?.name?.trim() || "Untitled workflow"
  const emoji = r.workflows?.emoji ? `${r.workflows.emoji} ` : ""
  return `${emoji}${escName(wf)}`
}

function pickRunDetail(r: RunRow): string {
  if (r.summary && r.summary.trim().length > 0) {
    const oneLine = r.summary.replace(/\s+/g, " ").trim()
    return oneLine.length > 80 ? oneLine.slice(0, 77) + "…" : oneLine
  }
  const out = r.output || {}
  const pr = (out as { pr_url?: unknown; pr?: unknown }).pr_url ||
    (out as { pr_url?: unknown; pr?: unknown }).pr ||
    null
  if (typeof pr === "string" && pr) return `→ ${pr}`
  if (r.error) {
    const e = r.error.replace(/\s+/g, " ").trim()
    return e.length > 80 ? e.slice(0, 77) + "…" : e
  }
  return r.trigger ? `(${r.trigger})` : ""
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

export async function runMorningDigest() {
  const supabase = sb()
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data, error } = await supabase
    .from("workflow_runs")
    .select(
      "id, workflow_id, status, trigger, cost_usd, total_tokens, started_at, finished_at, summary, output, error, workflows ( name, emoji )",
    )
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(50)
  if (error) throw new Error(`select runs failed: ${error.message}`)
  const runs = (data || []) as unknown as RunRow[]

  if (runs.length === 0) {
    const quiet = "🌅 Quiet night — nothing to report."
    await sendTelegram(quiet, { parseMode: "Markdown" })
    return { runs_summarized: 0, total_spend_usd: 0 }
  }

  const buckets: Record<"shipped" | "awaiting" | "failed" | "running", RunRow[]> = {
    shipped: [],
    awaiting: [],
    failed: [],
    running: [],
  }
  let totalSpend = 0
  for (const r of runs) {
    totalSpend += Number(r.cost_usd ?? 0)
    switch (r.status) {
      case "succeeded": buckets.shipped.push(r); break
      case "paused": buckets.awaiting.push(r); break
      case "failed":
      case "aborted":
      case "budget_exceeded": buckets.failed.push(r); break
      case "queued":
      case "running": buckets.running.push(r); break
      default: buckets.running.push(r)
    }
  }

  const cap = Number(process.env.WORKFLOW_DAILY_BUDGET_USD || 20)
  const lines: string[] = []
  lines.push("🌅 *Morning, Dylan*", "", "_Last 24h of Jarvis runs:_", "")

  const renderBucket = (header: string, rows: RunRow[]) => {
    if (rows.length === 0) return
    lines.push(`${header} (${rows.length})*`)
    for (const r of rows.slice(0, 10)) {
      const label = pickRunLabel(r)
      const detail = pickRunDetail(r)
      const cost = Number(r.cost_usd ?? 0)
      const costStr = cost > 0 ? ` — ${fmtUsd(cost)}` : ""
      const detailStr = detail ? ` ${detail}` : ""
      lines.push(`• ${label}${detailStr}${costStr}`)
    }
    if (rows.length > 10) lines.push(`• …and ${rows.length - 10} more`)
    lines.push("")
  }

  renderBucket("✅ *Shipped", buckets.shipped)
  renderBucket("⏸️ *Awaiting your review", buckets.awaiting)
  renderBucket("❌ *Failed", buckets.failed)
  renderBucket("🟡 *Still running", buckets.running)
  lines.push(`_Total spend: ${fmtUsd(totalSpend)} of ${fmtUsd(cap)} cap_`)
  lines.push(`_Tap a run name in /agency/runs to see details._`)

  await sendTelegram(lines.join("\n"), { parseMode: "Markdown" })
  return {
    runs_summarized: runs.length,
    by_status: {
      shipped: buckets.shipped.length,
      awaiting: buckets.awaiting.length,
      failed: buckets.failed.length,
      running: buckets.running.length,
    },
    total_spend_usd: Number(totalSpend.toFixed(4)),
  }
}

// ─── Inngest scheduled functions ────────────────────────────────────────────

export const costCapCheck = inngest.createFunction(
  { id: "cost-cap-check", name: "Hourly cost-cap watchdog", retries: 2 },
  { cron: "0 * * * *" },
  async ({ step, logger }) => {
    return step.run("run-cost-cap", async () => {
      try {
        const result = await runCostCapCheck()
        logger.info("[cost-cap] " + JSON.stringify(result))
        return result
      } catch (e) {
        logger.error("[cost-cap] failed", { err: (e as Error).message })
        throw e
      }
    })
  },
)

export const morningDigest = inngest.createFunction(
  { id: "morning-digest", name: "Morning digest (8am UTC)", retries: 2 },
  { cron: "0 8 * * *" },
  async ({ step, logger }) => {
    return step.run("run-morning-digest", async () => {
      try {
        const result = await runMorningDigest()
        logger.info("[morning-digest] " + JSON.stringify(result))
        return result
      } catch (e) {
        logger.error("[morning-digest] failed", { err: (e as Error).message })
        throw e
      }
    })
  },
)
