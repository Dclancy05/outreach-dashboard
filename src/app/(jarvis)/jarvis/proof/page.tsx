"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Clock3, FileJson, MonitorPlay, RefreshCw, ShieldCheck, XCircle } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { enterJarvis } from "@/components/jarvis/motion/presets"
import { cn } from "@/lib/utils"

type ProofStatus = "pass" | "fail" | "stale" | "missing"

type ProofCheck = {
  scenario: string
  label: string
  command: string
  staleAfterHours: number
  proof: {
    scenario: string
    status: ProofStatus
    started_at: string | null
    age_hours: number | null
    output_dir: string | null
    report_html: string | null
    video: string | null
    screenshots_count: number
    summary: {
      errors: number
      responses_5xx: number
      responses_429: number
      goto_calls: number
      login_status_calls: number
      tabs_created: number
    }
    lag: {
      median_frame_interval_ms?: number
      p95_frame_interval_ms?: number
      freeze_windows?: number
    } | null
    error_samples: string[]
    issue: string | null
  }
}

type ProofResponse = {
  checked_at: string
  summary: {
    pass: number
    failed: number
    missing: number
    stale: number
    total: number
    trusted: boolean
  }
  checks: ProofCheck[]
}

function statusMeta(status: ProofStatus) {
  if (status === "pass") {
    return {
      label: "Trusted",
      tone: "ok",
      icon: CheckCircle2,
      className: "border-mem-status-working/35 bg-mem-status-working/10 text-mem-status-working",
    }
  }
  if (status === "fail") {
    return {
      label: "Failed",
      tone: "danger",
      icon: XCircle,
      className: "border-mem-status-stuck/35 bg-mem-status-stuck/10 text-mem-status-stuck",
    }
  }
  if (status === "stale") {
    return {
      label: "Stale",
      tone: "warn",
      icon: Clock3,
      className: "border-mem-status-thinking/35 bg-mem-status-thinking/10 text-mem-status-thinking",
    }
  }
  return {
    label: "Missing",
    tone: "danger",
    icon: AlertTriangle,
    className: "border-mem-status-stuck/35 bg-mem-status-stuck/10 text-mem-status-stuck",
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "never"
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: "ok" | "warn" | "danger"
}) {
  const color =
    tone === "danger"
      ? "text-mem-status-stuck"
      : tone === "warn"
      ? "text-mem-status-thinking"
      : tone === "ok"
      ? "text-mem-status-working"
      : "text-mem-text-primary"
  return (
    <div className="rounded-lg border border-mem-border bg-mem-surface-2 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-mem-text-muted">{label}</div>
      <div className={cn("mt-1 text-sm font-medium", color)}>{value}</div>
    </div>
  )
}

function ProofCard({ check }: { check: ProofCheck }) {
  const meta = statusMeta(check.proof.status)
  const Icon = meta.icon
  const hasProblems =
    check.proof.summary.errors > 0 ||
    check.proof.summary.responses_5xx > 0 ||
    check.proof.summary.responses_429 > 0

  return (
    <section className="rounded-xl border border-mem-border bg-mem-surface-1 overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-mem-border bg-mem-surface-2 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-mem-text-primary">{check.label}</h2>
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", meta.className)}>
              <Icon className="h-3 w-3" />
              {meta.label}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-mem-text-muted">{check.command}</p>
        </div>
        <div className="text-right text-xs text-mem-text-secondary">
          <div>{fmtDate(check.proof.started_at)}</div>
          <div className="mt-0.5 font-mono text-[10px] text-mem-text-muted">
            {check.proof.age_hours === null ? "no age" : `${check.proof.age_hours}h old`}
          </div>
        </div>
      </header>

      <div className="space-y-4 p-5">
        {check.proof.issue ? (
          <div className="space-y-2 rounded-lg border border-mem-status-thinking/30 bg-mem-status-thinking/10 px-3 py-2 text-sm text-mem-text-secondary">
            <div>{check.proof.issue}</div>
            {check.proof.error_samples.length ? (
              <div className="space-y-1">
                {check.proof.error_samples.map((sample, index) => (
                  <div key={index} className="rounded border border-mem-border/70 bg-mem-surface-1 px-2 py-1 font-mono text-[11px] leading-5 text-mem-text-muted">
                    {sample}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-mem-status-working/30 bg-mem-status-working/10 px-3 py-2 text-sm text-mem-text-secondary">
            No blocking issue found in the latest proof run.
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Errors" value={check.proof.summary.errors} tone={check.proof.summary.errors ? "danger" : "ok"} />
          <Metric label="5xx" value={check.proof.summary.responses_5xx} tone={check.proof.summary.responses_5xx ? "danger" : "ok"} />
          <Metric label="429" value={check.proof.summary.responses_429} tone={check.proof.summary.responses_429 ? "danger" : "ok"} />
          <Metric label="Goto" value={check.proof.summary.goto_calls} tone={check.scenario === "idle-smoke" && check.proof.summary.goto_calls ? "danger" : undefined} />
          <Metric label="Tabs" value={check.proof.summary.tabs_created} />
          <Metric label="Shots" value={check.proof.screenshots_count} tone={check.proof.screenshots_count ? "ok" : "warn"} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {check.proof.report_html ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-mem-border bg-mem-surface-2 px-2.5 py-1 text-xs text-mem-text-secondary">
              <FileJson className="h-3.5 w-3.5" />
              HTML report saved
            </span>
          ) : null}
          {check.proof.video ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-mem-border bg-mem-surface-2 px-2.5 py-1 text-xs text-mem-text-secondary">
              <MonitorPlay className="h-3.5 w-3.5" />
              Video saved
            </span>
          ) : null}
          {check.proof.output_dir ? (
            <span className="min-w-0 truncate rounded-md border border-mem-border bg-mem-surface-2 px-2.5 py-1 font-mono text-[11px] text-mem-text-muted">
              {check.proof.output_dir}
            </span>
          ) : null}
          {hasProblems ? (
            <span className="rounded-md border border-mem-status-stuck/30 bg-mem-status-stuck/10 px-2.5 py-1 text-xs text-mem-status-stuck">
              Do not trust this feature yet
            </span>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export default function JarvisProofPage() {
  const reduced = useReducedMotion() ?? false
  const [data, setData] = useState<ProofResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    try {
      setLoading(true)
      const res = await fetch("/api/jarvis/proof", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData((await res.json()) as ProofResponse)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "proof fetch failed")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const overall = useMemo(() => {
    if (!data) return { label: "Loading", className: "text-mem-text-secondary", icon: Clock3 }
    if (data.summary.trusted) return { label: "Proof gate trusted", className: "text-mem-status-working", icon: ShieldCheck }
    if (data.summary.failed || data.summary.missing) return { label: "Proof gate blocking", className: "text-mem-status-stuck", icon: XCircle }
    return { label: "Proof gate needs refresh", className: "text-mem-status-thinking", icon: Clock3 }
  }, [data])
  const OverallIcon = overall.icon

  return (
    <motion.div {...enterJarvis} className="mx-auto w-full max-w-[1280px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">PROOF GATE</p>
          <h1 className="text-2xl font-medium text-mem-text-primary">Trust Center</h1>
          <p className="mt-1 max-w-2xl text-sm text-mem-text-secondary">
            A plain-English scoreboard for AI claims. Green means recent proof exists. Red means do not trust the claim yet.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-mem-border bg-mem-surface-1 px-3 text-xs font-medium text-mem-text-secondary transition hover:bg-mem-surface-2 hover:text-mem-text-primary disabled:opacity-60"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </header>

      <section className="mb-5 rounded-xl border border-mem-border bg-mem-surface-1 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <OverallIcon className={cn("h-5 w-5", overall.className)} />
            <div>
              <div className={cn("text-sm font-medium", overall.className)}>{overall.label}</div>
              <div className="mt-0.5 text-xs text-mem-text-muted">
                {data ? `Checked ${fmtDate(data.checked_at)}` : "Reading latest harness reports"}
              </div>
            </div>
          </div>
          {data ? (
            <div className="grid grid-cols-4 gap-2">
              <Metric label="Pass" value={data.summary.pass} tone="ok" />
              <Metric label="Fail" value={data.summary.failed} tone={data.summary.failed ? "danger" : "ok"} />
              <Metric label="Stale" value={data.summary.stale} tone={data.summary.stale ? "warn" : "ok"} />
              <Metric label="Missing" value={data.summary.missing} tone={data.summary.missing ? "danger" : "ok"} />
            </div>
          ) : null}
        </div>
        {error ? (
          <div className="mt-4 rounded-lg border border-mem-status-stuck/30 bg-mem-status-stuck/10 px-3 py-2 text-sm text-mem-status-stuck">
            {error}
          </div>
        ) : null}
      </section>

      <div className="grid gap-4">
        {data?.checks.map((check, index) => (
          <motion.div
            key={check.scenario}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.03 }}
          >
            <ProofCard check={check} />
          </motion.div>
        ))}
        {!data && !error ? (
          <div className="rounded-xl border border-mem-border bg-mem-surface-1 p-8 text-center text-sm text-mem-text-secondary">
            Loading proof runs...
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}
