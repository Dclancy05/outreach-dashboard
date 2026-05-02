"use client"

// Step 4 — Try Cmd+K.
// Animated keystroke hint that pulses ⌘ + K. The "Try it" button opens the
// Jarvis command palette in-place via the existing useJarvisCmdk hook.
//
// We listen for the actual Cmd+K / Ctrl+K keystroke too — if the user
// triggers it themselves, we mark the step as "done" so the encouragement
// text changes.

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Check, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useJarvisCmdk } from "@/components/jarvis/shell/jarvis-cmdk-stub"
import { JARVIS_EASE, prefersReducedMotion } from "@/components/jarvis/motion/presets"

export interface StepCmdkProps {
  onNext: () => void
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

export function StepCmdk({ onNext }: StepCmdkProps): JSX.Element {
  const { setOpen } = useJarvisCmdk()
  const [tried, setTried] = useState<boolean>(false)
  const [isMac, setIsMac] = useState<boolean>(true)
  const reduced = prefersReducedMotion()

  useEffect(() => {
    setIsMac(isMacPlatform())
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const trigger = isMac ? e.metaKey : e.ctrlKey
      if (trigger && e.key.toLowerCase() === "k" && !e.shiftKey) {
        setTried(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isMac])

  function handleTry(): void {
    setTried(true)
    setOpen(true)
  }

  const modKey = isMac ? "⌘" : "Ctrl"

  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
        Try {modKey}+K
      </h2>
      <p className="mt-2 max-w-md text-sm text-mem-text-muted">
        Jump to anything in Jarvis instantly — pages, memories, agents,
        workflows. It&apos;s the fastest way to get around.
      </p>

      {/* Animated keystroke hint */}
      <div className="mt-8 flex items-center gap-3">
        <KeystrokeKey label={modKey} reduced={reduced} delay={0} />
        <motion.span
          className="text-mem-text-muted"
          aria-hidden="true"
          animate={reduced ? {} : { opacity: [0.5, 1, 0.5] }}
          transition={
            reduced
              ? {}
              : { duration: 1.6, ease: "easeInOut", repeat: Infinity }
          }
        >
          +
        </motion.span>
        <KeystrokeKey label="K" reduced={reduced} delay={0.4} />
      </div>

      {/* Fake palette preview */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.3, ease: JARVIS_EASE, delay: 0.2 }}
        className="mt-8 w-full max-w-md rounded-xl border border-mem-border bg-mem-surface-2 p-3 text-left shadow-lg"
      >
        <div className="flex items-center gap-2 rounded-md bg-mem-bg px-3 py-2.5 text-sm text-mem-text-muted">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="flex-1 truncate">Search or jump to anything…</span>
          <kbd className="rounded border border-mem-border bg-mem-surface-2 px-1.5 py-0.5 font-mono text-[10px] tracking-wider">
            {modKey}K
          </kbd>
        </div>
      </motion.div>

      <div className="mt-8 flex w-full flex-col items-center gap-3">
        <Button
          type="button"
          size="lg"
          onClick={handleTry}
          className="bg-mem-accent text-white hover:bg-mem-accent/90"
        >
          {tried ? (
            <>
              <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Open palette
            </>
          ) : (
            "Try it now"
          )}
        </Button>
        {tried ? (
          <p className="text-xs text-mem-text-muted">
            Nice. Use {modKey}+K from anywhere in Jarvis to open it again.
          </p>
        ) : (
          <p className="text-xs text-mem-text-muted">
            Press {modKey}+K, or click the button.
          </p>
        )}
        <button
          type="button"
          onClick={onNext}
          className="mt-2 text-xs text-mem-text-muted underline-offset-2 hover:text-mem-text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-mem-accent"
        >
          Got it — next
        </button>
      </div>
    </div>
  )
}

interface KeystrokeKeyProps {
  label: string
  reduced: boolean
  delay: number
}

function KeystrokeKey({ label, reduced, delay }: KeystrokeKeyProps): JSX.Element {
  return (
    <motion.kbd
      className="flex h-14 w-14 items-center justify-center rounded-xl border border-mem-border bg-mem-surface-2 font-mono text-xl font-semibold text-mem-text-primary shadow-md md:h-16 md:w-16 md:text-2xl"
      animate={
        reduced
          ? {}
          : {
              y: [0, -4, 0, 0, 0],
              boxShadow: [
                "0 4px 8px rgba(0,0,0,0.2)",
                "0 1px 2px rgba(0,0,0,0.3)",
                "0 4px 8px rgba(0,0,0,0.2)",
                "0 4px 8px rgba(0,0,0,0.2)",
                "0 4px 8px rgba(0,0,0,0.2)",
              ],
            }
      }
      transition={
        reduced
          ? {}
          : {
              duration: 1.6,
              ease: "easeInOut",
              repeat: Infinity,
              repeatDelay: 0.4,
              delay,
            }
      }
    >
      {label}
    </motion.kbd>
  )
}
