"use client"

// Welcome wizard — 7-step modal that walks a first-time visitor through
// pinning a persona, connecting an MCP, learning ⌘K, setting a token
// budget, trying the time-machine demo, and landing on a "you're set"
// state with three next-action cards.
//
// The wizard is fully skippable at every step. The skip and complete
// states are tracked separately by the trigger component so we can show
// different messaging later if the user comes back via Help.
//
// Mobile (<md): the dialog goes full-screen so even the densest steps
// (persona grid, budget slider) have room to breathe on a 375px viewport.

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { JARVIS_EASE, prefersReducedMotion } from "@/components/jarvis/motion/presets"
import { StepIntro } from "./steps/step-intro"
import { StepPersona } from "./steps/step-persona"
import { StepMcp } from "./steps/step-mcp"
import { StepCmdk } from "./steps/step-cmdk"
import { StepBudget } from "./steps/step-budget"
import { StepTimeMachine } from "./steps/step-time-machine"
import { StepDone } from "./steps/step-done"

export const TOTAL_STEPS = 7

export interface WelcomeWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
  onSkip: () => void
}

const STEP_TITLES: ReadonlyArray<string> = [
  "Welcome to Jarvis Space",
  "Pin a persona",
  "Connect your first MCP",
  "Try Cmd+K",
  "Set your token budget",
  "Try the Time Machine",
  "You're set",
]

export function WelcomeWizard({
  open,
  onOpenChange,
  onComplete,
  onSkip,
}: WelcomeWizardProps): JSX.Element {
  const [step, setStep] = useState<number>(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const reduced = prefersReducedMotion()

  // Reset to step 0 each time the wizard is opened so re-opens always start
  // at the intro.
  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  const next = useCallback((): void => {
    setDirection(1)
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  }, [])

  const back = useCallback((): void => {
    setDirection(-1)
    setStep((s) => Math.max(s - 1, 0))
  }, [])

  const finish = useCallback((): void => {
    onComplete()
  }, [onComplete])

  const skip = useCallback((): void => {
    onSkip()
  }, [onSkip])

  const stepNode = useMemo(() => {
    switch (step) {
      case 0:
        return <StepIntro onNext={next} onSkip={skip} />
      case 1:
        return <StepPersona onNext={next} />
      case 2:
        return <StepMcp onNext={next} />
      case 3:
        return <StepCmdk onNext={next} />
      case 4:
        return <StepBudget onNext={next} />
      case 5:
        return <StepTimeMachine onNext={next} />
      case 6:
        return <StepDone onFinish={finish} />
      default:
        return null
    }
  }, [step, next, skip, finish])

  const slideVariants = {
    initial: (dir: 1 | -1) => ({
      opacity: 0,
      x: reduced ? 0 : dir * 24,
    }),
    animate: { opacity: 1, x: 0 },
    exit: (dir: 1 | -1) => ({
      opacity: 0,
      x: reduced ? 0 : dir * -24,
    }),
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogContent
          className={cn(
            // Mobile: full-screen takeover. md+: centered card.
            "fixed left-0 top-0 z-50 grid h-full w-full translate-x-0 translate-y-0 gap-0 border-0 bg-mem-surface p-0 text-mem-text-primary shadow-2xl outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "md:left-1/2 md:top-1/2 md:h-auto md:max-h-[90vh] md:w-full md:max-w-2xl md:translate-x-[-50%] md:translate-y-[-50%] md:rounded-2xl md:border md:border-mem-border",
          )}
          // Disable Radix's "click-outside / Escape" auto-close — the user
          // must explicitly Skip or Finish so progress isn't lost by accident.
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          aria-describedby="jarvis-welcome-desc"
        >
          {/* Visually-hidden a11y title — each step renders its own visible
              heading, but Radix requires a DialogTitle inside DialogContent. */}
          <DialogTitle className="sr-only">{STEP_TITLES[step]}</DialogTitle>
          <DialogDescription id="jarvis-welcome-desc" className="sr-only">
            Step {step + 1} of {TOTAL_STEPS}. Welcome to Jarvis Space.
          </DialogDescription>

          {/* Header bar — progress + skip */}
          <div className="flex items-center justify-between border-b border-mem-border px-5 py-4 md:px-6">
            <div className="flex items-center gap-3">
              <ProgressDots current={step} total={TOTAL_STEPS} />
              <span className="text-xs text-mem-text-muted">
                {step + 1} / {TOTAL_STEPS}
              </span>
            </div>
            <button
              type="button"
              onClick={skip}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-mem-text-muted transition-colors hover:bg-mem-surface-2 hover:text-mem-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-mem-accent"
              aria-label="Skip welcome wizard"
            >
              Skip
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Slide stage */}
          <div className="relative flex-1 overflow-y-auto">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={step}
                custom={direction}
                variants={slideVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: reduced ? 0 : 0.22, ease: JARVIS_EASE }}
                className="px-5 py-6 md:px-10 md:py-10"
              >
                {stepNode}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer bar — back/forward (hidden on first + last step) */}
          {step > 0 && step < TOTAL_STEPS - 1 ? (
            <div className="flex items-center justify-between border-t border-mem-border px-5 py-4 md:px-6">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={back}
                className="text-mem-text-muted"
                aria-label="Go to previous step"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={next}
                className="bg-mem-accent text-white hover:bg-mem-accent/90"
                aria-label="Go to next step"
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/*                                Progress dots                                */
/* -------------------------------------------------------------------------- */

interface ProgressDotsProps {
  current: number
  total: number
}

function ProgressDots({ current, total }: ProgressDotsProps): JSX.Element {
  return (
    <div className="flex items-center gap-1.5" role="progressbar" aria-valuenow={current + 1} aria-valuemin={1} aria-valuemax={total}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i === current
              ? "w-6 bg-mem-accent"
              : i < current
                ? "w-1.5 bg-mem-accent/60"
                : "w-1.5 bg-mem-border",
          )}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}
