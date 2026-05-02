"use client"

/**
 * /jarvis/cost — token spend dashboard.
 *
 * Aggregates from workflow_runs.cost_usd over the last 30 days. Headline
 * shows today's spend vs daily cap, plus 30-day total / avg / total tokens.
 * Body shows a 30-day spark area chart, top agents, and top workflows.
 */

import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Activity, AlertTriangle, BarChart3, RefreshCw, Sparkles, TrendingUp, Zap } from "lucide-react"
import { enterJarvis } from "@/components/jarvis/motion/presets"
import { cn } from "@/lib/utils"

type Summary = {
  today: { date: string; cost_usd: number; runs: number; tokens_in: number; tokens_out: number }
  cap: { daily_cap_usd: number; pct_used: number; capped_today: boolean; last_capped_date: string | null }
  last_30_days: { cost_usd: number; runs: number; tokens_in: number; tokens_out: number; avg_daily: number }
  daily_spend: { date: string; cost_usd: number; runs: number; tokens_in: number; tokens_out: number }[]
  top_agents: { id: string; name: string; cost_usd: number; runs: number }[]
  top_workflows: { id: string; name: string; cost_usd: number; runs: number }[]
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

function fmtTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${d.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Activity
  label: string
  value: string
  hint?: string
  tone?: "default" | "warn" | "danger" | "ok"
}) {
  const ring =
    tone === "danger"
      ? "ring-mem-status-stuck/40"
      : tone === "warn"
      ? "ring-mem-status-thinking/40"
      : tone === "ok"
      ? "ring-mem-status-working/40"
      : "ring-transparent"
  return (
    <div className={cn("rounded-xl border border-mem-border bg-mem-surface-1 p-4 ring-1", ring)}>
      <div className="flex items-center gap-2 text-mem-text-muted">
        <Icon className="h-3.5 w-3.5" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-medium text-mem-text-primary">{value}</div>
      {hint ? <div className="mt-1 text-xs text-mem-text-secondary">{hint}</div> : null}
    </div>
  )
}

function SparkArea({ data, height = 100 }: { data: { date: string; cost_usd: number }[]; height?: number }) {
  if (!data.length) return null
  const max = Math.max(0.01, ...data.map((d) => d.cost_usd))
  const w = 100 // viewBox width — we use preserveAspectRatio="none" to stretch
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * w
    const y = height - (d.cost_usd / max) * (height - 8) - 4
    return [x, y] as const
  })
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
  const area = `${path} L ${w},${height} L 0,${height} Z`
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className="block"
    >
      <defs>
        <linearGradient id="cost-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(124,92,255)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="rgb(124,92,255)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#cost-fill)" />
      <path d={path} stroke="rgb(124,92,255)" strokeWidth="1.4" fill="none" />
    </svg>
  )
}

function TopList({
  title,
  items,
  emptyHint,
}: {
  title: string
  items: { id: string; name: string; cost_usd: number; runs: number }[]
  emptyHint: string
}) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-mem-border bg-mem-surface-1 p-5">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">{title}</h3>
        <p className="mt-3 text-sm text-mem-text-muted">{emptyHint}</p>
      </div>
    )
  }
  const max = Math.max(...items.map((i) => i.cost_usd), 0.01)
  return (
    <div className="rounded-xl border border-mem-border bg-mem-surface-1 p-5">
      <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">{title}</h3>
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.id}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-mem-text-primary" title={it.name}>
                {it.name}
              </span>
              <span className="shrink-0 font-mono text-xs text-mem-text-secondary">
                {fmtUsd(it.cost_usd)} <span className="text-mem-text-muted">· {it.runs} run{it.runs === 1 ? "" : "s"}</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-mem-surface-3">
              <div
                className="h-full rounded-full bg-mem-accent"
                style={{ width: `${(it.cost_usd / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function JarvisCostPage() {
  const reduced = useReducedMotion() ?? false
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    try {
      const res = await fetch("/api/jarvis/cost-summary", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as Summary
      setData(json)
      setError(null)
    } catch (e: any) {
      setError(e?.message || "fetch failed")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <motion.div {...enterJarvis} className="mx-auto w-full max-w-[1280px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">SPEND</p>
          <h1 className="text-2xl font-medium text-mem-text-primary">Cost Dashboard</h1>
          <p className="mt-1 text-sm text-mem-text-secondary">
            AI workflow spend across the last 30 days. Auto-paused at the daily cap.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-mem-border bg-mem-surface-1 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-mem-text-secondary transition hover:bg-mem-surface-2 hover:text-mem-text-primary"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          Refresh
        </button>
      </header>

      {error && !data ? (
        <div className="rounded-xl border border-mem-status-stuck/40 bg-mem-status-stuck/10 p-4 text-sm text-mem-text-primary">
          Failed to load — {error}
        </div>
      ) : null}

      {data ? (
        <>
          {/* Headline metrics */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={Zap}
              label="Spend Today"
              value={fmtUsd(data.today.cost_usd)}
              hint={`${data.today.runs} run${data.today.runs === 1 ? "" : "s"}`}
              tone={
                data.cap.capped_today
                  ? "danger"
                  : data.cap.pct_used > 80
                  ? "warn"
                  : data.today.cost_usd > 0
                  ? "ok"
                  : "default"
              }
            />
            <MetricCard
              icon={AlertTriangle}
              label="Daily Cap"
              value={fmtUsd(data.cap.daily_cap_usd)}
              hint={
                data.cap.capped_today
                  ? "🛑 Capped — runs paused"
                  : `${data.cap.pct_used}% used today`
              }
              tone={data.cap.capped_today ? "danger" : data.cap.pct_used > 80 ? "warn" : "default"}
            />
            <MetricCard
              icon={TrendingUp}
              label="30d Total"
              value={fmtUsd(data.last_30_days.cost_usd)}
              hint={`avg ${fmtUsd(data.last_30_days.avg_daily)}/day · ${data.last_30_days.runs} runs`}
            />
            <MetricCard
              icon={Sparkles}
              label="30d Tokens"
              value={fmtTokens(data.last_30_days.tokens_in + data.last_30_days.tokens_out)}
              hint={`in ${fmtTokens(data.last_30_days.tokens_in)} · out ${fmtTokens(data.last_30_days.tokens_out)}`}
            />
          </div>

          {/* Cap progress bar */}
          <div className="mt-4 rounded-xl border border-mem-border bg-mem-surface-1 p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">
                Today vs Cap
              </span>
              <span className="font-mono text-xs text-mem-text-secondary">
                {fmtUsd(data.today.cost_usd)} / {fmtUsd(data.cap.daily_cap_usd)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-mem-surface-3">
              <motion.div
                initial={reduced ? false : { width: 0 }}
                animate={{ width: `${data.cap.pct_used}%` }}
                transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
                className={cn(
                  "h-full rounded-full",
                  data.cap.capped_today
                    ? "bg-mem-status-stuck"
                    : data.cap.pct_used > 80
                    ? "bg-mem-status-thinking"
                    : "bg-mem-accent",
                )}
              />
            </div>
            {data.cap.capped_today ? (
              <p className="mt-2 text-xs text-mem-status-stuck">
                ⚠️ Daily cap reached. Running and queued workflows are paused until 00:00 UTC tomorrow.
              </p>
            ) : null}
          </div>

          {/* Spark + breakdowns */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-mem-border bg-mem-surface-1 p-5 lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-medium text-mem-text-primary">
                  <BarChart3 className="h-4 w-4 text-mem-text-muted" /> 30-day spend
                </h3>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">
                  cost · {fmtDay(data.daily_spend[0]?.date || "")} → {fmtDay(data.daily_spend[data.daily_spend.length - 1]?.date || "")}
                </span>
              </div>
              <SparkArea data={data.daily_spend} height={120} />
              <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-mem-text-muted">
                <span>min {fmtUsd(Math.min(...data.daily_spend.map((d) => d.cost_usd)))}</span>
                <span>max {fmtUsd(Math.max(...data.daily_spend.map((d) => d.cost_usd)))}</span>
              </div>
            </div>

            <TopList
              title="Top Agents (30d)"
              items={data.top_agents}
              emptyHint="No agent runs in the last 30 days. Spawn one in /jarvis/agents."
            />
          </div>

          <div className="mt-4">
            <TopList
              title="Top Workflows (30d)"
              items={data.top_workflows}
              emptyHint="No workflow runs yet. Build one in /jarvis/workflows."
            />
          </div>

          <p className="mt-4 font-mono text-[10px] text-mem-text-muted">
            Spend is tracked at run-completion via{" "}
            <span className="text-mem-text-secondary">workflow_runs.cost_usd</span>. The cap is enforced by the{" "}
            <span className="text-mem-text-secondary">/api/cron/cost-cap</span> hourly cron, which pauses queued
            and running workflows when today's total crosses the threshold.
          </p>
        </>
      ) : null}
    </motion.div>
  )
}
