"use client"

// Step 2 — Pin a persona.
// Fetches /api/personas, shows up to 4 cards. Click a card to pin (calls
// /api/personas with action: "set_default"). Once pinned, the Continue
// button becomes the primary action.
//
// We show 4 cards max so the grid stays readable on a 375 viewport. If the
// API returns 0 personas, we show a friendly empty state and a "Continue"
// button that just advances to the next step.

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Persona } from "@/lib/api/memory"
import { JARVIS_EASE, prefersReducedMotion } from "@/components/jarvis/motion/presets"

export interface StepPersonaProps {
  onNext: () => void
}

export function StepPersona({ onNext }: StepPersonaProps): JSX.Element {
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [pinningId, setPinningId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const reduced = prefersReducedMotion()

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const r = await fetch("/api/personas", { cache: "no-store" })
        const json = (await r.json()) as { data?: Persona[]; error?: string }
        if (cancelled) return
        if (!r.ok) {
          setError(json.error ?? "Could not load personas")
          setPersonas([])
          return
        }
        const list = Array.isArray(json.data) ? json.data.slice(0, 4) : []
        setPersonas(list)
        const def = list.find((p) => p.is_default)
        if (def) setPinnedId(def.id)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "Could not load personas")
        setPersonas([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  async function pinPersona(id: string): Promise<void> {
    setPinningId(id)
    try {
      const r = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_default", id }),
      })
      if (r.ok) {
        setPinnedId(id)
      }
    } catch {
      /* swallow — non-blocking */
    } finally {
      setPinningId(null)
    }
  }

  return (
    <div className="flex flex-col">
      <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
        Pin a persona
      </h2>
      <p className="mt-2 max-w-lg text-sm text-mem-text-muted">
        Personas shape how Jarvis writes and decides. Pick one as your default —
        you can switch any time from the header.
      </p>

      <div className="mt-6 min-h-[180px]">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-mem-text-muted">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="text-sm">Loading personas…</span>
          </div>
        ) : error && (!personas || personas.length === 0) ? (
          <EmptyPersonaState message={error} />
        ) : !personas || personas.length === 0 ? (
          <EmptyPersonaState />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {personas.map((p, idx) => {
              const isPinned = pinnedId === p.id
              const isPinning = pinningId === p.id
              return (
                <motion.button
                  key={p.id}
                  type="button"
                  onClick={() => void pinPersona(p.id)}
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: reduced ? 0 : 0.22,
                    ease: JARVIS_EASE,
                    delay: reduced ? 0 : idx * 0.04,
                  }}
                  className={cn(
                    "group relative flex items-start gap-3 rounded-xl border bg-mem-surface-2 p-4 text-left transition-all",
                    "hover:border-mem-accent/60 hover:bg-mem-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mem-accent",
                    isPinned
                      ? "border-mem-accent bg-mem-accent/10"
                      : "border-mem-border",
                  )}
                  aria-pressed={isPinned}
                  aria-label={`Pin ${p.name} as your default persona`}
                  disabled={isPinning}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mem-surface text-xl"
                    aria-hidden="true"
                  >
                    {p.emoji || "🤖"}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2 text-sm font-medium text-mem-text-primary">
                      <span className="truncate">{p.name}</span>
                      {isPinned ? (
                        <Check
                          className="h-3.5 w-3.5 shrink-0 text-mem-accent"
                          aria-hidden="true"
                        />
                      ) : null}
                    </span>
                    {p.description ? (
                      <span className="mt-0.5 line-clamp-2 text-xs text-mem-text-muted">
                        {p.description}
                      </span>
                    ) : null}
                  </span>
                  {isPinning ? (
                    <Loader2
                      className="absolute right-3 top-3 h-3.5 w-3.5 animate-spin text-mem-text-muted"
                      aria-hidden="true"
                    />
                  ) : null}
                </motion.button>
              )
            })}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={onNext}
          className="bg-mem-accent text-white hover:bg-mem-accent/90"
        >
          {pinnedId ? "Continue" : "Skip this"}
        </Button>
      </div>
    </div>
  )
}

function EmptyPersonaState({ message }: { message?: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-dashed border-mem-border bg-mem-surface-2 p-6 text-center">
      <p className="text-sm font-medium text-mem-text-primary">
        No personas yet
      </p>
      <p className="mt-1 text-xs text-mem-text-muted">
        {message ??
          "Create one later from /jarvis/memory. We'll skip this step for now."}
      </p>
    </div>
  )
}
