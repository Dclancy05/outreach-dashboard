"use client"

// Step 1 — Intro.
// Animated ✦ logo (gentle pulse, frozen on reduced-motion), heading, two
// CTAs: "Skip" and "Start tour".

import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { JARVIS_EASE, prefersReducedMotion } from "@/components/jarvis/motion/presets"

export interface StepIntroProps {
  onNext: () => void
  onSkip: () => void
}

export function StepIntro({ onNext, onSkip }: StepIntroProps): JSX.Element {
  const reduced = prefersReducedMotion()

  return (
    <div className="flex flex-col items-center text-center">
      {/* Animated logo */}
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center md:h-28 md:w-28">
        {!reduced ? (
          <>
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full bg-mem-accent/20 blur-xl"
              animate={{ scale: [1, 1.15, 1], opacity: [0.55, 0.85, 0.55] }}
              transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
            />
            <motion.span
              aria-hidden
              className="absolute inset-2 rounded-full border border-mem-accent/40"
              animate={{ rotate: 360 }}
              transition={{ duration: 24, ease: "linear", repeat: Infinity }}
            />
          </>
        ) : null}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduced ? 0 : 0.4, ease: JARVIS_EASE }}
          className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-mem-accent to-mem-accent/60 shadow-lg shadow-mem-accent/30 md:h-20 md:w-20"
        >
          <Sparkles className="h-8 w-8 text-white md:h-9 md:w-9" aria-hidden="true" />
        </motion.div>
      </div>

      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
        Welcome to Jarvis Space
      </h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-mem-text-muted md:text-base">
        Your AI workspace for memory, agents, and tools. We&apos;ll show you the
        ropes in 60 seconds — six quick steps, no setup pain.
      </p>

      <div className="mt-8 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onSkip}
          className="sm:order-1"
        >
          Skip for now
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={onNext}
          className="bg-mem-accent text-white hover:bg-mem-accent/90 sm:order-2"
        >
          Start tour
        </Button>
      </div>

      <p className="mt-6 text-[11px] text-mem-text-muted">
        Takes about a minute. You can re-open this from Help anytime.
      </p>
    </div>
  )
}
