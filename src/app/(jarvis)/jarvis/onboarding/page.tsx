"use client"

/**
 * /jarvis/onboarding — full-page entry to the welcome tour.
 *
 * The wizard normally auto-pops as a modal on first visit (driven by
 * WelcomeWizardTrigger in the layout). This route gives users an explicit
 * "open the tour again" URL — useful when they dismissed it the first time
 * and want to revisit, or want to share the link with a teammate.
 *
 * Closing the wizard navigates back to /jarvis (home), not back in history,
 * so a deep-linked open works cleanly.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { Sparkles, ArrowRight, RotateCcw } from "lucide-react"
import { WelcomeWizard } from "@/components/jarvis/onboarding/welcome-wizard"
import { enterJarvis } from "@/components/jarvis/motion/presets"

export default function JarvisOnboardingPage() {
  const router = useRouter()
  const reduced = useReducedMotion() ?? false
  const [open, setOpen] = useState(true)

  function handleClose() {
    setOpen(false)
    // Send the user home rather than wherever they came from — back in
    // history might be /jarvis/onboarding itself in a refresh case.
    setTimeout(() => router.push("/jarvis"), 50)
  }

  function handleComplete() {
    setOpen(false)
    setTimeout(() => router.push("/jarvis"), 50)
  }

  return (
    <motion.div {...enterJarvis} className="mx-auto w-full max-w-[720px]">
      {/* Behind-the-modal landing in case the wizard is dismissed */}
      <div className="rounded-xl border border-mem-border bg-mem-surface-1 p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-mem-accent" />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">WELCOME</p>
        </div>
        <h1 className="mt-2 text-2xl font-medium text-mem-text-primary">Get started with Jarvis</h1>
        <p className="mt-2 text-sm text-mem-text-secondary">
          The 7-step tour walks you through picking a persona, connecting an MCP, learning ⌘K,
          setting a token budget, the Time Machine demo, and a "what next" card.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-mem-accent px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-white transition hover:bg-mem-accent/90"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {open ? "Tour open" : "Replay tour"}
          </button>
          <Link
            href="/jarvis"
            className="group inline-flex items-center gap-1.5 rounded-md border border-mem-border bg-mem-surface-2 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-mem-text-secondary transition hover:bg-mem-surface-3 hover:text-mem-text-primary"
          >
            Skip to home
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { title: "Memory vault", hint: "Markdown tree of every doc + plan", href: "/jarvis/memory" },
            { title: "Agents", hint: "Define + schedule + run", href: "/jarvis/agents" },
            { title: "Cost dashboard", hint: "Spend vs daily cap", href: "/jarvis/cost" },
          ].map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-lg border border-mem-border bg-mem-surface-2 p-3 transition hover:border-mem-accent/40 hover:bg-mem-surface-3"
            >
              <p className="text-sm font-medium text-mem-text-primary">{c.title}</p>
              <p className="mt-0.5 text-[11px] text-mem-text-secondary">{c.hint}</p>
            </Link>
          ))}
        </div>
      </div>

      <WelcomeWizard
        open={open}
        onOpenChange={setOpen}
        onSkip={handleClose}
        onComplete={handleComplete}
      />
    </motion.div>
  )
}
