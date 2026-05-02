"use client"

// Reusable 36px-tall segmented pill control for sub-tab navigation.
// Memory · Agents · Runs is the canonical example, but Jarvis pages can use
// it for any 2–5 segment choice. The active segment animates with `tabSwap`.
//
// Used by W3B (memory page sub-tabs), W3C (agents/runs), W4A, W4C.

import { motion, useReducedMotion } from "framer-motion"
import { useId } from "react"
import { cn } from "@/lib/utils"
import { JARVIS_EASE } from "@/components/jarvis/motion/presets"

export interface SegmentedOption<T extends string = string> {
  value: T
  label: string
  /** Optional badge (e.g. unread count). */
  badge?: number | string
  /** Optional aria-label override. Defaults to label. */
  ariaLabel?: string
}

interface JarvisSegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Optional className applied to the outer pill. */
  className?: string
  /** aria-label for the radiogroup. */
  ariaLabel?: string
  /** Visual size, defaults to "md" (36px). "sm" is 28px. */
  size?: "sm" | "md"
}

export function JarvisSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel = "Tab navigation",
  size = "md",
}: JarvisSegmentedControlProps<T>) {
  const reduced = useReducedMotion()
  const layoutId = useId()
  const heightClass = size === "md" ? "h-9" : "h-7"
  const padClass = size === "md" ? "px-3 text-xs" : "px-2.5 text-[11px]"

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-mem-border bg-mem-surface-1 p-0.5",
        heightClass,
        className
      )}
    >
      {options.map((opt) => {
        const isActive = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={opt.ariaLabel ?? opt.label}
            onClick={() => {
              if (!isActive) onChange(opt.value)
            }}
            className={cn(
              "relative z-10 inline-flex items-center gap-1.5 rounded-full font-medium transition-colors",
              padClass,
              isActive
                ? "text-mem-text-primary"
                : "text-mem-text-secondary hover:text-mem-text-primary"
            )}
          >
            {isActive && (
              <motion.span
                layoutId={`segmented-pill-${layoutId}`}
                className="absolute inset-0 -z-10 rounded-full bg-mem-surface-3"
                transition={
                  reduced
                    ? { duration: 0 }
                    : { duration: 0.25, ease: JARVIS_EASE }
                }
              />
            )}
            <span>{opt.label}</span>
            {opt.badge !== undefined && opt.badge !== null && (
              <span
                className={cn(
                  "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[10px]",
                  isActive
                    ? "bg-mem-accent/20 text-mem-accent"
                    : "bg-mem-surface-3 text-mem-text-muted"
                )}
              >
                {opt.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
