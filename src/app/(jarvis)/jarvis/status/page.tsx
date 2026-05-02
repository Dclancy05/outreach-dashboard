"use client"

/**
 * /jarvis/status — system status surface for the whole outreach OS.
 *
 * Polls /api/jarvis/system-status every 10s and renders six sections:
 *  - VPS metrics (load, memory, uptime)
 *  - Services (memory-vault-api, terminal-server, recording, openclaw)
 *  - MCPs (each row from mcp_servers with health timestamp)
 *  - Crons (15 vercel-managed jobs with last-run inferred from notifications)
 *  - Database (row counts on critical tables)
 *  - Recent deploys (last 5 commits to main with click-through to GitHub)
 *
 * Design: warm-dark (mem-bg / mem-surface-1/2/3) with violet accent on links.
 * Status dots use the standard mem-status-* tokens for consistency with mcps.
 */

import { useEffect, useMemo, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import {
  Activity,
  Database,
  GitCommit,
  Plug,
  RefreshCw,
  Server,
  Timer,
} from "lucide-react"
import { enterJarvis } from "@/components/jarvis/motion/presets"
import { cn } from "@/lib/utils"

type ServiceStatus = {
  name: string
  status: "up" | "down" | "auth_required" | "remote_only"
  latency_ms: number | null
  code: number | null
}

type CronInfo = {
  path: string
  schedule: string
  label: string
  last_run_at: string | null
}

type McpRow = {
  id: string
  name: string
  kind: string | null
  status: string | null
  last_health_at: string | null
  last_health_ok: boolean | null
}

type DeployRow = {
  sha: string
  message: string
  date: string
  url: string
}

type SystemStatus = {
  timestamp: string
  vps: {
    memory: { used_pct: number; total_gb: number; avail_gb: number }
    load: { one: number; five: number; fifteen: number; cpu_count: number; load_pct: number }
    uptime_seconds: number
    hostname: string
    platform: string
  } | null
  services: ServiceStatus[]
  db: { table: string; count: number | null; error: string | null }[]
  mcps: McpRow[]
  deploys: DeployRow[]
  crons: CronInfo[]
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "never"
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  if (diff < 0) return "scheduled"
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function fmtCount(n: number | null): string {
  if (n === null) return "—"
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function StatusDot({ tone }: { tone: "up" | "down" | "warn" | "idle" }) {
  const cls =
    tone === "up"
      ? "bg-mem-status-working shadow-[0_0_8px_rgba(52,211,153,0.6)]"
      : tone === "down"
      ? "bg-mem-status-stuck shadow-[0_0_8px_rgba(248,113,113,0.6)]"
      : tone === "warn"
      ? "bg-mem-status-thinking shadow-[0_0_8px_rgba(251,191,36,0.6)]"
      : "bg-mem-status-idle"
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full", cls)} />
}

function StatBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-mem-surface-3">
      <motion.div
        className={cn("h-full rounded-full", color || "bg-mem-accent")}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      />
    </div>
  )
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
  delay = 0,
  reduced,
}: {
  icon: typeof Server
  title: string
  subtitle?: string
  children: React.ReactNode
  delay?: number
  reduced: boolean
}) {
  return (
    <motion.section
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay, ease: [0.32, 0.72, 0, 1] }}
      className="rounded-xl border border-mem-border bg-mem-surface-1 overflow-hidden"
    >
      <header className="flex items-center gap-2 border-b border-mem-border bg-mem-surface-2 px-5 py-3">
        <Icon className="h-4 w-4 text-mem-text-secondary" />
        <h2 className="text-sm font-medium text-mem-text-primary">{title}</h2>
        {subtitle ? <span className="ml-auto font-mono text-xs text-mem-text-muted">{subtitle}</span> : null}
      </header>
      <div className="p-5">{children}</div>
    </motion.section>
  )
}

export default function JarvisStatusPage() {
  const reduced = useReducedMotion() ?? false
  const [data, setData] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<number | null>(null)

  async function refresh() {
    try {
      const res = await fetch("/api/jarvis/system-status", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as SystemStatus
      setData(json)
      setError(null)
      setLastFetched(Date.now())
    } catch (e: any) {
      setError(e?.message || "fetch failed")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 10_000)
    return () => clearInterval(id)
  }, [])

  const overallHealth = useMemo(() => {
    if (!data) return "idle" as const
    const downServices = data.services.filter((s) => s.status === "down").length
    const downMcps = data.mcps.filter((m) => m.last_health_ok === false).length
    if (downServices > 0) return "down" as const
    if (downMcps > 0) return "warn" as const
    return "up" as const
  }, [data])

  return (
    <motion.div {...enterJarvis} className="mx-auto w-full max-w-[1280px]">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">SYSTEM STATUS</p>
          <h1 className="text-2xl font-medium text-mem-text-primary">Operations Overview</h1>
          <p className="mt-1 text-sm text-mem-text-secondary">
            VPS · services · crons · database · MCPs · recent deploys.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-mem-border bg-mem-surface-1 px-3 py-2">
          <StatusDot tone={overallHealth === "idle" ? "idle" : overallHealth} />
          <span className="text-xs font-medium text-mem-text-secondary">
            {overallHealth === "up" ? "All systems nominal" : overallHealth === "warn" ? "Degraded MCPs" : overallHealth === "down" ? "One or more services down" : "Loading…"}
          </span>
          <button
            onClick={refresh}
            className="ml-2 inline-flex items-center gap-1 rounded-md border border-mem-border bg-mem-surface-2 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-mem-text-secondary transition hover:bg-mem-surface-3 hover:text-mem-text-primary"
            disabled={loading}
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            {lastFetched ? `${fmtRelative(new Date(lastFetched).toISOString())}` : "now"}
          </button>
        </div>
      </header>

      {error && !data ? (
        <div className="rounded-xl border border-mem-status-stuck/40 bg-mem-status-stuck/10 p-4 text-sm text-mem-text-primary">
          Failed to load status — {error}. Retrying every 10s.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* VPS */}
        <Section icon={Server} title="VPS Metrics" subtitle={data?.vps?.hostname || "—"} delay={0.04} reduced={reduced}>
          {data?.vps ? (
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-xs text-mem-text-secondary">Memory</span>
                  <span className="font-mono text-xs text-mem-text-muted">
                    {(data.vps.memory.total_gb - data.vps.memory.avail_gb).toFixed(1)} / {data.vps.memory.total_gb} GB · {data.vps.memory.used_pct}%
                  </span>
                </div>
                <StatBar
                  pct={data.vps.memory.used_pct}
                  color={data.vps.memory.used_pct > 85 ? "bg-mem-status-stuck" : data.vps.memory.used_pct > 70 ? "bg-mem-status-thinking" : "bg-mem-accent"}
                />
              </div>

              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-xs text-mem-text-secondary">Load (1m / 5m / 15m)</span>
                  <span className="font-mono text-xs text-mem-text-muted">
                    {data.vps.load.one} / {data.vps.load.five} / {data.vps.load.fifteen} · {data.vps.load.cpu_count} cpu · {data.vps.load.load_pct}%
                  </span>
                </div>
                <StatBar
                  pct={data.vps.load.load_pct}
                  color={data.vps.load.load_pct > 85 ? "bg-mem-status-stuck" : data.vps.load.load_pct > 60 ? "bg-mem-status-thinking" : "bg-mem-status-working"}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-mem-text-muted">Uptime</p>
                  <p className="text-sm text-mem-text-primary">{fmtUptime(data.vps.uptime_seconds)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-mem-text-muted">Kernel</p>
                  <p className="font-mono text-xs text-mem-text-secondary">{data.vps.platform}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-mem-text-muted">VPS metrics unavailable — server-only file reads failed.</div>
          )}
        </Section>

        {/* Services */}
        <Section icon={Plug} title="Services" subtitle={`${data?.services.filter((s) => s.status === "up").length ?? 0}/${data?.services.filter((s) => s.status !== "remote_only").length ?? 0} up`} delay={0.08} reduced={reduced}>
          {data?.services.length ? (
            <ul className="space-y-2">
              {data.services.map((s) => (
                <li
                  key={s.name}
                  className="flex items-center justify-between rounded-lg border border-mem-border bg-mem-surface-2 px-3 py-2 transition hover:bg-mem-surface-3"
                >
                  <div className="flex items-center gap-3">
                    <StatusDot tone={s.status === "up" ? "up" : s.status === "auth_required" || s.status === "remote_only" ? "idle" : "down"} />
                    <span className="text-sm text-mem-text-primary">{s.name}</span>
                  </div>
                  <span className="font-mono text-xs text-mem-text-muted">
                    {s.status === "remote_only"
                      ? "VPS-only"
                      : (s.code ? `${s.code}` : "—") + (s.latency_ms !== null ? ` · ${s.latency_ms}ms` : "")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-mem-text-muted">Loading…</div>
          )}
        </Section>

        {/* MCPs */}
        <Section icon={Activity} title="MCP Servers" subtitle={`${data?.mcps.length ?? 0} configured`} delay={0.12} reduced={reduced}>
          {data?.mcps.length ? (
            <ul className="space-y-2">
              {data.mcps.map((m) => {
                const healthy = m.last_health_ok === true
                const failing = m.last_health_ok === false
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-mem-border bg-mem-surface-2 px-3 py-2 transition hover:bg-mem-surface-3"
                  >
                    <div className="flex items-center gap-3">
                      <StatusDot tone={healthy ? "up" : failing ? "down" : "idle"} />
                      <div>
                        <p className="text-sm text-mem-text-primary">{m.name}</p>
                        <p className="font-mono text-[10px] text-mem-text-muted">{m.kind || "remote"}</p>
                      </div>
                    </div>
                    <span className="font-mono text-xs text-mem-text-muted">{fmtRelative(m.last_health_at)}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-mem-text-muted">No MCP servers configured. Add one at <a className="text-mem-accent underline-offset-2 hover:underline" href="/jarvis/mcps">/jarvis/mcps</a>.</p>
          )}
        </Section>

        {/* Database */}
        <Section icon={Database} title="Database" subtitle="row counts" delay={0.16} reduced={reduced}>
          <ul className="grid grid-cols-2 gap-2">
            {(data?.db ?? []).map((row) => (
              <li
                key={row.table}
                className="flex items-baseline justify-between rounded-md border border-mem-border bg-mem-surface-2 px-3 py-2"
              >
                <span className="font-mono text-xs text-mem-text-secondary">{row.table}</span>
                <span
                  className={cn(
                    "font-mono text-sm",
                    row.error ? "text-mem-text-muted" : "text-mem-text-primary",
                  )}
                  title={row.error || ""}
                >
                  {fmtCount(row.count)}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Crons (full width row) */}
        <div className="lg:col-span-2">
          <Section icon={Timer} title="Cron Jobs" subtitle={`${data?.crons.length ?? 0} scheduled`} delay={0.20} reduced={reduced}>
            <div className="overflow-hidden rounded-lg border border-mem-border">
              <table className="w-full text-sm">
                <thead className="bg-mem-surface-2 text-left font-mono text-[10px] uppercase tracking-wider text-mem-text-muted">
                  <tr>
                    <th className="px-3 py-2">Job</th>
                    <th className="px-3 py-2">Schedule</th>
                    <th className="px-3 py-2">Last Run</th>
                    <th className="px-3 py-2">Path</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.crons ?? []).map((c, i) => (
                    <tr
                      key={c.path}
                      className={cn(
                        "border-t border-mem-border transition hover:bg-mem-surface-2",
                        i % 2 === 1 ? "bg-mem-surface-1" : "bg-transparent",
                      )}
                    >
                      <td className="px-3 py-2 text-mem-text-primary">{c.label}</td>
                      <td className="px-3 py-2 font-mono text-xs text-mem-text-secondary">{c.schedule}</td>
                      <td className="px-3 py-2 text-mem-text-muted">{fmtRelative(c.last_run_at)}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-mem-text-muted">{c.path}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 font-mono text-[10px] text-mem-text-muted">
              Last-run timestamps are inferred from notifications labelled <span className="text-mem-text-secondary">cron_*</span>.
              Crons that don't write notifications will show as "never" even if they ran.
            </p>
          </Section>
        </div>

        {/* Recent deploys (full width row) */}
        <div className="lg:col-span-2">
          <Section icon={GitCommit} title="Recent Deploys" subtitle="main branch · last 5" delay={0.24} reduced={reduced}>
            {data?.deploys.length ? (
              <ul className="space-y-2">
                {data.deploys.map((d) => (
                  <li
                    key={d.sha}
                    className="flex items-start gap-3 rounded-md border border-mem-border bg-mem-surface-2 p-3"
                  >
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-mem-accent underline-offset-2 hover:underline"
                    >
                      {d.sha}
                    </a>
                    <div className="flex-1">
                      <p className="text-sm text-mem-text-primary">{d.message}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-mem-text-muted">{fmtRelative(d.date)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-mem-text-muted">No recent commits — GitHub API rate-limited or unavailable.</p>
            )}
          </Section>
        </div>
      </div>
    </motion.div>
  )
}
