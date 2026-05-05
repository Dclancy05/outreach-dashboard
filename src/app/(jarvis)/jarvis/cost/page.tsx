"use client"

/**
 * /jarvis/cost — usage + cost dashboard.
 *
 * Two audiences:
 *   • Subscription users (default): top section shows Claude subscription
 *     reality — usage caps live at claude.ai, this page can't see them.
 *     Below, we surface activity Jarvis DOES track locally: terminal
 *     sessions, agent runs, audit events.
 *   • API/SDK users: bottom section is the legacy spend dashboard
 *     (workflow_runs.cost_usd) — only meaningful if you've actually
 *     pointed an ANTHROPIC_API_KEY at workflows. For pure-subscription
 *     setups this stays $0 and that's expected.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { Activity, AlertTriangle, BarChart3, ExternalLink, Info, RefreshCw, Sparkles, TerminalSquare, TrendingUp, Zap } from "lucide-react"
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

interface UsageSnapshot {
  terminalsActive: number
  terminalsCap: number
  agentRunsRecent: number
  totalAuditEvents: number
}

export default function JarvisCostPage() {
  const reduced = useReducedMotion() ?? false
  const [data, setData] = useState<Summary | null>(null)
  const [usage, setUsage] = useState<UsageSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    try {
      // Fetch in parallel: API spend + local usage signals
      const [costRes, termRes, runsRes, auditRes] = await Promise.all([
        fetch("/api/jarvis/cost-summary", { cache: "no-store" }),
        fetch("/api/terminals", { cache: "no-store" }).catch(() => null),
        fetch("/api/runs?limit=200", { cache: "no-store" }).catch(() => null),
        fetch("/api/jarvis/audit-log?limit=1", { cache: "no-store" }).catch(() => null),
      ])
      if (!costRes.ok) throw new Error(`HTTP ${costRes.status}`)
      const json = (await costRes.json()) as Summary
      setData(json)

      const term = termRes && termRes.ok ? await termRes.json() : null
      const runs = runsRes && runsRes.ok ? await runsRes.json() : null
      const audit = auditRes && auditRes.ok ? await auditRes.json() : null
      // last-7-day window for agent runs
      const sevenDaysAgo = Date.now() - 7 * 86400_000
      const recentRuns = (runs?.runs || []).filter((r: { started_at?: string; created_at?: string }) => {
        const ts = r.started_at || r.created_at
        return ts && new Date(ts).getTime() >= sevenDaysAgo
      }).length
      // Audit-log API returns { rows, facets: { actions: [{name, count}] } }
      // Sum facet counts to get the total events tracked.
      const auditTotal = Array.isArray(audit?.facets?.actions)
        ? audit.facets.actions.reduce((sum: number, a: { count?: number }) => sum + (a.count || 0), 0)
        : 0
      setUsage({
        terminalsActive: term?.capacity?.active ?? term?.sessions?.length ?? 0,
        terminalsCap: term?.capacity?.soft_max ?? 8,
        agentRunsRecent: recentRuns,
        totalAuditEvents: auditTotal,
      })
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "fetch failed")
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
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">USAGE & COST</p>
          <h1 className="text-2xl font-medium text-mem-text-primary">Usage Dashboard</h1>
          <p className="mt-1 text-sm text-mem-text-secondary">
            What Jarvis is doing for you, plus any API spend if you point a paid key at workflows.
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

      {/* Subscription banner — explains why $ stays at zero for Max users */}
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-mem-accent/30 bg-mem-accent/5 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-mem-accent" />
        <div className="flex-1 text-sm text-mem-text-primary">
          <p className="font-medium">You&apos;re on a Claude subscription.</p>
          <p className="mt-1 text-mem-text-secondary">
            Jarvis runs Claude through your <span className="text-mem-text-primary">Claude Max</span> login (no API
            key, no per-token billing). The numbers below stay at <span className="font-mono text-mem-text-primary">$0</span>{" "}
            unless you wire an <span className="font-mono">ANTHROPIC_API_KEY</span> into the workflow runner.
            Subscription <span className="text-mem-text-primary">usage limits and reset timers</span> live on Claude&apos;s
            side —{" "}
            <a
              href="https://claude.ai/settings/usage"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-mem-accent underline-offset-2 hover:underline"
            >
              check claude.ai/settings/usage <ExternalLink className="h-3 w-3" />
            </a>
            .
          </p>
        </div>
      </div>

      {/* Local usage Jarvis CAN see */}
      {usage ? (
        <section className="mb-6 rounded-xl border border-mem-border bg-mem-surface-1 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">
            <Activity className="h-3.5 w-3.5" /> What Jarvis tracks locally
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Link
              href="/jarvis/terminals"
              className="rounded-lg border border-mem-border bg-mem-surface-2 p-3 transition hover:border-mem-accent/40 hover:bg-mem-surface-3"
            >
              <div className="flex items-center gap-1.5 text-mem-text-muted">
                <TerminalSquare className="h-3.5 w-3.5" />
                <span className="font-mono text-[10px] uppercase tracking-wider">Active terminals</span>
              </div>
              <div className="mt-1 text-2xl font-medium text-mem-text-primary">
                {usage.terminalsActive}
                <span className="ml-1 text-sm font-normal text-mem-text-muted">/ {usage.terminalsCap} cap</span>
              </div>
              <div className="mt-0.5 text-xs text-mem-text-secondary">Persistent VPS sessions running now</div>
            </Link>
            <Link
              href="/jarvis/agents?tab=runs"
              className="rounded-lg border border-mem-border bg-mem-surface-2 p-3 transition hover:border-mem-accent/40 hover:bg-mem-surface-3"
            >
              <div className="flex items-center gap-1.5 text-mem-text-muted">
                <Sparkles className="h-3.5 w-3.5" />
                <span className="font-mono text-[10px] uppercase tracking-wider">Agent runs (7d)</span>
              </div>
              <div className="mt-1 text-2xl font-medium text-mem-text-primary">{usage.agentRunsRecent}</div>
              <div className="mt-0.5 text-xs text-mem-text-secondary">Workflow + scheduled agent runs</div>
            </Link>
            <Link
              href="/jarvis/audit"
              className="rounded-lg border border-mem-border bg-mem-surface-2 p-3 transition hover:border-mem-accent/40 hover:bg-mem-surface-3"
            >
              <div className="flex items-center gap-1.5 text-mem-text-muted">
                <Activity className="h-3.5 w-3.5" />
                <span className="font-mono text-[10px] uppercase tracking-wider">Audit events</span>
              </div>
              <div className="mt-1 text-2xl font-medium text-mem-text-primary">{usage.totalAuditEvents}</div>
              <div className="mt-0.5 text-xs text-mem-text-secondary">Every change Jarvis has logged</div>
            </Link>
          </div>
        </section>
      ) : null}

      {error && !data ? (
        <div className="rounded-xl border border-mem-status-stuck/40 bg-mem-status-stuck/10 p-4 text-sm text-mem-text-primary">
          Failed to load — {error}
        </div>
      ) : null}

      {data ? (
        <>
          <h2 className="mb-3 mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">
            API spend (only billed when ANTHROPIC_API_KEY is set)
          </h2>
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
