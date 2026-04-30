"use client"

/**
 * Right-rail Activity Feed for /agency/terminals.
 *
 * Polls /api/terminals/events every 5s and renders the most recent events
 * grouped by session. The feed shows what siblings are doing in real time
 * so Dylan doesn't have to flip between tabs to know what's happening.
 *
 * Event kinds emitted by the VPS terminal-server (see emitEvent in
 * vps-deliverables/terminal-server/index.ts):
 *   - created           — new terminal spawned
 *   - stopped           — graceful kill via DELETE
 *   - crashed           — tmux session vanished without DELETE; respawn or terminal
 *   - respawned         — auto-restarted after first crash
 *   - cost_cap_tripped  — paused because cost_usd >= cost_cap_usd
 *   - wallclock_warning — running > wallclock_cap_minutes
 *   - file_changed      — sibling-writer detected a new file in `git status`
 */
import { useEffect, useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  FilePen,
  Loader2,
  PlayCircle,
  RotateCw,
  StopCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface FeedEvent {
  id: number
  session_id: string
  kind: string
  payload: Record<string, unknown>
  created_at: string
}

interface SessionTitleMap {
  [id: string]: string
}

interface Props {
  /** Map of session id → title so the feed can render readable labels. */
  sessionTitles: SessionTitleMap
}

const KIND_META: Record<string, { icon: typeof PlayCircle; color: string; label: string }> = {
  created: { icon: PlayCircle, color: "text-emerald-300", label: "started" },
  stopped: { icon: StopCircle, color: "text-zinc-400", label: "stopped" },
  crashed: { icon: AlertTriangle, color: "text-red-400", label: "crashed" },
  respawned: { icon: RotateCw, color: "text-amber-300", label: "respawned" },
  cost_cap_tripped: { icon: DollarSign, color: "text-orange-300", label: "cost cap tripped" },
  wallclock_warning: { icon: Clock, color: "text-amber-300", label: "running long" },
  file_changed: { icon: FilePen, color: "text-zinc-300", label: "edited" },
}

export function ActivityFeed({ sessionTitles }: Props) {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const res = await fetch("/api/terminals/events?limit=80", { cache: "no-store" })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const data = (await res.json()) as { events: FeedEvent[] }
        if (!cancelled) {
          setEvents(data.events || [])
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    refresh()
    const id = setInterval(refresh, 5_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-zinc-800/60 text-[10px] uppercase tracking-wider text-zinc-500 sticky top-0 bg-zinc-950/90 backdrop-blur z-10 flex items-center justify-between">
        <span>Activity</span>
        {loading && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="px-3 py-3 text-xs text-red-300 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {!loading && events.length === 0 && !error && (
          <div className="px-4 py-8 text-center text-xs text-zinc-500">
            <CheckCircle2 className="w-4 h-4 mx-auto mb-2 text-zinc-600" />
            No activity yet.<br />
            Events appear when terminals start, stop, edit files, or hit caps.
          </div>
        )}
        {events.map((e) => (
          <EventRow key={e.id} ev={e} title={sessionTitles[e.session_id]} />
        ))}
      </div>
    </div>
  )
}

function EventRow({ ev, title }: { ev: FeedEvent; title?: string }) {
  const meta = KIND_META[ev.kind] || { icon: AlertCircle, color: "text-zinc-400", label: ev.kind }
  const Icon = meta.icon
  return (
    <div className="px-3 py-2 border-b border-zinc-800/30 text-xs">
      <div className="flex items-start gap-2">
        <Icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", meta.color)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-medium text-zinc-200 truncate max-w-[160px]">
              {title || ev.session_id.slice(0, 8)}
            </span>
            <span className="text-zinc-500 truncate">{meta.label}</span>
          </div>
          <EventDetail kind={ev.kind} payload={ev.payload} />
          <div className="text-[10px] text-zinc-600 mt-0.5">
            {timeAgo(ev.created_at)}
          </div>
        </div>
      </div>
    </div>
  )
}

function EventDetail({ kind, payload }: { kind: string; payload: Record<string, unknown> }) {
  if (kind === "file_changed" && typeof payload.path === "string") {
    return <div className="text-[11px] text-zinc-400 font-mono truncate">{payload.path}</div>
  }
  if (kind === "cost_cap_tripped") {
    return (
      <div className="text-[11px] text-orange-300">
        ${Number(payload.cost_usd).toFixed(2)} of ${Number(payload.cap_usd).toFixed(2)} cap
      </div>
    )
  }
  if (kind === "wallclock_warning" && typeof payload.age_min === "number") {
    return <div className="text-[11px] text-amber-300">{Math.round(Number(payload.age_min) / 60 * 10) / 10}h running</div>
  }
  if (kind === "crashed" && payload.crashes) {
    return <div className="text-[11px] text-red-300">crash #{payload.crashes as number}</div>
  }
  return null
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return "just now"
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}
