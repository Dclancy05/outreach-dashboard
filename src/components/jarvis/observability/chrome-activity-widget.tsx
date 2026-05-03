"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

// Wave 4.4 — Chrome activity widget. Reads /api/observability/chrome-goto
// and shows recent /goto + /login-status calls so Dylan can confirm
// nothing is silently driving Chrome (the 2026-05-02 incident pattern).

interface TimelineEntry {
  at: string
  action: string
  resource: string | null
  user_id: string | null
  status: number | null
  platform: string | null
}

interface Props {
  className?: string
  /** Default 30 — how many minutes back to scan. */
  windowMinutes?: number
  /** Auto-refresh interval in ms. Default 60_000 (60s). 0 = no refresh. */
  refreshMs?: number
}

export function ChromeActivityWidget({ className, windowMinutes = 30, refreshMs = 60_000 }: Props) {
  const [data, setData] = useState<{ count: number; by_action: Record<string, number>; by_platform: Record<string, number>; timeline: TimelineEntry[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const load = async () => {
      try {
        const res = await fetch(`/api/observability/chrome-goto?minutes=${windowMinutes}`)
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(json?.error || `HTTP ${res.status}`)
          setLoading(false)
          return
        }
        setData(json)
        setError(null)
        setLoading(false)
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      }
      if (!cancelled && refreshMs > 0) {
        timer = setTimeout(load, refreshMs)
      }
    }
    load()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [windowMinutes, refreshMs])

  return (
    <div className={cn("rounded-lg border border-mem-border bg-mem-surface p-4", className)}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-mem-text-primary">Chrome Activity</h3>
          <p className="text-[11px] text-mem-text-secondary">Last {windowMinutes}min · /goto + /login-status calls</p>
        </div>
        {loading ? (
          <span className="text-[11px] text-mem-text-secondary">loading…</span>
        ) : data ? (
          <span className="text-[11px] font-mono text-mem-text-primary">{data.count} calls</span>
        ) : null}
      </div>

      {error ? (
        <div className="text-[12px] text-rose-400">Error: {error}</div>
      ) : !data || data.count === 0 ? (
        <div className="text-[12px] text-mem-text-secondary py-4 text-center">
          No Chrome navigations in the last {windowMinutes}min. ✅
          <div className="text-[10px] mt-1 text-mem-text-secondary/60">
            Idle = zero is expected. The 2026-05-02 incident pattern would show calls here even when no one is using the app.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.keys(data.by_platform).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.by_platform).map(([p, n]) => (
                <span key={p} className="px-2 py-0.5 rounded-full bg-mem-bg border border-mem-border text-[10px] font-mono">
                  {p}: {n}
                </span>
              ))}
            </div>
          ) : null}
          <div className="max-h-64 overflow-y-auto space-y-1 text-[11px] font-mono">
            {data.timeline.slice(0, 50).map((e, i) => {
              const t = new Date(e.at).toISOString().slice(11, 19)
              const status = e.status
              const statusColor = !status ? "text-mem-text-secondary" : status >= 500 ? "text-rose-400" : status >= 400 ? "text-amber-400" : "text-emerald-400"
              return (
                <div key={i} className="flex gap-2 text-mem-text-primary">
                  <span className="text-mem-text-secondary tabular-nums">{t}</span>
                  <span className={cn("tabular-nums w-8", statusColor)}>{status ?? "—"}</span>
                  <span className="truncate">
                    {e.action} {e.platform ? <span className="text-violet-300">[{e.platform}]</span> : null}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
