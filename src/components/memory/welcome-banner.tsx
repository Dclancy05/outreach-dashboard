"use client"
/**
 * Welcome banner shown above the page header on first /agency/memory visit.
 * Self-dismisses to localStorage; never reappears once dismissed.
 *
 * Production copy: speaks to Dylan (real product, not a demo).
 */
import * as React from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { X, ArrowRight, Brain } from "lucide-react"

const STORAGE_KEY = "memory.welcome.dismissed.v2"

export function WelcomeBanner() {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(STORAGE_KEY) === "1"
      setVisible(!dismissed)
    } catch {
      setVisible(true)
    }
  }, [])

  function dismiss() {
    setVisible(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, "1")
    } catch {
      /* ignore */
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="mx-3 sm:mx-6 mt-3 mb-2 rounded-xl border border-mem-border bg-gradient-to-b from-mem-surface-2 to-mem-surface-1 px-4 sm:px-5 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4"
          role="region"
          aria-label="Welcome"
        >
          <div className="shrink-0 h-10 w-10 rounded-lg bg-mem-surface-3 border border-mem-border grid place-items-center">
            <Brain size={18} className="text-mem-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] sm:text-[14px] text-mem-text-primary leading-snug">
              This is your knowledge brain. Notes, plans, code — every doc your AI reads lives here.
              Open a file in the tree, or spawn a Claude session in{" "}
              <span className="text-mem-text-primary font-semibold">Terminals</span>.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <Link
              href="/agency/terminals"
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg bg-mem-accent text-white text-[12px] sm:text-[13px] font-semibold hover:brightness-110 hover:shadow-[0_0_24px_rgba(124,92,255,0.3)] transition-all"
            >
              Start a session
              <ArrowRight size={14} />
            </Link>
            <button
              onClick={dismiss}
              aria-label="Dismiss welcome"
              className="h-8 w-8 grid place-items-center rounded-lg text-mem-text-muted hover:text-mem-text-primary hover:bg-mem-surface-3 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
