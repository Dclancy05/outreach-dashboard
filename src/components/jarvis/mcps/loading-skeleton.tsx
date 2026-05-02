"use client"

// Loading skeletons for the /jarvis/mcps page.
//
// Two exports:
//   - <McpsGridSkeleton />       — 6 shimmer cards in a responsive grid
//   - <McpsActivityRowSkeleton /> — single row, used inside ActivityLogTable

import { cn } from "@/lib/utils"

interface SkeletonProps {
  className?: string
}

function ShimmerBlock({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-mem-surface-2",
        className
      )}
      aria-hidden
    />
  )
}

export function McpsGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-live="polite"
      data-testid="mcps-grid-skeleton"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex h-[180px] flex-col justify-between rounded-xl border border-mem-border bg-mem-surface-1 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShimmerBlock className="h-7 w-7 rounded-lg" />
              <div className="space-y-1.5">
                <ShimmerBlock className="h-3.5 w-24" />
                <ShimmerBlock className="h-2.5 w-16" />
              </div>
            </div>
            <ShimmerBlock className="h-5 w-20 rounded-full" />
          </div>
          <ShimmerBlock className="h-3 w-full" />
          <div className="space-y-1.5">
            <ShimmerBlock className="h-2 w-32" />
            <ShimmerBlock className="h-1.5 w-full rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function McpsActivityRowSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-md border border-mem-border bg-mem-surface-1 p-3"
        >
          <ShimmerBlock className="h-2 w-2 rounded-full" />
          <ShimmerBlock className="h-3 w-32" />
          <ShimmerBlock className="ml-auto h-3 w-16" />
          <ShimmerBlock className="h-3 w-12" />
        </div>
      ))}
    </div>
  )
}
