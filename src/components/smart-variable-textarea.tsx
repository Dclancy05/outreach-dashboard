"use client"

/**
 * P9.2 — Smart variable insertion textarea.
 *
 * Wraps a regular <textarea> and pops up a suggestion menu whenever the user
 * types `{` or `{{`. Arrow keys navigate the list, Enter or click inserts
 * the chosen variable, Escape dismisses. Works for both single-brace
 * (`{first_name}`) and double-brace (`{{first_name}}`) styles — the popup
 * picks the style the user already started typing.
 *
 * The variable catalog is accepted via props so callers (sequence builder,
 * automations modal, etc.) can inject domain-specific tokens.
 */

import { useEffect, useMemo, useRef, useState } from "react"

export interface TemplateVar {
  token: string          // machine name, e.g. "first_name"
  label: string          // human-friendly label
  hint?: string          // one-line description for the popup
  sample?: string        // preview value so Dylan can see what it renders to
}

export const DEFAULT_TEMPLATE_VARS: TemplateVar[] = [
  { token: "first_name", label: "First name",   hint: "Lead's first name",                  sample: "Alex" },
  { token: "name",       label: "Full name",     hint: "Lead's full name",                  sample: "Alex Morgan" },
  { token: "business",   label: "Business name", hint: "Lead's business / brand name",      sample: "Morgan Pilates" },
  { token: "niche",      label: "Niche",         hint: "Lead's industry or category",       sample: "Pilates studio" },
  { token: "city",       label: "City",          hint: "Lead's city",                       sample: "Austin" },
  { token: "state",      label: "State",         hint: "Lead's state",                      sample: "Texas" },
  { token: "bio",        label: "Bio",           hint: "Scraped profile bio",               sample: "Yoga + Pilates coach" },
  { token: "company",    label: "Company",       hint: "Same as business (alias)",          sample: "Morgan Pilates" },
  { token: "website",    label: "Website",       hint: "Lead's primary website",            sample: "morganpilates.com" },
  { token: "target_handle", label: "Target handle", hint: "Platform username to send to",   sample: "@morganpilates" },
  { token: "target_profile_url", label: "Profile URL", hint: "Full URL to the lead's profile", sample: "https://instagram.com/morganpilates" },
  { token: "message_body", label: "Message body", hint: "The generated message text",        sample: "Hey! Love what you do…" },
]

type PopupStyle = "single" | "double"

interface SmartVariableTextareaProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  variables?: TemplateVar[]
  className?: string
  rows?: number
  disabled?: boolean
  id?: string
}

export function SmartVariableTextarea({
  value, onChange, placeholder, variables = DEFAULT_TEMPLATE_VARS,
  className, rows = 4, disabled, id,
}: SmartVariableTextareaProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<PopupStyle>("single")
  const [query, setQuery] = useState("")
  const [cursorPos, setCursorPos] = useState(0)   // where the `{` started (offset into value)
  const [highlight, setHighlight] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return variables
    return variables.filter(v =>
      v.token.toLowerCase().includes(q) ||
      v.label.toLowerCase().includes(q)
    )
  }, [variables, query])

  useEffect(() => { setHighlight(0) }, [query, open])

  /**
   * Look at the text *before* the current caret and decide whether we're
   * currently typing inside an unclosed `{...` or `{{...`. If we are,
   * return the filter query the user has typed so far.
   */
  const evaluateTrigger = (textarea: HTMLTextAreaElement) => {
    const pos = textarea.selectionStart ?? textarea.value.length
    const before = textarea.value.slice(0, pos)
    // Match `{{foo` (preferring) then `{foo`. Stop at whitespace or `}`.
    const doubleMatch = before.match(/\{\{([A-Za-z0-9_]*)$/)
    if (doubleMatch) {
      setStyle("double")
      setQuery(doubleMatch[1])
      setCursorPos(pos - doubleMatch[0].length)
      setOpen(true)
      return
    }
    const singleMatch = before.match(/(^|[^{])\{([A-Za-z0-9_]*)$/)
    if (singleMatch) {
      setStyle("single")
      setQuery(singleMatch[2])
      setCursorPos(pos - (singleMatch[2].length + 1))
      setOpen(true)
      return
    }
    setOpen(false)
  }

  const insertVariable = (v: TemplateVar) => {
    const textarea = ref.current
    if (!textarea) return
    const end = textarea.selectionStart ?? value.length
    const before = value.slice(0, cursorPos)
    const after = value.slice(end)
    const inserted = style === "double" ? `{{${v.token}}}` : `{${v.token}}`
    const next = before + inserted + after
    onChange(next)
    setOpen(false)
    // Restore caret just after the inserted token on next tick.
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
      setHighlight(h => Math.min(filtered.length - 1, h + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight(h => Math.max(0, h - 1))
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
        onChange={e => {
          onChange(e.target.value)
          requestAnimationFrame(() => ref.current && evaluateTrigger(ref.current))
        }}
        onKeyDown={handleKeyDown}
        onClick={() => ref.current && evaluateTrigger(ref.current)}
        onKeyUp={e => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
            ref.current && evaluateTrigger(ref.current)
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className={className}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-30 w-[320px] max-h-[260px] overflow-y-auto rounded-xl border border-border/60 bg-popover/95 backdrop-blur-xl shadow-2xl">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40 flex items-center justify-between">
            <span>Insert variable</span>
            <span className="text-muted-foreground/60">
              {style === "double" ? "{{…}}" : "{…}"}
            </span>
          </div>
          {filtered.map((v, i) => (
            <button
              key={v.token}
              type="button"
              onMouseDown={e => { e.preventDefault(); insertVariable(v) }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-left px-3 py-2 text-sm flex items-start gap-2 transition-colors ${
                i === highlight ? "bg-orange-500/15 text-orange-200" : "hover:bg-muted/30"
              }`}
            >
              <code className="font-mono text-[11px] mt-0.5 px-1.5 py-0.5 rounded bg-muted/30 text-foreground shrink-0">
                {style === "double" ? `{{${v.token}}}` : `{${v.token}}`}
              </code>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{v.label}</p>
                {v.hint && <p className="text-[11px] text-muted-foreground truncate">{v.hint}</p>}
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
