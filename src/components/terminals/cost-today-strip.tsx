"use client"

/**
 * Cost-today strip — sticky thin badge across the top of each pane.
 *
 * Phase 4 #3: shows `$X.XX of $Y.YY today` + the per-session $ counter pulled
 * from `cost_usd / cost_cap_usd`. Flashes red when within 90% of either cap.
 *
 * Polls `/api/terminals/cost-today` every 30s — cheap, single global value.
 * We keep the per-session number in the same strip (rather than a second one)
 * so vertical real-estate stays cheap for the 4×4 layout.
 */
import * as React from "react"
import { cn } from "@/lib/utils"

interface DailyResp {
  day: string
  session_count: number
  cost_usd_total: number
  tokens_total: number
  cap_usd: number
}

interface Props {
  sessionCost: number
  sessionCap: number
}

export function CostTodayStrip({ sessionCost, sessionCap }: Props) {
  const [today, setToday] = React.useState<DailyResp | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch("/api/terminals/cost-today", { cache: "no-store" })
        if (!res.ok) return
        const body = (await res.json()) as DailyResp
        if (!cancelled) setToday(body)
      } catch {
        /* swallow — strip degrades to per-session only */
      }
    }
    void tick()
    const id = setInterval(tick, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const sessionPct = sessionCap > 0 ? sessionCost / sessionCap : 0
  const dailyPct = today && today.cap_usd > 0 ? today.cost_usd_total / today.cap_usd : 0
  const sessionDanger = sessionPct >= 0.9
  const sessionWarn = sessionPct >= 0.5
  const dailyDanger = dailyPct >= 0.9
  const dailyWarn = dailyPct >= 0.5

  const sessionColor = sessionDanger
    ? "text-red-200 bg-red-500/15 animate-pulse"
    : sessionWarn ? "text-amber-200 bg-amber-500/10" : "text-zinc-400 bg-zinc-900/40"
  const dailyColor = dailyDanger
    ? "text-red-200 bg-red-500/15 animate-pulse"
    : dailyWarn ? "text-amber-200 bg-amber-500/10" : "text-zinc-400 bg-zinc-900/40"

  return (
    <div className="flex items-center gap-1.5 text-[10px] font-mono">
      <span className={cn("px-1.5 py-0.5 rounded", sessionColor)} title={`Session: ${sessionPct >= 1 ? "cap reached" : `${Math.round(sessionPct * 100)}%`}`}>
        ${sessionCost.toFixed(2)} / ${sessionCap.toFixed(2)} session
      </span>
      <span className={cn("px-1.5 py-0.5 rounded hidden sm:inline", dailyColor)} title={today ? `${today.session_count} sessions today` : "loading"}>
        ${(today?.cost_usd_total ?? 0).toFixed(2)} / ${today?.cap_usd.toFixed(2) ?? "—"} today
      </span>
    </div>
  )
}
