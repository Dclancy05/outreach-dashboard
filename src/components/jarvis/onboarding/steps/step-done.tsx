"use client"

// Step 7 — You're set.
// Confetti burst (capped at 30 particles, framer-motion animated, plays
// once) and three "next action" cards: Open Memory · Spawn Terminal ·
// Browse MCPs. Reduced motion: skip confetti entirely.

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowRight, BookOpen, PartyPopper, Plug, TerminalSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { JARVIS_EASE, prefersReducedMotion } from "@/components/jarvis/motion/presets"

export interface StepDoneProps {
  onFinish: () => void
}

interface NextAction {
  href: string
  title: string
  description: string
  icon: typeof BookOpen
}

const ACTIONS: ReadonlyArray<NextAction> = [
  {
    href: "/jarvis/memory",
    title: "Open Memory",
    description: "Edit your vault, add new memories, browse personas.",
    icon: BookOpen,
  },
  {
    href: "/jarvis/terminals",
    title: "Spawn a Terminal",
    description: "Open a real Claude Code session right inside Jarvis.",
    icon: TerminalSquare,
  },
  {
    href: "/jarvis/mcps",
    title: "Browse MCPs",
    description: "Hook up more tools — Supabase, Slack, and more.",
    icon: Plug,
  },
]

const PARTICLE_COUNT = 30

interface Particle {
  id: number
  x: number
  y: number
  rotate: number
  color: string
  delay: number
  size: number
}

const PALETTE: ReadonlyArray<string> = [
  "#7c5cff", // violet/accent
  "#22d3ee", // cyan
  "#f472b6", // pink
  "#facc15", // yellow
  "#34d399", // green
]

function buildParticles(): ReadonlyArray<Particle> {
  const out: Particle[] = []
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Fan out across the upper hemisphere with slight randomness.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.85
    const dist = 120 + Math.random() * 160
    out.push({
      id: i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      rotate: (Math.random() - 0.5) * 720,
      color: PALETTE[i % PALETTE.length] ?? PALETTE[0]!,
      delay: Math.random() * 0.12,
      size: 6 + Math.random() * 6,
    })
  }
  return out
}

export function StepDone({ onFinish }: StepDoneProps): JSX.Element {
  const reduced = prefersReducedMotion()
  const [showConfetti, setShowConfetti] = useState<boolean>(false)
  const particles = useMemo<ReadonlyArray<Particle>>(buildParticles, [])

  useEffect(() => {
    if (reduced) return
    // Tiny delay so the slide-in finishes first.
    const id = window.setTimeout(() => setShowConfetti(true), 80)
    return () => window.clearTimeout(id)
  }, [reduced])

  return (
    <div className="flex flex-col items-center text-center">
      {/* Confetti origin point */}
      <div className="relative mb-2 flex h-20 w-20 items-center justify-center">
        {!reduced && showConfetti
          ? particles.map((p) => (
              <motion.span
                key={p.id}
                aria-hidden="true"
                className="absolute left-1/2 top-1/2 block rounded-sm"
                style={{
                  width: p.size,
                  height: p.size * 0.4,
                  backgroundColor: p.color,
                }}
                initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                animate={{
                  x: p.x,
                  y: p.y,
                  rotate: p.rotate,
                  opacity: 0,
                }}
                transition={{
                  duration: 1.2 + Math.random() * 0.4,
                  ease: JARVIS_EASE,
                  delay: p.delay,
                }}
              />
            ))
          : null}

        <motion.div
          initial={reduced ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: reduced ? 0 : 0.32, ease: JARVIS_EASE }}
          className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-mem-accent to-mem-accent/60 shadow-lg shadow-mem-accent/30"
        >
          <PartyPopper className="h-8 w-8 text-white" aria-hidden="true" />
        </motion.div>
      </div>

      <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
        You&apos;re set
      </h2>
      <p className="mt-2 max-w-md text-sm text-mem-text-muted md:text-base">
        Jarvis is ready. Pick a place to start — you can always come back to
        this tour from the Help menu.
      </p>

      {/* Next-action cards */}
      <ul className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
        {ACTIONS.map((action, idx) => {
          const Icon = action.icon
          return (
            <motion.li
              key={action.href}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduced ? 0 : 0.24,
                ease: JARVIS_EASE,
                delay: reduced ? 0 : 0.1 + idx * 0.06,
              }}
            >
              <Link
                href={action.href}
                onClick={onFinish}
                className="group flex h-full flex-col items-start gap-2 rounded-xl border border-mem-border bg-mem-surface-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-mem-accent/60 hover:bg-mem-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mem-accent"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-mem-accent/10 text-mem-accent">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold text-mem-text-primary">
                  {action.title}
                </span>
                <span className="text-xs text-mem-text-muted">
                  {action.description}
                </span>
                <span className="mt-auto inline-flex items-center text-[11px] font-medium text-mem-accent opacity-0 transition-opacity group-hover:opacity-100">
                  Open
                  <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
                </span>
              </Link>
            </motion.li>
          )
        })}
      </ul>

      <div className="mt-8">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onFinish}
          className="text-mem-text-muted"
        >
          Close and explore
        </Button>
      </div>
    </div>
  )
}
