"use client"

/**
 * SparklineChart — a tiny, dependency-free SVG line chart.
 *
 * Built for the Automations Overview tab "14-Day Health Trend" widget.
 * Renders a small line + filled gradient under the curve so Dylan can
 * eyeball pass-rate trend at a glance, with hover tooltips on each
 * datapoint (date + percentage + run count).
 *
 * Why hand-rolled instead of recharts: the dashboard doesn't currently
 * pull in a charting library, and a 14-point line chart needs ~80 lines
 * of code. Adding 100 KB of recharts JS for this would be silly.
 */

import { useState, useMemo, useId } from "react"
import type { DailySparklinePoint } from "@/lib/api/automations"

interface SparklineChartProps {
  data: DailySparklinePoint[]
  height?: number
  /** Optional stroke color override (defaults to emerald-400). */
  stroke?: string
}

export function SparklineChart({
  data,
  height = 60,
  stroke = "rgb(52 211 153)", // emerald-400
}: SparklineChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  // Stable per-instance gradient ID so multiple charts on the same
  // page don't collide. useId avoids hydration mismatches that
  // Math.random() would cause.
  const gradientId = useId()

  // Width is fluid (the SVG fills its parent); we use a fixed viewBox
  // so the line scales but stays sharp on retina.
  const VB_W = 280
  const VB_H = height
  const PAD_X = 4
  const PAD_Y = 4

  const { points, areaPath, linePath, totalRuns, overallPassRate } = useMemo(() => {
    if (data.length === 0) {
      return {
        points: [] as Array<DailySparklinePoint & { x: number; y: number }>,
        areaPath: "",
        linePath: "",
        totalRuns: 0,
        overallPassRate: null as number | null,
      }
    }
    const stepX = (VB_W - PAD_X * 2) / Math.max(1, data.length - 1)
    const innerH = VB_H - PAD_Y * 2

    const pts = data.map((d, i) => {
      // null pass_rate (no runs that day) renders at the midpoint so a
      // gap of inactivity reads neutral, not catastrophic.
      const v = d.pass_rate == null ? 50 : d.pass_rate
      const x = PAD_X + stepX * i
      const y = PAD_Y + innerH - (v / 100) * innerH
      return { ...d, x, y }
    })

    const linePath = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ")
    const areaPath =
      `M${pts[0].x.toFixed(2)},${(VB_H - PAD_Y).toFixed(2)} ` +
      pts.map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") +
      ` L${pts[pts.length - 1].x.toFixed(2)},${(VB_H - PAD_Y).toFixed(2)} Z`

    const total = data.reduce((sum, d) => sum + d.total, 0)
    const passed = data.reduce((sum, d) => sum + d.passed, 0)
    const overall =
      total === 0 ? null : Math.round((passed / total) * 100)

    return {
      points: pts,
      areaPath,
      linePath,
      totalRuns: total,
      overallPassRate: overall,
    }
  }, [data, VB_H])

  if (data.length === 0) {
    return (
      <div
        className="w-full text-center text-xs text-muted-foreground py-3"
        style={{ height }}
      >
        No run history yet
      </div>
    )
  }

  const hoverPoint = hoverIdx != null ? points[hoverIdx] : null

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradientId})`} />
        {/* Line stroke */}
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Datapoint hit-targets */}
        {points.map((p, i) => (
          <g
            key={p.date}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{ cursor: "pointer" }}
          >
            <rect
              x={p.x - 8}
              y={0}
              width={16}
              height={VB_H}
              fill="transparent"
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={hoverIdx === i ? 3 : 0}
              fill={stroke}
              stroke="hsl(var(--background))"
              strokeWidth="1"
            />
          </g>
        ))}
      </svg>
      {/* Tooltip */}
      {hoverPoint && (
        <div
          className="absolute -top-1 z-10 -translate-y-full -translate-x-1/2 pointer-events-none rounded-lg border border-border/60 bg-popover/95 px-2.5 py-1.5 text-[11px] shadow-xl backdrop-blur-md"
          style={{
            left: `${(hoverPoint.x / VB_W) * 100}%`,
          }}
        >
          <p className="font-semibold text-foreground tabular-nums">
            {formatShortDate(hoverPoint.date)}
          </p>
          <p className="text-muted-foreground">
            {hoverPoint.pass_rate == null
              ? "No runs"
              : `${hoverPoint.pass_rate}% (${hoverPoint.passed}/${hoverPoint.total})`}
          </p>
        </div>
      )}
      {/* Footer summary */}
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>14 days</span>
        <span>
          {totalRuns} run{totalRuns === 1 ? "" : "s"}
          {overallPassRate != null ? ` · ${overallPassRate}% pass` : ""}
        </span>
      </div>
    </div>
  )
}

function formatShortDate(iso: string): string {
  // iso is YYYY-MM-DD. Render as "May 2".
  try {
    const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10))
    const date = new Date(Date.UTC(y, m - 1, d))
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
  } catch {
    return iso
  }
}
