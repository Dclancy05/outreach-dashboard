"use client"

/**
 * ManualStepBuilder — Tier 1 of the recording flow.
 *
 * Lets the user define an automation's steps WITHOUT recording in the
 * browser. They pick a step kind, fill the relevant fields, and the
 * builder produces the same `steps[]` JSONB shape the existing
 * /api/recordings/self-test replay engine consumes.
 *
 * Step shape (matches src/app/api/recordings/self-test/route.ts:30-36):
 *   {
 *     type: "navigate" | "click" | "type" | "wait" | "press_key" | "extract"
 *     selectors: string[]              (CSS selectors, tried in order)
 *     fallback_text?: string           (text to match if selectors fail)
 *     fallback_coordinates?: {x,y}     (last-resort click position)
 *     params: Record<string, unknown>  (per-kind extra fields: url, value, ms, key)
 *   }
 *
 * The replay engine cycles through 5 strategies (original → text → shadow_dom
 * → xpath → coordinates) automatically, so a tier-1 user only has to fill
 * the most useful fields per step kind.
 *
 * Why "manual" not "recorded": the click-capture and continuous-recorder
 * tiers (2, 3) need VPS-side CDP work that's a separate phase. Tier 1 ships
 * a full working pipeline today by leaning on the user to know basic CSS
 * selectors. The "Copy from DevTools" hint nudges them toward that.
 */

import { useId, useMemo, useState } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  HelpCircle,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type StepKind = "navigate" | "click" | "type" | "wait" | "press_key" | "extract"

export interface ManualStep {
  id: string // local UI id; not persisted
  type: StepKind
  selectors: string[]
  fallback_text?: string
  fallback_coordinates?: { x: number; y: number }
  params: Record<string, unknown>
}

export interface ManualStepBuilderProps {
  initialSteps?: ManualStep[]
  onChange: (steps: ManualStep[]) => void
}

const KIND_INFO: Record<StepKind, { label: string; icon: string; hint: string }> = {
  navigate: {
    label: "Navigate",
    icon: "🔗",
    hint: "Open a URL. The first step of every automation is usually navigate.",
  },
  click: {
    label: "Click",
    icon: "👆",
    hint: "Click an element. CSS selector is preferred; fallback to visible text if the selector breaks.",
  },
  type: {
    label: "Type",
    icon: "⌨️",
    hint: "Type into a field. Use {{message}} or {{username}} to substitute campaign values.",
  },
  wait: {
    label: "Wait",
    icon: "⏱️",
    hint: "Pause for N milliseconds. Useful after navigate or before checking an element loaded.",
  },
  press_key: {
    label: "Press key",
    icon: "🎹",
    hint: "Send a keyboard key (Enter, Tab, Escape, ArrowDown, etc.) to the active element.",
  },
  extract: {
    label: "Extract",
    icon: "📋",
    hint: "Lead enrichment only — pull text from a selector and store it on the lead row.",
  },
}

function makeEmpty(type: StepKind = "navigate"): ManualStep {
  return {
    id: `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    selectors: [],
    params: {},
  }
}

export function ManualStepBuilder({ initialSteps, onChange }: ManualStepBuilderProps) {
  const reduced = useReducedMotion() ?? false
  const [steps, setSteps] = useState<ManualStep[]>(() => initialSteps?.length ? initialSteps : [makeEmpty()])
  const helpId = useId()

  function update(next: ManualStep[]) {
    setSteps(next)
    onChange(next)
  }

  function addStep(after?: number) {
    const idx = after ?? steps.length - 1
    const inserted = [
      ...steps.slice(0, idx + 1),
      makeEmpty(),
      ...steps.slice(idx + 1),
    ]
    update(inserted)
  }

  function removeStep(id: string) {
    if (steps.length === 1) return // never empty
    update(steps.filter((s) => s.id !== id))
  }

  function setStep(id: string, patch: Partial<ManualStep>) {
    update(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function setKind(id: string, kind: StepKind) {
    update(
      steps.map((s) =>
        s.id === id
          ? { ...s, type: kind, params: kind === "wait" ? { ms: 1000 } : kind === "press_key" ? { key: "Enter" } : {} }
          : s,
      ),
    )
  }

  function move(id: string, dir: -1 | 1) {
    const i = steps.findIndex((s) => s.id === id)
    if (i < 0) return
    const target = i + dir
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    ;[next[i], next[target]] = [next[target], next[i]]
    update(next)
  }

  return (
    <div className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Build steps</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Each step describes one thing the bot does on the platform.
            <button
              type="button"
              aria-describedby={helpId}
              onClick={() => {
                const el = document.getElementById(helpId)
                if (el) el.classList.toggle("hidden")
              }}
              className="ml-1 inline-flex items-center gap-0.5 text-violet-400 hover:underline"
            >
              <HelpCircle className="h-3 w-3" /> What's a selector?
            </button>
          </p>
          <p id={helpId} className="hidden mt-2 rounded border border-border/50 bg-muted/30 p-2 text-[11px] leading-relaxed text-muted-foreground">
            A CSS selector targets an element on the page. In Chrome DevTools, right-click the element →
            "Copy → Copy selector" gives you one. Examples:{" "}
            <code className="rounded bg-muted px-1">button[aria-label="Send"]</code>,{" "}
            <code className="rounded bg-muted px-1">a[href*="/messages"]</code>. The replay engine tries 5 fallback
            strategies if your selector breaks: original → text-based → shadow DOM → XPath → coordinates.
          </p>
        </div>
      </header>

      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {steps.map((step, idx) => (
            <motion.li
              key={step.id}
              initial={reduced ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className="rounded-lg border border-border/60 bg-card/40 p-3"
            >
              <div className="flex items-center gap-2">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Step {idx + 1}
                </span>

                <select
                  aria-label={`Step ${idx + 1} kind`}
                  value={step.type}
                  onChange={(e) => setKind(step.id, e.target.value as StepKind)}
                  className="ml-auto rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-foreground"
                >
                  {(Object.keys(KIND_INFO) as StepKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_INFO[k].icon} {KIND_INFO[k].label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  aria-label={`Move step ${idx + 1} up`}
                  disabled={idx === 0}
                  onClick={() => move(step.id, -1)}
                  className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label={`Move step ${idx + 1} down`}
                  disabled={idx === steps.length - 1}
                  onClick={() => move(step.id, 1)}
                  className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete step ${idx + 1}`}
                  disabled={steps.length === 1}
                  onClick={() => removeStep(step.id)}
                  className="rounded p-1 text-muted-foreground transition hover:bg-red-500/15 hover:text-red-400 disabled:opacity-30"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>

              {/* Per-kind fields */}
              <div className="mt-2 grid grid-cols-1 gap-2">
                <p className="text-[11px] text-muted-foreground">{KIND_INFO[step.type].hint}</p>

                {step.type === "navigate" ? (
                  <input
                    aria-label="Navigate URL"
                    type="url"
                    placeholder="https://www.instagram.com/{{username}}/"
                    value={(step.params.url as string) || ""}
                    onChange={(e) => setStep(step.id, { params: { ...step.params, url: e.target.value } })}
                    className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
                  />
                ) : null}

                {(step.type === "click" || step.type === "type" || step.type === "extract") ? (
                  <>
                    <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      CSS selectors (one per line — first is preferred, rest are fallbacks)
                    </label>
                    <textarea
                      aria-label="CSS selectors"
                      rows={2}
                      placeholder='button[aria-label="Send"]&#10;[data-testid="send-button"]'
                      value={(step.selectors || []).join("\n")}
                      onChange={(e) => setStep(step.id, { selectors: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) })}
                      className="rounded-md border border-border/60 bg-background px-2 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground"
                    />
                    <input
                      aria-label="Fallback text"
                      type="text"
                      placeholder="Visible text fallback (e.g. 'Send', 'Follow')"
                      value={step.fallback_text || ""}
                      onChange={(e) => setStep(step.id, { fallback_text: e.target.value || undefined })}
                      className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
                    />
                  </>
                ) : null}

                {step.type === "type" ? (
                  <input
                    aria-label="Value to type"
                    type="text"
                    placeholder="{{message}} (use {{username}}, {{first_name}}, {{message}}, {{target_url}})"
                    value={(step.params.value as string) || ""}
                    onChange={(e) => setStep(step.id, { params: { ...step.params, value: e.target.value } })}
                    className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
                  />
                ) : null}

                {step.type === "wait" ? (
                  <input
                    aria-label="Wait milliseconds"
                    type="number"
                    min={100}
                    step={100}
                    placeholder="1000"
                    value={Number(step.params.ms || 1000)}
                    onChange={(e) => setStep(step.id, { params: { ...step.params, ms: Number(e.target.value) || 1000 } })}
                    className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground w-32"
                  />
                ) : null}

                {step.type === "press_key" ? (
                  <select
                    aria-label="Key to press"
                    value={(step.params.key as string) || "Enter"}
                    onChange={(e) => setStep(step.id, { params: { ...step.params, key: e.target.value } })}
                    className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground"
                  >
                    {["Enter", "Tab", "Escape", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                ) : null}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <button
        type="button"
        onClick={() => addStep()}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-border/60 bg-card/30 px-3 py-2 text-xs text-muted-foreground transition hover:border-violet-500/50 hover:bg-violet-500/5 hover:text-violet-300"
      >
        <Plus className="h-3 w-3" /> Add step
      </button>

      <p className="rounded-md border border-violet-500/30 bg-violet-500/5 p-2 text-[11px] text-muted-foreground">
        <Wand2 className="mr-1 inline h-3 w-3 text-violet-400" />
        After saving, the replay engine will run a self-test against a Dummy account to verify the steps work.
        If a selector breaks, the fallback strategies (text → XPath → coordinates) try to recover automatically.
      </p>
    </div>
  )
}

/**
 * Convert UI-shaped steps to the wire format expected by /api/automations
 * (drops the local `id`, normalizes structure).
 */
export function toWireSteps(steps: ManualStep[]) {
  return steps.map((s) => ({
    type: s.type,
    selectors: s.selectors,
    fallback_text: s.fallback_text,
    fallback_coordinates: s.fallback_coordinates,
    params: s.params,
  }))
}
