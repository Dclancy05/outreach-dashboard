"use client"

// MCP status pill — 4-state, color-locked.
//
// Status colors (locked by W4.A.B2 spec):
//   connected    → green-500
//   degraded     → amber-400
//   disconnected → zinc-500
//   error        → red-400
//
// Used in:
//   - server-card.tsx (top-right corner, dot + text)
//   - server-detail-drawer.tsx (overview tab header)
//   - mcp-catalog.tsx (under each catalog row)

import { cn } from "@/lib/utils"
import { motion, useReducedMotion } from "framer-motion"
import type { McpStatus } from "@/lib/mcp/types"

interface McpHealthBadgeProps {
  status: McpStatus
  /** Show animated pulse dot when status is "connected". Default true. */
  pulse?: boolean
  /** Render as compact (dot only) — used inside crowded card corners. */
  compact?: boolean
  className?: string
}

interface StatusVisual {
  label: string
  dotClass: string
  textClass: string
  ringClass: string
  bgClass: string
}

const STATUS_VISUALS: Record<McpStatus, StatusVisual> = {
  connected: {
    label: "Connected",
    dotClass: "bg-green-500",
    textClass: "text-green-400",
    ringClass: "ring-green-500/30",
    bgClass: "bg-green-500/10",
  },
  degraded: {
    label: "Degraded",
    dotClass: "bg-amber-400",
    textClass: "text-amber-300",
    ringClass: "ring-amber-400/30",
    bgClass: "bg-amber-400/10",
  },
  disconnected: {
    label: "Disconnected",
    dotClass: "bg-zinc-500",
    textClass: "text-zinc-300",
    ringClass: "ring-zinc-500/30",
    bgClass: "bg-zinc-500/10",
  },
  error: {
    label: "Error",
    dotClass: "bg-red-400",
    textClass: "text-red-300",
    ringClass: "ring-red-400/30",
    bgClass: "bg-red-400/10",
  },
}

export function McpHealthBadge({
  status,
  pulse = true,
  compact = false,
  className,
}: McpHealthBadgeProps) {
  const v = STATUS_VISUALS[status] ?? STATUS_VISUALS.disconnected
  const reduced = useReducedMotion()
  const showPulse = pulse && status === "connected" && !reduced

  if (compact) {
    return (
      <span
        role="status"
        aria-label={v.label}
        className={cn("relative inline-flex h-2 w-2", className)}
      >
        {showPulse && (
          <motion.span
            aria-hidden
            className={cn(
              "absolute inset-0 rounded-full opacity-60",
              v.dotClass
            )}
            animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity }}
          />
        )}
        <span
          aria-hidden
          className={cn("relative inline-block h-2 w-2 rounded-full", v.dotClass)}
        />
      </span>
    )
  }

  return (
    <span
      role="status"
      aria-label={v.label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
        v.bgClass,
        v.textClass,
        v.ringClass,
        className
      )}
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        {showPulse && (
          <motion.span
            aria-hidden
            className={cn(
              "absolute inset-0 rounded-full opacity-60",
              v.dotClass
            )}
            animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity }}
          />
        )}
        <span
          aria-hidden
          className={cn("relative inline-block h-1.5 w-1.5 rounded-full", v.dotClass)}
        />
      </span>
      {v.label}
    </span>
  )
}
