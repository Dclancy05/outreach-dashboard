"use client"
/**
 * Right rail variant rendered in `agents` mode.
 *
 * Shows recent runs + a tiny health summary for the selected agent (if any).
 * When nothing is selected we show a global "recent runs across all agents"
 * feed so the rail is never empty.
 *
 * Pulls from /api/runs (the same data RunsView in the centre pane uses).
 * Tabs: Runs / Health / Info.
 */
import * as React from "react"
import Link from "next/link"
import useSWR from "swr"
import {
  Activity, ChevronLeft, ChevronRight, HeartPulse, Info, Loader2, PlayCircle,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type Tab = "runs" | "health" | "info"

interface Props {
  /** When set, scope the run list + health to this agent slug. */
  selectedSlug: string | null
  defaultCollapsed?: boolean
}

interface RunRow {
  id: string
  status: string
  workflow_id: string
  workflow_name?: string
  workflow_emoji?: string | null
  agent_id?: string | null
  created_at: string
  finished_at?: string | null
  cost_usd?: number | null
}

function useBelowMd(): boolean {
  const [below, setBelow] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const handler = (e: MediaQueryListEvent | MediaQueryList) =>
      setBelow("matches" in e ? e.matches : (e as MediaQueryList).matches)
    handler(mq)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return below
}

const fetcher = async (url: string) => {
  const r = await fetch(url, { cache: "no-store" })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export function AgentsRightRail({ selectedSlug, defaultCollapsed = false }: Props) {
  const belowMd = useBelowMd()
  const [userCollapsed, setUserCollapsed] = React.useState(defaultCollapsed)
  const collapsed = belowMd ? true : userCollapsed
  const [tab, setTab] = React.useState<Tab>("runs")

  const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
    { id: "runs", label: "Runs", icon: Activity },
    { id: "health", label: "Health", icon: HeartPulse },
    { id: "info", label: "Info", icon: Info },
  ]

  return (
    <aside
      className={cn(
        "h-full bg-mem-surface-1 border-l border-mem-border flex flex-col transition-[width] duration-[220ms] ease-mem-spring shrink-0"
      )}
      style={{ width: collapsed ? 48 : 320 }}
      aria-label="Agents side panel"
    >
      <div
        className={cn(
          "h-12 border-b border-mem-border flex items-center",
          collapsed ? "flex-col gap-2 py-3 h-auto" : "px-2 gap-1"
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-1 bg-mem-surface-2 border border-mem-border rounded-lg p-0.5 flex-wrap">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "h-6 px-2 rounded-md text-[11px] font-medium inline-flex items-center gap-1 transition-colors",
                    active
                      ? "bg-mem-surface-3 text-mem-text-primary"
                      : "text-mem-text-secondary hover:text-mem-text-primary"
                  )}
                  aria-pressed={active}
                >
                  <Icon size={11} />
                  {t.label}
                </button>
              )
            })}
          </div>
        )}
        {collapsed &&
          TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id)
                  if (!belowMd) setUserCollapsed(false)
                }}
                className={cn(
                  "h-7 w-7 grid place-items-center rounded-md transition-colors",
                  active
                    ? "bg-mem-surface-3 text-mem-text-primary"
                    : "text-mem-text-secondary hover:text-mem-text-primary hover:bg-mem-surface-2"
                )}
                aria-label={t.label}
                title={t.label}
              >
                <Icon size={14} />
              </button>
            )
          })}
        {!belowMd && (
          <button
            onClick={() => setUserCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand side panel" : "Collapse side panel"}
            className={cn(
              "h-6 w-6 grid place-items-center rounded-md text-mem-text-muted hover:text-mem-text-primary hover:bg-mem-surface-2 transition-colors",
              !collapsed && "ml-auto"
            )}
          >
            {collapsed ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="flex-1 min-h-0 flex flex-col">
          {tab === "runs" && <RunsRailTab agentSlug={selectedSlug} />}
          {tab === "health" && <HealthRailTab agentSlug={selectedSlug} />}
          {tab === "info" && <InfoRailTab agentSlug={selectedSlug} />}
        </div>
      )}
    </aside>
  )
}

function RunsRailTab({ agentSlug }: { agentSlug: string | null }) {
  // We don't filter on the API by agent (the runs route doesn't support that
  // yet) — pull the latest 25 and filter client-side. Cheap.
  const { data, error, isLoading } = useSWR<{ data: RunRow[] }>(
    "rail-runs",
    () => fetcher("/api/runs?limit=25"),
    { refreshInterval: 10_000 }
  )

  const runs = data?.data || []
  const filtered = agentSlug
    ? runs.filter((r) => (r as RunRow & { agent_slug?: string }).agent_slug === agentSlug)
    : runs
  const visible = filtered.length > 0 ? filtered : runs

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="px-3 py-2 text-[10px] uppercase tracking-[0.04em] font-semibold text-mem-text-muted border-b border-mem-border bg-mem-surface-1 sticky top-0">
        {agentSlug ? `Recent runs · ${agentSlug}` : "Recent runs"}
      </div>
      {isLoading && (
        <div className="px-4 py-6 text-center text-[11px] text-mem-text-muted flex items-center justify-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </div>
      )}
      {error && (
        <div className="px-3 py-3 text-[11px] text-red-300">
          Couldn&apos;t load runs.
        </div>
      )}
      {!isLoading && visible.length === 0 && (
        <div className="px-4 py-6 text-center text-[11px] text-mem-text-muted">
          No runs yet. Trigger one from the Workflows tab.
        </div>
      )}
      {visible.map((r) => (
        <Link
          key={r.id}
          href={`/agency/runs/${r.id}`}
          className="block px-3 py-2 border-b border-mem-border/50 hover:bg-mem-surface-2 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={r.status} />
            <span className="text-[12.5px] font-medium text-mem-text-primary truncate">
              {r.workflow_emoji || "▶"} {r.workflow_name || "workflow"}
            </span>
          </div>
          <div className="mt-0.5 pl-[20px] text-[10px] text-mem-text-muted flex items-center gap-2">
            <span className="font-mono">#{r.id.slice(0, 8)}</span>
            <span>·</span>
            <span>{timeAgo(r.created_at)}</span>
            {typeof r.cost_usd === "number" && (
              <>
                <span>·</span>
                <span className="font-mono">${r.cost_usd.toFixed(2)}</span>
              </>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}

function HealthRailTab({ agentSlug }: { agentSlug: string | null }) {
  const { data, isLoading } = useSWR<{ data: RunRow[] }>(
    "rail-runs-health",
    () => fetcher("/api/runs?limit=50"),
    { refreshInterval: 30_000 }
  )

  const runs = data?.data || []
  const scope = agentSlug
    ? runs.filter((r) => (r as RunRow & { agent_slug?: string }).agent_slug === agentSlug)
    : runs

  const succeeded = scope.filter((r) => r.status === "succeeded").length
  const failed = scope.filter((r) => r.status === "failed" || r.status === "errored").length
  const running = scope.filter((r) => r.status === "running" || r.status === "queued").length
  const totalCost = scope.reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0)

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-3">
      <div className="text-[10px] uppercase tracking-[0.04em] font-semibold text-mem-text-muted">
        {agentSlug ? `Last 50 runs · ${agentSlug}` : "Last 50 runs"}
      </div>
      {isLoading ? (
        <div className="text-[11px] text-mem-text-muted flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <ul className="divide-y divide-mem-border bg-mem-surface-2 border border-mem-border rounded-xl overflow-hidden text-[12px]">
            <HealthRow label="Succeeded" value={String(succeeded)} tone="emerald" />
            <HealthRow label="Failed" value={String(failed)} tone={failed > 0 ? "red" : "muted"} />
            <HealthRow label="Running / queued" value={String(running)} tone="amber" />
            <HealthRow label="Total cost" value={`$${totalCost.toFixed(2)}`} tone="muted" />
          </ul>
          <Link
            href="/agency/memory?mode=agents&tab=health"
            className="text-[11px] text-mem-accent hover:underline inline-flex items-center gap-1"
          >
            Open full Health dashboard <ChevronRight size={11} />
          </Link>
        </>
      )}
    </div>
  )
}

function InfoRailTab({ agentSlug }: { agentSlug: string | null }) {
  if (!agentSlug) {
    return (
      <div className="flex-1 grid place-items-center text-center px-4">
        <div className="text-[12.5px] text-mem-text-secondary">
          Pick an agent on the left to see its details.
        </div>
      </div>
    )
  }
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.04em] font-semibold text-mem-text-muted mb-2">
        Agent
      </div>
      <ul className="divide-y divide-mem-border bg-mem-surface-2 border border-mem-border rounded-xl overflow-hidden text-[12px]">
        <li className="flex items-baseline gap-3 px-3 py-2.5">
          <span className="text-[10px] uppercase tracking-[0.04em] font-semibold text-mem-text-muted w-[80px] shrink-0">
            Slug
          </span>
          <span className="font-mono text-[11px] text-mem-text-primary min-w-0 truncate">
            {agentSlug}
          </span>
        </li>
        <li className="flex items-baseline gap-3 px-3 py-2.5">
          <span className="text-[10px] uppercase tracking-[0.04em] font-semibold text-mem-text-muted w-[80px] shrink-0">
            File
          </span>
          <Link
            href={`/agency/memory?file=${encodeURIComponent(`Jarvis/agent-skills/${agentSlug}.md`)}`}
            className="text-[12px] text-mem-accent hover:underline truncate"
          >
            Jarvis/agent-skills/{agentSlug}.md
          </Link>
        </li>
        <li className="flex items-baseline gap-3 px-3 py-2.5">
          <span className="text-[10px] uppercase tracking-[0.04em] font-semibold text-mem-text-muted w-[80px] shrink-0">
            Detail
          </span>
          <Link
            href={`/agency/agents/${agentSlug}`}
            className="text-[12px] text-mem-accent hover:underline"
          >
            Open detail page →
          </Link>
        </li>
      </ul>
    </div>
  )
}

function HealthRow({
  label, value, tone,
}: {
  label: string
  value: string
  tone: "emerald" | "red" | "amber" | "muted"
}) {
  const colors: Record<typeof tone, string> = {
    emerald: "text-emerald-300",
    red: "text-red-300",
    amber: "text-amber-300",
    muted: "text-mem-text-primary",
  }
  return (
    <li className="flex items-baseline gap-3 px-3 py-2.5">
      <span className="text-[10px] uppercase tracking-[0.04em] font-semibold text-mem-text-muted w-[110px] shrink-0">
        {label}
      </span>
      <span className={cn("text-[12.5px] font-mono", colors[tone])}>{value}</span>
    </li>
  )
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "succeeded"
      ? "bg-emerald-400"
      : status === "running"
      ? "bg-amber-400 animate-pulse"
      : status === "queued"
      ? "bg-zinc-500"
      : status === "failed" || status === "errored"
      ? "bg-red-500"
      : "bg-zinc-600"
  return <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", color)} aria-hidden />
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return "just now"
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}

void PlayCircle
