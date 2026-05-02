"use client"

/**
 * VariableAutocomplete — popover dropdown for inserting `{{tokens}}`
 * into a textarea.
 *
 * Built for the Automations step editor (Slice 3 of the W4B spec push).
 * Wraps a regular <textarea>: when the user types `{{` (or `{`), a
 * dropdown of available tokens appears. Arrow keys navigate, Enter
 * inserts, Escape dismisses. Supports both single- and double-brace
 * styles — whichever the user already typed.
 *
 * The variable catalog is sourced from
 * `@/lib/jarvis/automation-variables` so every consumer gets the same
 * canonical token list.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AUTOMATION_VARIABLES,
  filterAutomationVariables,
  type AutomationVariable,
} from "@/lib/jarvis/automation-variables"

type BraceStyle = "single" | "double"

interface VariableAutocompleteProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  rows?: number
  className?: string
  disabled?: boolean
  id?: string
  /** Override the catalog; defaults to AUTOMATION_VARIABLES. */
  variables?: AutomationVariable[]
  /** Force a specific brace style. Defaults to whichever the user types. */
  preferredStyle?: BraceStyle
}

export function VariableAutocomplete({
  value,
  onChange,
  placeholder,
  rows = 4,
  className,
  disabled,
  id,
  variables = AUTOMATION_VARIABLES,
  preferredStyle,
}: VariableAutocompleteProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<BraceStyle>(preferredStyle ?? "double")
  const [query, setQuery] = useState("")
  const [tokenStartPos, setTokenStartPos] = useState(0)
  const [highlight, setHighlight] = useState(0)

  const filtered = useMemo(
    () => filterAutomationVariables(query, variables),
    [variables, query]
  )

  // Reset highlight whenever the visible result set changes so we
  // don't end up pointing past the end of the list.
  useEffect(() => {
    setHighlight(0)
  }, [query, open])

  /**
   * Scan the text BEFORE the cursor and decide whether we're currently
   * inside an unclosed `{{foo` or `{foo` token. If we are, capture the
   * filter query and where the brace started so we can replace the
   * whole partial token on selection.
   */
  const evaluateTrigger = (textarea: HTMLTextAreaElement) => {
    const pos = textarea.selectionStart ?? textarea.value.length
    const before = textarea.value.slice(0, pos)

    // Prefer double-brace style — closer to spec.
    const doubleMatch = before.match(/\{\{([A-Za-z0-9_]*)$/)
    if (doubleMatch) {
      setStyle("double")
      setQuery(doubleMatch[1])
      setTokenStartPos(pos - doubleMatch[0].length)
      setOpen(true)
      return
    }
    // Single-brace fallback. Need to make sure the `{` isn't part of
    // an already-closed `{{...}}` — the `[^{]` lookbehind guards that.
    const singleMatch = before.match(/(^|[^{])\{([A-Za-z0-9_]*)$/)
    if (singleMatch) {
      setStyle("single")
      setQuery(singleMatch[2])
      setTokenStartPos(pos - (singleMatch[2].length + 1))
      setOpen(true)
      return
    }
    setOpen(false)
  }

  const insertVariable = (v: AutomationVariable) => {
    const textarea = ref.current
    if (!textarea) return
    const end = textarea.selectionStart ?? value.length
    const before = value.slice(0, tokenStartPos)
    const after = value.slice(end)
    const inserted =
      style === "double" ? `{{${v.name}}}` : `{${v.name}}`
    const next = before + inserted + after
    onChange(next)
    setOpen(false)
    // Restore caret position after the inserted token on next tick.
    requestAnimationFrame(() => {
      if (!ref.current) return
      const newCaret = (before + inserted).length
      ref.current.focus()
      ref.current.setSelectionRange(newCaret, newCaret)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlight((h) => Math.min(filtered.length - 1, h + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (filtered.length > 0) {
        e.preventDefault()
        insertVariable(filtered[highlight])
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <textarea
        id={id}
        ref={ref}
        value={value}
        disabled={disabled}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          // Re-evaluate AFTER the change has propagated so
          // selectionStart points to the new caret.
          requestAnimationFrame(() => {
            if (ref.current) evaluateTrigger(ref.current)
          })
        }}
        onKeyDown={handleKeyDown}
        onClick={() => {
          if (ref.current) evaluateTrigger(ref.current)
        }}
        onKeyUp={(e) => {
          if (
            e.key === "ArrowLeft" ||
            e.key === "ArrowRight" ||
            e.key === "Home" ||
            e.key === "End"
          ) {
            if (ref.current) evaluateTrigger(ref.current)
          }
        }}
        // Slight delay on blur so a click on a suggestion still
        // registers before the popup unmounts.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className={className}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-30 w-[340px] max-h-[260px] overflow-y-auto rounded-xl border border-border/60 bg-popover/95 backdrop-blur-xl shadow-2xl">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40 flex items-center justify-between">
            <span>Insert variable</span>
            <span className="text-muted-foreground/60">
              {style === "double" ? "{{…}}" : "{…}"}
            </span>
          </div>
          {filtered.map((v, i) => (
            <button
              key={v.name}
              type="button"
              // onMouseDown (not onClick) so we fire BEFORE the
              // textarea's onBlur tears the popup down.
              onMouseDown={(e) => {
                e.preventDefault()
                insertVariable(v)
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-left px-3 py-2 text-sm flex items-start gap-2 transition-colors ${
                i === highlight
                  ? "bg-orange-500/15 text-orange-200"
                  : "hover:bg-muted/30"
              }`}
            >
              <code className="font-mono text-[11px] mt-0.5 px-1.5 py-0.5 rounded bg-muted/30 text-foreground shrink-0">
                {style === "double" ? `{{${v.name}}}` : `{${v.name}}`}
              </code>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{v.label}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {v.hint}
                </p>
              </div>
              {v.sample && (
                <span className="text-[10px] text-muted-foreground/80 shrink-0 italic">
                  → {v.sample}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
