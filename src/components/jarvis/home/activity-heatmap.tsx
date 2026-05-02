"use client"

/**
 * 90-day activity heatmap, GitHub-contributions-style. 13 columns × 7 rows
 * (week × day). Each cell shaded by total activity that day; hover shows
 * tooltip breakdown.
 */

import { useEffect, useMemo, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Activity } from "lucide-react"
import { cn } from "@/lib/utils"

type Day = {
  date: string
  runs: number
  audits: number
  edits: number
  notifications: number
  total: number
}

type Resp = {
  days: Day[]
  max: number
  total_90d: { runs: number; audits: number; edits: number; notifications: number; total: number }
  streak_days: number
}

function fmtMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })
}

function dayShade(total: number, max: number): string {
  if (total === 0) return "bg-mem-surface-3/60"
  const pct = total / max
  if (pct < 0.2) return "bg-mem-accent/20"
  if (pct < 0.4) return "bg-mem-accent/35"
  if (pct < 0.6) return "bg-mem-accent/55"
  if (pct < 0.85) return "bg-mem-accent/75"
  return "bg-mem-accent"
}

export function ActivityHeatmap() {
  const reduced = useReducedMotion() ?? false
  const [data, setData] = useState<Resp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<Day | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/jarvis/activity-90d", { cache: "no-store" })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as Resp
        if (!cancelled) setData(json)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "fetch failed")
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Compute the grid — bucket days into weeks. Week 0 starts at the oldest
  // Sunday on or before days[0].date.
  const grid = useMemo<Day[][]>(() => {
    if (!data) return []
    const weeks: Day[][] = []
    const days = data.days
    if (days.length === 0) return []
    const first = new Date(`${days[0].date}T00:00:00Z`)
    const dayOfWeek = first.getUTCDay() // 0 Sunday
    let week: Day[] = []
    // Pad start with empty days for alignment
    for (let i = 0; i < dayOfWeek; i++) {
      week.push({ date: "", runs: 0, audits: 0, edits: 0, notifications: 0, total: -1 })
    }
    for (const d of days) {
      week.push(d)
      if (week.length === 7) {
        weeks.push(week)
        week = []
      }
    }
    if (week.length > 0) {
      // Pad end
      while (week.length < 7) {
        week.push({ date: "", runs: 0, audits: 0, edits: 0, notifications: 0, total: -1 })
      }
      weeks.push(week)
    }
    return weeks
  }, [data])

  // Month labels above the grid
  const monthLabels = useMemo<{ col: number; label: string }[]>(() => {
    if (!data || grid.length === 0) return []
    const seen = new Set<string>()
    const labels: { col: number; label: string }[] = []
    grid.forEach((week, col) => {
      const firstReal = week.find((d) => d.date)
      if (!firstReal) return
      const month = fmtMonth(firstReal.date)
      if (!seen.has(month)) {
        seen.add(month)
        labels.push({ col, label: month })
      }
    })
    return labels
  }, [grid, data])

  if (error && !data) {
    return (
      <div className="rounded-xl border border-mem-border bg-mem-surface-1 p-5 text-sm text-mem-text-muted">
        Activity unavailable — {error}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-mem-border bg-mem-surface-1 p-5">
        <div className="h-32 animate-pulse rounded-md bg-mem-surface-2" />
      </div>
    )
  }

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
      className="rounded-xl border border-mem-border bg-mem-surface-1 p-5"
    >
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-mem-accent" />
          <h3 className="text-sm font-medium text-mem-text-primary">90-day activity</h3>
        </div>
        <div className="flex flex-wrap items-baseline gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">
          <span>{data.total_90d.total} events</span>
          <span>·</span>
          <span>streak {data.streak_days}d</span>
          <span>·</span>
          <span>{data.total_90d.runs} runs · {data.total_90d.edits} edits · {data.total_90d.audits} changes</span>
        </div>
      </header>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1.5">
          {/* Month labels row */}
          <div className="relative h-3 pl-6">
            {monthLabels.map((m) => (
              <span
                key={`${m.col}-${m.label}`}
                className="absolute font-mono text-[9px] uppercase tracking-wider text-mem-text-muted"
                style={{ left: `${m.col * 13 + 24}px` }}
              >
                {m.label}
              </span>
            ))}
          </div>
          {/* Grid: rows = days of week, cols = weeks */}
          <div className="flex gap-[3px]">
            {/* Day-of-week label column */}
            <div className="flex flex-col gap-[3px] pr-1 font-mono text-[9px] uppercase tracking-wider text-mem-text-muted">
              <span className="h-[10px]">M</span>
              <span className="h-[10px]"></span>
              <span className="h-[10px]">W</span>
              <span className="h-[10px]"></span>
              <span className="h-[10px]">F</span>
              <span className="h-[10px]"></span>
              <span className="h-[10px]"></span>
            </div>
            {grid.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((d, di) => (
                  <div
                    key={`${wi}-${di}`}
                    className={cn(
                      "h-[10px] w-[10px] rounded-sm transition-colors",
                      d.total < 0 ? "bg-transparent" : dayShade(d.total, data.max),
                      d.date && "cursor-pointer hover:ring-1 hover:ring-mem-accent",
                    )}
                    onMouseEnter={() => d.date && setHover(d)}
                    onMouseLeave={() => setHover(null)}
                    aria-label={d.date ? `${d.date}: ${d.total} events` : ""}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip / hover detail */}
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        {hover ? (
          <div className="flex flex-wrap items-baseline gap-2 text-xs text-mem-text-secondary">
            <span className="font-mono text-mem-text-primary">{hover.date}</span>
            <span>·</span>
            <span><span className="text-mem-text-primary">{hover.total}</span> events</span>
            {hover.runs > 0 ? <span>· {hover.runs} runs</span> : null}
            {hover.edits > 0 ? <span>· {hover.edits} edits</span> : null}
            {hover.audits > 0 ? <span>· {hover.audits} audits</span> : null}
            {hover.notifications > 0 ? <span>· {hover.notifications} alerts</span> : null}
          </div>
        ) : (
          <span className="text-xs text-mem-text-muted">Hover any cell to see the breakdown</span>
        )}
        <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-mem-text-muted">
          <span>less</span>
          <span className="h-[10px] w-[10px] rounded-sm bg-mem-surface-3/60" />
          <span className="h-[10px] w-[10px] rounded-sm bg-mem-accent/20" />
          <span className="h-[10px] w-[10px] rounded-sm bg-mem-accent/35" />
          <span className="h-[10px] w-[10px] rounded-sm bg-mem-accent/55" />
          <span className="h-[10px] w-[10px] rounded-sm bg-mem-accent/75" />
          <span className="h-[10px] w-[10px] rounded-sm bg-mem-accent" />
          <span>more</span>
        </div>
      </div>
    </motion.div>
  )
}
