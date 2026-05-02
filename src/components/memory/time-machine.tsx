"use client"
/**
 * Sticky-bottom Time Machine scrubber on /agency/memory.
 * Selecting a non-`now` chip writes `?at=<value>` to the URL. Memory page
 * reads `?at=` → fetches /api/memory-vault/snapshot?at=<ISO> and dims the
 * editor pane.
 *
 * Chip values map to ISO timestamps relative to "now" at click time.
 */
import * as React from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"

export type TimeMachineValue = "now" | "1h" | "1d" | "1w" | "30d"

const CHIPS: { id: TimeMachineValue; label: string }[] = [
  { id: "now", label: "now" },
  { id: "1h", label: "1h" },
  { id: "1d", label: "1d" },
  { id: "1w", label: "1w" },
  { id: "30d", label: "30d" },
]

const MS = {
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
} as const

export function isoForChip(value: TimeMachineValue): string | null {
  if (value === "now") return null
  return new Date(Date.now() - MS[value]).toISOString()
}

export function TimeMachine() {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const active = (search?.get("at") ?? "now") as TimeMachineValue

  function selectChip(value: TimeMachineValue) {
    const params = new URLSearchParams(search?.toString() ?? "")
    if (value === "now") {
      params.delete("at")
    } else {
      params.set("at", value)
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div
      className={cn(
        "sticky bottom-0 z-10",
        "bg-mem-surface-1/95 backdrop-blur supports-[backdrop-filter]:bg-mem-surface-1/80",
        "border-t border-mem-border",
        "px-3 sm:px-5 py-2.5 flex items-center gap-2 sm:gap-3 flex-wrap"
      )}
      role="toolbar"
      aria-label="Time machine"
    >
      <div className="flex items-center gap-1.5 text-mem-text-muted">
        <Clock size={12} />
        <span className="text-[11px] uppercase tracking-[0.04em] font-semibold">
          Time machine
        </span>
      </div>
      <div className="flex items-center gap-1 bg-mem-surface-2 border border-mem-border rounded-full p-0.5">
        {CHIPS.map((c) => {
          const isActive = active === c.id
          return (
            <button
              key={c.id}
              onClick={() => selectChip(c.id)}
              aria-pressed={isActive}
              className={cn(
                "relative h-7 px-3 rounded-full text-[12px] font-medium transition-colors",
                isActive
                  ? "text-white"
                  : "text-mem-text-secondary hover:text-mem-text-primary"
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="time-machine-active"
                  className="absolute inset-0 rounded-full bg-mem-accent shadow-[0_0_18px_rgba(124,92,255,0.35)]"
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 32,
                    mass: 0.7,
                  }}
                />
              )}
              <span className="relative z-10 font-mono">{c.label}</span>
            </button>
          )
        })}
      </div>
      <span className="ml-auto font-mono text-[11px] text-mem-text-muted hidden sm:inline">
        {active === "now"
          ? "Live state"
          : `Read-only · ${humanLabelFor(active)}`}
      </span>
    </div>
  )
}

export function humanLabelFor(at: TimeMachineValue): string {
  switch (at) {
    case "now":
      return "now"
    case "1h":
      return "1 hour ago"
    case "1d":
      return "1 day ago"
    case "1w":
      return "1 week ago"
    case "30d":
      return "30 days ago"
  }
}

/** Read the current `?at=` value (or `null` if `now`/missing). */
export function useTimeMachineValue(): TimeMachineValue | null {
  const search = useSearchParams()
  const raw = search?.get("at")
  if (!raw || raw === "now") return null
  if (raw === "1h" || raw === "1d" || raw === "1w" || raw === "30d") return raw
  return null
}
