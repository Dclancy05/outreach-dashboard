"use client"
/**
 * `all` mode landing — a friendly "what's been happening" feed shown when no
 * file is selected and the user is on the unfiltered view.
 *
 * Three sections:
 *   1. Quick links to the other modes (so the page never feels empty)
 *   2. Recent activity from /api/runs (last 6 runs, any status)
 *   3. Tip — points to the chips above so users discover the unification
 *
 * The feed deliberately reuses /api/runs (not a brand-new endpoint) so this
 * surface ships without DB or API changes.
 */
import * as React from "react"
import Link from "next/link"
import useSWR from "swr"
import {
  Activity, Bot, Code2, FileText, Loader2, MessageSquare, TerminalSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  /** Wired so we could surface "click last file" cards in a future slice. */
  onSelect: (path: string) => void
}

interface RecentRun {
  id: string
  status: string
  workflow_name?: string
  workflow_emoji?: string | null
  created_at: string
  cost_usd?: number | null
}

const fetcher = async (url: string) => {
  const r = await fetch(url, { cache: "no-store" })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

const QUICK_LINKS: { id: string; label: string; href: string; icon: typeof Bot; tone: string }[] = [
  { id: "knowledge", label: "Browse knowledge", href: "/agency/memory?mode=knowledge", icon: FileText, tone: "text-mem-accent" },
  { id: "code", label: "Open the code tree", href: "/agency/memory?mode=code", icon: Code2, tone: "text-emerald-300" },
  { id: "convos", label: "See conversations", href: "/agency/memory?mode=conversations", icon: MessageSquare, tone: "text-sky-300" },
  { id: "agents", label: "Manage agents", href: "/agency/memory?mode=agents", icon: Bot, tone: "text-amber-300" },
  { id: "terminals", label: "Spawn a terminal", href: "/agency/memory?mode=terminals", icon: TerminalSquare, tone: "text-cyan-300" },
]

export function AllModeLanding({ onSelect: _onSelect }: Props) {
  void _onSelect
  const { data, isLoading } = useSWR<{ data: RecentRun[] }>(
    "all-mode-recent",
    () => fetcher("/api/runs?limit=6"),
    { refreshInterval: 30_000 }
  )

  const recent = data?.data || []

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header card */}
        <div className="rounded-2xl border border-mem-border bg-gradient-to-br from-mem-accent/8 via-mem-surface-1 to-mem-surface-1 px-6 py-6 mb-6">
          <h2 className="text-[18px] font-semibold text-mem-text-primary tracking-[-0.01em]">
            Welcome back
          </h2>
          <p className="mt-1.5 text-[13px] text-mem-text-secondary leading-relaxed">
            Memory, code, conversations, agents, and terminals all live on this page now.
            Use the chips above to jump between them, or pick a quick link below.
          </p>
        </div>

        {/* Quick links grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-8">
          {QUICK_LINKS.map((q) => {
            const Icon = q.icon
            return (
              <Link
                key={q.id}
                href={q.href}
                className="group flex items-center gap-3 rounded-xl border border-mem-border bg-mem-surface-1 hover:bg-mem-surface-2 hover:border-mem-border-strong transition-all px-4 py-3"
              >
                <div className="h-9 w-9 rounded-lg bg-mem-surface-2 border border-mem-border grid place-items-center shrink-0 group-hover:border-mem-border-strong transition-colors">
                  <Icon className={cn("w-4 h-4", q.tone)} />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-mem-text-primary">
                    {q.label}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Recent activity */}
        <div className="mb-2 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-mem-text-muted" />
          <h3 className="text-[11px] uppercase tracking-[0.06em] font-semibold text-mem-text-muted">
            Recent activity
          </h3>
        </div>
        {isLoading && (
          <div className="text-[12px] text-mem-text-muted flex items-center gap-1.5 px-3 py-3">
            <Loader2 size={12} className="animate-spin" /> Loading…
          </div>
        )}
        {!isLoading && recent.length === 0 && (
          <div className="rounded-xl border border-dashed border-mem-border bg-mem-surface-1 px-4 py-6 text-center text-[12px] text-mem-text-muted">
            No recent runs yet. Trigger one from the Workflows tab.
          </div>
        )}
        {recent.length > 0 && (
          <ul className="rounded-xl border border-mem-border bg-mem-surface-1 divide-y divide-mem-border overflow-hidden">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/agency/runs/${r.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-mem-surface-2 transition-colors"
                >
                  <StatusDot status={r.status} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-mem-text-primary truncate">
                      {r.workflow_emoji || "▶"} {r.workflow_name || "workflow"}
                    </div>
                    <div className="text-[11px] text-mem-text-muted mt-0.5">
                      <span className="font-mono">#{r.id.slice(0, 8)}</span>
                      {" · "}
                      {timeAgo(r.created_at)}
                      {typeof r.cost_usd === "number" && (
                        <>
                          {" · "}
                          <span className="font-mono">${r.cost_usd.toFixed(2)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-mem-text-muted">{r.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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
  return <span className={cn("h-2 w-2 rounded-full shrink-0", color)} aria-hidden />
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return "just now"
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}
