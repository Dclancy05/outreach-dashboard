"use client"

// Step 6 — Try the Time Machine.
// Animated demo of dragging the scrubber back through history. We render a
// fake timeline so the user gets the gist without us mounting the real
// TimeMachine component (which depends on the page tree). On reduced
// motion the demo settles into a static "Today / Last week / 30 days
// ago" preview.

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Clock, History, Rewind } from "lucide-react"
import { Button } from "@/components/ui/button"
import { JARVIS_EASE, prefersReducedMotion } from "@/components/jarvis/motion/presets"

export interface StepTimeMachineProps {
  onNext: () => void
}

interface SnapshotLabel {
  pct: number
  label: string
  body: string
}

const SNAPSHOTS: ReadonlyArray<SnapshotLabel> = [
  { pct: 0, label: "30 days ago", body: "Older draft of your roadmap." },
  { pct: 0.33, label: "2 weeks ago", body: "Mid-sprint snapshot." },
  { pct: 0.66, label: "3 days ago", body: "Latest stable version." },
  { pct: 1, label: "Today", body: "Live working copy." },
]

function snapshotForPct(pct: number): SnapshotLabel {
  let chosen = SNAPSHOTS[0]
  for (const s of SNAPSHOTS) {
    if (pct >= s.pct - 0.001) chosen = s
  }
  return chosen
}

export function StepTimeMachine({ onNext }: StepTimeMachineProps): JSX.Element {
  const reduced = prefersReducedMotion()
  const [pct, setPct] = useState<number>(1) // 0 = past, 1 = today

  // Auto-play the demo: scrub back to 0, then back to 1, then loop.
  useEffect(() => {
    if (reduced) {
      setPct(1)
      return
    }
    let raf = 0
    let direction: -1 | 1 = -1
    let last = performance.now()
    const speed = 0.00018 // pct per ms — full sweep ~5.5s

    const tick = (now: number): void => {
      const dt = now - last
      last = now
      setPct((p) => {
        let next = p + direction * speed * dt
        if (next <= 0) {
          next = 0
          direction = 1
        } else if (next >= 1) {
          next = 1
          direction = -1
        }
        return next
      })
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [reduced])

  const snap = snapshotForPct(pct)
  const dimAmount = 1 - pct // older = dimmer

  return (
    <div className="flex flex-col">
      <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
        Try the Time Machine
      </h2>
      <p className="mt-2 max-w-lg text-sm text-mem-text-muted">
        Drag the scrubber to see your memory at any point in the past. Every
        edit is auto-snapshotted — nothing&apos;s ever lost.
      </p>

      {/* Demo card */}
      <div className="mt-6 overflow-hidden rounded-xl border border-mem-border bg-mem-surface-2">
        {/* Page preview that dims as you scrub back */}
        <div
          className="relative h-32 border-b border-mem-border bg-gradient-to-br from-mem-surface to-mem-surface-3 p-4 transition-opacity"
          style={{ opacity: 0.4 + pct * 0.6 }}
        >
          <div className="flex items-center gap-2 text-xs text-mem-text-muted">
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{snap.label}</span>
          </div>
          <motion.div
            key={snap.label}
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.2, ease: JARVIS_EASE }}
            className="mt-2 text-sm font-medium text-mem-text-primary"
          >
            {snap.body}
          </motion.div>
          {/* Faux content lines */}
          <div className="mt-3 space-y-1.5">
            <div
              className="h-1.5 w-3/4 rounded bg-mem-border"
              style={{ opacity: 0.4 + pct * 0.5 }}
            />
            <div
              className="h-1.5 w-1/2 rounded bg-mem-border"
              style={{ opacity: 0.3 + pct * 0.5 }}
            />
          </div>
          {/* "older = darker" overlay */}
          {!reduced ? (
            <div
              className="pointer-events-none absolute inset-0 bg-black"
              style={{ opacity: dimAmount * 0.25 }}
              aria-hidden="true"
            />
          ) : null}
        </div>

        {/* Scrubber bar */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-mem-text-muted">
            <span>30 days ago</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {snap.label}
            </span>
            <span>Today</span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-mem-border">
            <div
              className="h-full rounded-full bg-gradient-to-r from-mem-accent/50 to-mem-accent transition-[width] duration-75"
              style={{ width: `${pct * 100}%` }}
            />
          </div>
          {/* Animated thumb */}
          <div className="relative mt-[-9px] h-4">
            <motion.div
              className="absolute top-0 h-4 w-4 rounded-full border-2 border-mem-accent bg-white shadow"
              style={{ left: `calc(${pct * 100}% - 8px)` }}
              aria-hidden="true"
              animate={
                reduced
                  ? {}
                  : { scale: [1, 1.12, 1] }
              }
              transition={
                reduced
                  ? {}
                  : { duration: 1.6, ease: "easeInOut", repeat: Infinity }
              }
            />
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-mem-text-muted">
            <Rewind className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Watch the demo, or pop back to /jarvis/memory to try it for real.</span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={onNext}
          className="bg-mem-accent text-white hover:bg-mem-accent/90"
        >
          Cool, what&apos;s next?
        </Button>
      </div>
    </div>
  )
}
