"use client"

// Step 5 — Set token budget.
// Slider 0–8000 (step 250). Persists to localStorage so the wizard's value
// is remembered. We do NOT call /api/memory-settings here because that
// requires a business_id and the wizard runs at workspace scope. The
// settings panel inside /jarvis/settings is where the canonical save
// happens; this step just sets a starting preference.

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Coins, Zap } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { JARVIS_EASE, prefersReducedMotion } from "@/components/jarvis/motion/presets"

const STORAGE_KEY = "jarvis.welcome_token_budget"
const MIN_BUDGET = 0
const MAX_BUDGET = 8000
const STEP = 250
const DEFAULT_BUDGET = 2000

export interface StepBudgetProps {
  onNext: () => void
}

interface BudgetTier {
  threshold: number
  label: string
  description: string
}

const TIERS: ReadonlyArray<BudgetTier> = [
  { threshold: 1000, label: "Light", description: "Quick context, lower cost." },
  {
    threshold: 3000,
    label: "Balanced",
    description: "Most common pick — plenty of room to remember.",
  },
  {
    threshold: 6000,
    label: "Generous",
    description: "Heavy context for long projects.",
  },
  {
    threshold: MAX_BUDGET + 1,
    label: "Max",
    description: "Use everything Jarvis can pull.",
  },
]

function tierFor(value: number): BudgetTier {
  for (const t of TIERS) if (value < t.threshold) return t
  return TIERS[TIERS.length - 1]
}

export function StepBudget({ onNext }: StepBudgetProps): JSX.Element {
  const [budget, setBudget] = useState<number>(DEFAULT_BUDGET)
  const reduced = prefersReducedMotion()

  // Load any previously-saved value (so re-opening the wizard remembers).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw !== null) {
        const n = Number.parseInt(raw, 10)
        if (Number.isFinite(n) && n >= MIN_BUDGET && n <= MAX_BUDGET) {
          setBudget(n)
        }
      }
    } catch {
      /* ignore */
    }
  }, [])

  function handleChange(v: number[]): void {
    const next = v[0] ?? DEFAULT_BUDGET
    setBudget(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      /* ignore */
    }
  }

  const tier = tierFor(budget)
  const pct = Math.round((budget / MAX_BUDGET) * 100)

  return (
    <div className="flex flex-col">
      <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
        Set your token budget
      </h2>
      <p className="mt-2 max-w-lg text-sm text-mem-text-muted">
        How much memory context Jarvis pulls into each prompt. More tokens =
        smarter answers but higher cost.
      </p>

      {/* Big readout */}
      <motion.div
        key={tier.label}
        initial={reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.18, ease: JARVIS_EASE }}
        className="mt-6 rounded-xl border border-mem-border bg-mem-surface-2 p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-mem-accent" aria-hidden="true" />
            <span className="text-xs font-medium uppercase tracking-wider text-mem-text-muted">
              {tier.label}
            </span>
          </div>
          <span className="font-mono text-3xl font-semibold tabular-nums text-mem-text-primary md:text-4xl">
            {budget.toLocaleString()}
            <span className="ml-1 text-xs font-normal text-mem-text-muted">
              tokens
            </span>
          </span>
        </div>
        <p className="mt-1 text-xs text-mem-text-muted">{tier.description}</p>

        <div className="mt-5">
          <Slider
            value={[budget]}
            min={MIN_BUDGET}
            max={MAX_BUDGET}
            step={STEP}
            onValueChange={handleChange}
            aria-label="Token budget"
          />
          <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wider text-mem-text-muted">
            <span>0</span>
            <span>{Math.round(MAX_BUDGET / 2).toLocaleString()}</span>
            <span>{MAX_BUDGET.toLocaleString()}</span>
          </div>
        </div>

        {/* Visual bar reinforcement */}
        <div className="mt-4 flex items-center gap-2 text-xs text-mem-text-muted">
          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pct}% of max — adjust later in Settings.</span>
        </div>
      </motion.div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="inline-flex h-9 items-center justify-center rounded-md bg-mem-accent px-4 text-sm font-medium text-white shadow transition-colors hover:bg-mem-accent/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-mem-accent"
        >
          Save and continue
        </button>
      </div>
    </div>
  )
}
