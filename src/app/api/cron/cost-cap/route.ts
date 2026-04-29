// Hourly cost-cap watchdog.
//
// Sums today's Anthropic spend across `workflow_runs.cost_usd`. When the
// total crosses the configured daily cap we:
//   1. Flip every running/queued run to status='paused' (with error="cost_cap: ...")
//   2. Fire a single Telegram alert via dispatchNotification('budget_exceeded', …)
//   3. Stamp `system_settings.cost_cap.last_capped_date` so we don't pause-spam
//      every hour for the rest of the day. The next UTC day naturally re-arms
//      the trigger.
//
// Idempotency: gated on `last_capped_date === todayUtcDate`. If we've already
// capped today the cron is a no-op aside from emitting current spend in the
// JSON response (handy for debugging). If new runs somehow leak past the
// pause (race between schedule tick and this cron) the next hour catches them.
//
// Cap source order:
//   1. api_keys row with env_var='DAILY_BUDGET_CAP_USD' (via getSecret)
//   2. process.env.DAILY_BUDGET_CAP_USD
//   3. Default 20.0
//
// Pause mechanism: `workflow_runs` already has `status='paused'` in its CHECK
// constraint and a free-form `error` column. We use both — status flips to
// 'paused', error gets prefixed `cost_cap: …`. No new migration needed; this
// matches how `markRunBudgetExceeded` in cost-guards.ts annotates failures.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"
import { dispatchNotification } from "@/lib/notifications/dispatch"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const DEFAULT_CAP_USD = 20.0
const SETTINGS_KEY = "cost_cap"

function todayUtcMidnightIso(): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

function todayUtcDate(): string {
  // YYYY-MM-DD in UTC, used as the idempotency key inside system_settings.
  return new Date().toISOString().slice(0, 10)
}

async function resolveCap(): Promise<number> {
  // getSecret already checks api_keys then falls back to process.env.
  const raw = await getSecret("DAILY_BUDGET_CAP_USD")
  if (raw) {
    const parsed = parseFloat(raw)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return DEFAULT_CAP_USD
}

async function sumTodaySpend(): Promise<number> {
  // We include 'paused' in the sum so a previously-paused (capped) run still
  // counts toward today's budget — otherwise pausing would erase its spend
  // and we'd un-trip ourselves on the next tick.
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("cost_usd")
    .gte("created_at", todayUtcMidnightIso())
    .in("status", ["running", "succeeded", "failed", "paused", "budget_exceeded"])
  if (error) {
    throw new Error(`sum spend failed: ${error.message}`)
  }
  return (data || []).reduce((acc, r) => acc + (Number(r.cost_usd) || 0), 0)
}

async function readCapState(): Promise<{ last_capped_date?: string } & Record<string, unknown>> {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle()
  return (data?.value as Record<string, unknown>) || {}
}

async function writeCapState(value: Record<string, unknown>): Promise<void> {
  // Upsert by key — system_settings has key as its unique identifier.
  await supabase
    .from("system_settings")
    .upsert(
      { key: SETTINGS_KEY, value, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    )
}

async function pauseRunningRuns(spend: number, cap: number): Promise<number> {
  const { data: running, error: selErr } = await supabase
    .from("workflow_runs")
    .select("id")
    .in("status", ["running", "queued"])
  if (selErr) throw new Error(`select running runs failed: ${selErr.message}`)

  const ids = (running || []).map((r) => r.id as string)
  if (ids.length === 0) return 0

  const reason = `cost_cap: daily spend $${spend.toFixed(2)} >= cap $${cap.toFixed(2)}`
  const { error: updErr } = await supabase
    .from("workflow_runs")
    .update({
      status: "paused",
      error: reason,
      finished_at: new Date().toISOString(),
    })
    .in("id", ids)
  if (updErr) throw new Error(`pause runs failed: ${updErr.message}`)

  return ids.length
}

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    const cap = await resolveCap()
    const spend = await sumTodaySpend()

    if (spend < cap) {
      return NextResponse.json({ ok: true, capped: false, spend, cap })
    }

    const state = await readCapState()
    const today = todayUtcDate()

    if (state.last_capped_date === today) {
      // Already capped today — no-op (don't re-pause, don't re-alert).
      return NextResponse.json({
        ok: true,
        capped: true,
        already_capped_today: true,
        spend,
        cap,
      })
    }

    const pausedCount = await pauseRunningRuns(spend, cap)

    // Fire-and-forget alert. Wrapped in try/catch so a Telegram outage can't
    // stop us from stamping `last_capped_date` (which would cause re-pause
    // spam every hour for the rest of the day).
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

    await writeCapState({
      ...state,
      last_capped_date: today,
      last_capped_at: new Date().toISOString(),
      last_spend: spend,
      last_cap: cap,
      last_paused_count: pausedCount,
    })

    return NextResponse.json({
      ok: true,
      capped: true,
      paused: pausedCount,
      spend,
      cap,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
