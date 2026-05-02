import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const DEFAULT_CAP_USD = 20.0

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET() {
  const today = new Date()
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 86400_000)

  // Daily AI spend over last 30 days from workflow_runs.cost_usd
  const { data: runs } = await supabase
    .from("workflow_runs")
    .select("cost_usd, started_at, status, agent_id, workflow_id, input_tokens, output_tokens")
    .gte("started_at", thirtyDaysAgo.toISOString())
    .order("started_at", { ascending: true })

  // Bucket by UTC day
  const byDay = new Map<string, { date: string; cost_usd: number; runs: number; tokens_in: number; tokens_out: number }>()
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo.getTime() + i * 86400_000)
    const key = isoDate(d)
    byDay.set(key, { date: key, cost_usd: 0, runs: 0, tokens_in: 0, tokens_out: 0 })
  }
  for (const r of runs || []) {
    if (!r.started_at) continue
    const key = isoDate(new Date(r.started_at))
    const slot = byDay.get(key)
    if (!slot) continue
    slot.cost_usd += Number(r.cost_usd) || 0
    slot.runs += 1
    slot.tokens_in += Number(r.input_tokens) || 0
    slot.tokens_out += Number(r.output_tokens) || 0
  }

  // Today subset for the headline number
  const todayKey = isoDate(todayStart)
  const todaySlot = byDay.get(todayKey) || { date: todayKey, cost_usd: 0, runs: 0, tokens_in: 0, tokens_out: 0 }

  // Cost cap from same source as cost-cap cron
  let dailyCapUsd = DEFAULT_CAP_USD
  try {
    const fromKey = await getSecret("DAILY_BUDGET_CAP_USD")
    const fromEnv = process.env.DAILY_BUDGET_CAP_USD
    const raw = fromKey || fromEnv || ""
    const parsed = Number(raw)
    if (!Number.isNaN(parsed) && parsed > 0) dailyCapUsd = parsed
  } catch {}

  // Cap state from system_settings
  const { data: capRow } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "cost_cap")
    .maybeSingle()
  const capState = capRow?.value || {}

  // Top agents by total spend (last 30 days)
  const byAgent = new Map<string, { id: string; cost_usd: number; runs: number }>()
  for (const r of runs || []) {
    if (!r.agent_id) continue
    const key = String(r.agent_id)
    const existing = byAgent.get(key) || { id: key, cost_usd: 0, runs: 0 }
    existing.cost_usd += Number(r.cost_usd) || 0
    existing.runs += 1
    byAgent.set(key, existing)
  }

  // Resolve agent names
  const agentIds = [...byAgent.keys()].slice(0, 10)
  let agentNames: Record<string, string> = {}
  if (agentIds.length > 0) {
    const { data: agents } = await supabase.from("agents").select("id, name").in("id", agentIds)
    for (const a of agents || []) agentNames[String(a.id)] = a.name
  }
  const topAgents = [...byAgent.values()]
    .sort((a, b) => b.cost_usd - a.cost_usd)
    .slice(0, 6)
    .map((a) => ({
      id: a.id,
      name: agentNames[a.id] || `agent ${a.id.slice(0, 8)}`,
      cost_usd: Math.round(a.cost_usd * 100) / 100,
      runs: a.runs,
    }))

  // Top workflows by spend
  const byWorkflow = new Map<string, { id: string; cost_usd: number; runs: number }>()
  for (const r of runs || []) {
    if (!r.workflow_id) continue
    const key = String(r.workflow_id)
    const existing = byWorkflow.get(key) || { id: key, cost_usd: 0, runs: 0 }
    existing.cost_usd += Number(r.cost_usd) || 0
    existing.runs += 1
    byWorkflow.set(key, existing)
  }
  const wfIds = [...byWorkflow.keys()].slice(0, 10)
  let wfNames: Record<string, string> = {}
  if (wfIds.length > 0) {
    const { data: wfs } = await supabase.from("workflows").select("id, name").in("id", wfIds)
    for (const w of wfs || []) wfNames[String(w.id)] = w.name
  }
  const topWorkflows = [...byWorkflow.values()]
    .sort((a, b) => b.cost_usd - a.cost_usd)
    .slice(0, 6)
    .map((w) => ({
      id: w.id,
      name: wfNames[w.id] || `workflow ${w.id.slice(0, 8)}`,
      cost_usd: Math.round(w.cost_usd * 100) / 100,
      runs: w.runs,
    }))

  // 30-day totals
  const total30 = [...byDay.values()].reduce(
    (acc, s) => ({
      cost_usd: acc.cost_usd + s.cost_usd,
      runs: acc.runs + s.runs,
      tokens_in: acc.tokens_in + s.tokens_in,
      tokens_out: acc.tokens_out + s.tokens_out,
    }),
    { cost_usd: 0, runs: 0, tokens_in: 0, tokens_out: 0 },
  )

  return NextResponse.json({
    today: {
      date: todayKey,
      cost_usd: Math.round(todaySlot.cost_usd * 100) / 100,
      runs: todaySlot.runs,
      tokens_in: todaySlot.tokens_in,
      tokens_out: todaySlot.tokens_out,
    },
    cap: {
      daily_cap_usd: dailyCapUsd,
      pct_used: dailyCapUsd > 0 ? Math.min(100, Math.round((todaySlot.cost_usd / dailyCapUsd) * 100)) : 0,
      capped_today: capState.last_capped_date === todayKey,
      last_capped_date: capState.last_capped_date || null,
    },
    last_30_days: {
      cost_usd: Math.round(total30.cost_usd * 100) / 100,
      runs: total30.runs,
      tokens_in: total30.tokens_in,
      tokens_out: total30.tokens_out,
      avg_daily: Math.round((total30.cost_usd / 30) * 100) / 100,
    },
    daily_spend: [...byDay.values()].map((s) => ({
      ...s,
      cost_usd: Math.round(s.cost_usd * 100) / 100,
    })),
    top_agents: topAgents,
    top_workflows: topWorkflows,
  })
}
