/**
 * Morning Digest cron — fires daily at 8am UTC.
 *
 * Pulls the last 24h of workflow_runs (joined to workflows for a friendly name),
 * buckets them by status into a Telegram-friendly summary, and sends it via
 * sendTelegram(). The message is deliberately written in plain English — no
 * corporate-speak — because Dylan reads it on his phone first thing in the
 * morning. See SYSTEM.md §2.8.
 *
 * Output bucketing:
 *   ✅ Shipped              — status = 'succeeded'
 *   ⏸️ Awaiting your review — status = 'paused'         (approval gate)
 *   ❌ Failed               — status IN ('failed','aborted','budget_exceeded')
 *   🟡 Still running        — status IN ('queued','running')
 *
 * Total spend = sum of cost_usd across the 24h window, compared against
 * env WORKFLOW_DAILY_BUDGET_USD (default $20.00 per the example template, but
 * the env file ships at $25 — we read whatever is set).
 *
 * Returns JSON { ok, runs_summarized, by_status, total_spend_usd, telegram_sent }
 * so the cron log in Vercel is debuggable without opening Telegram.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "@/lib/telegram"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

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

// Telegram Markdown (legacy, not V2) reserves _ * ` [. We only need to escape
// what shows up in workflow names / summaries — keep it minimal so deliberate
// markdown in summaries (e.g. "*shipped*") still renders.
function escName(s: string): string {
  return s.replace(/([_*`\[])/g, "\\$1")
}

function pickRunLabel(r: RunRow): string {
  const wf = r.workflows?.name?.trim() || "Untitled workflow"
  const emoji = r.workflows?.emoji ? `${r.workflows.emoji} ` : ""
  return `${emoji}${escName(wf)}`
}

function pickRunDetail(r: RunRow): string {
  // Prefer the LLM-generated summary, then any structured output hints
  // (PR url, test counts), then the error message for failures.
  if (r.summary && r.summary.trim().length > 0) {
    // Trim to a single line, max ~80 chars — Telegram message length matters.
    const oneLine = r.summary.replace(/\s+/g, " ").trim()
    return oneLine.length > 80 ? oneLine.slice(0, 77) + "…" : oneLine
  }
  const out = r.output || {}
  const pr = (out as any).pr_url || (out as any).pr || null
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

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const since = new Date(Date.now() - 24 * 3600_000).toISOString()

  // PostgREST equivalent of:
  //   SELECT wr.*, w.name AS workflow_name, w.emoji
  //   FROM workflow_runs wr JOIN workflows w ON wr.workflow_id = w.id
  //   WHERE wr.started_at >= NOW() - INTERVAL '24 hours'
  //   ORDER BY wr.started_at DESC LIMIT 50;
  // We coalesce on created_at for runs that never started (queued and orphaned)
  // by issuing a second filter on created_at — Supabase doesn't have COALESCE
  // in filter syntax so we settle for started_at and let truly-stuck queued
  // runs fall through if they never moved.
  const { data, error } = await supabase
    .from("workflow_runs")
    .select(
      "id, workflow_id, status, trigger, cost_usd, total_tokens, started_at, finished_at, summary, output, error, workflows ( name, emoji )",
    )
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(50)

  if (error) {
    console.error("[morning-digest] supabase error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const runs = (data || []) as unknown as RunRow[]

  if (runs.length === 0) {
    const quiet = "🌅 Quiet night — nothing to report."
    const sent = await sendTelegram(quiet, { parseMode: "Markdown" })
    return NextResponse.json({
      ok: true,
      runs_summarized: 0,
      by_status: {},
      total_spend_usd: 0,
      telegram_sent: !!sent,
    })
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
      case "succeeded":
        buckets.shipped.push(r)
        break
      case "paused":
        buckets.awaiting.push(r)
        break
      case "failed":
      case "aborted":
      case "budget_exceeded":
        buckets.failed.push(r)
        break
      case "queued":
      case "running":
        buckets.running.push(r)
        break
      default:
        // Unknown status — file it under "still running" so it's visible.
        buckets.running.push(r)
    }
  }

  const cap = Number(process.env.WORKFLOW_DAILY_BUDGET_USD || 20)
  const lines: string[] = []
  lines.push("🌅 *Morning, Dylan*")
  lines.push("")
  lines.push("_Last 24h of Jarvis runs:_")
  lines.push("")

  const renderBucket = (header: string, rows: RunRow[]) => {
    if (rows.length === 0) return
    lines.push(`${header} (${rows.length})*`)
    // The header passed in already opens the * for bold; close it on the count.
    // (Markdown legacy: *bold*. Header arg ends just before the count number.)
    for (const r of rows.slice(0, 10)) {
      const label = pickRunLabel(r)
      const detail = pickRunDetail(r)
      const cost = Number(r.cost_usd ?? 0)
      const costStr = cost > 0 ? ` — ${fmtUsd(cost)}` : ""
      const detailStr = detail ? ` ${detail}` : ""
      lines.push(`• ${label}${detailStr}${costStr}`)
    }
    if (rows.length > 10) {
      lines.push(`• …and ${rows.length - 10} more`)
    }
    lines.push("")
  }

  renderBucket("✅ *Shipped", buckets.shipped)
  renderBucket("⏸️ *Awaiting your review", buckets.awaiting)
  renderBucket("❌ *Failed", buckets.failed)
  renderBucket("🟡 *Still running", buckets.running)

  lines.push(`_Total spend: ${fmtUsd(totalSpend)} of ${fmtUsd(cap)} cap_`)
  lines.push(`_Tap a run name in /agency/runs to see details._`)

  const message = lines.join("\n")
  const sent = await sendTelegram(message, { parseMode: "Markdown" })

  return NextResponse.json({
    ok: true,
    runs_summarized: runs.length,
    by_status: {
      shipped: buckets.shipped.length,
      awaiting: buckets.awaiting.length,
      failed: buckets.failed.length,
      running: buckets.running.length,
    },
    total_spend_usd: Number(totalSpend.toFixed(4)),
    daily_cap_usd: cap,
    telegram_sent: !!sent,
  })
}
