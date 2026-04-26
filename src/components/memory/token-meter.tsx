"use client"

import { cn } from "@/lib/utils"

export function TokenMeter({
  used,
  budget,
  injectedCount,
  totalCount,
  size = "md",
}: {
  used: number
  budget: number
  injectedCount?: number
  totalCount?: number
  size?: "sm" | "md"
}) {
  const pct = budget > 0 ? Math.min(100, (used / budget) * 100) : 0
  const color = pct < 60 ? "bg-emerald-500" : pct < 90 ? "bg-amber-400" : "bg-red-500"
  return (
    <div className={cn("space-y-1", size === "sm" ? "text-[10px]" : "text-xs")}>
      <div className="flex items-center justify-between text-muted-foreground">
        <span>{used.toLocaleString()} / {budget.toLocaleString()} tokens</span>
        {typeof injectedCount === "number" && typeof totalCount === "number" && (
          <span>{injectedCount}/{totalCount} memories</span>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all duration-300", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
