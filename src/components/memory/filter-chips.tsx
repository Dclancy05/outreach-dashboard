"use client"
/**
 * Filter chips at top of /agency/memory header.
 * 5 filters: All · Knowledge · Code · Conversations · Inbox.
 *
 * - All / Knowledge → vault tree (knowledge = vault minus /Conversations and /Code)
 * - Code           → CodeTreeView (GitHub source) + Files/Pages sub-toggle
 * - Conversations  → vault tree scoped to /Conversations
 * - Inbox          → opens the Inbox drawer (and tints the chip while it's open)
 */
import { cn } from "@/lib/utils"

export type FilterId = "all" | "knowledge" | "code" | "conversations" | "inbox"

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "knowledge", label: "Knowledge" },
  { id: "code", label: "Code" },
  { id: "conversations", label: "Conversations" },
  { id: "inbox", label: "Inbox" },
]

interface Props {
  value: FilterId
  onChange: (id: FilterId) => void
}

export function FilterChips({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Filter vault"
      className="inline-flex items-center gap-1 bg-mem-surface-2 border border-mem-border rounded-lg p-0.5"
    >
      {FILTERS.map((f) => {
        const active = value === f.id
        return (
          <button
            key={f.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(f.id)}
            className={cn(
              "relative h-7 px-2 sm:px-3 rounded-md font-mono text-[11px] sm:text-[12px] font-medium transition-colors",
              active
                ? "bg-mem-surface-3 text-mem-text-primary"
                : "text-mem-text-secondary hover:text-mem-text-primary"
            )}
          >
            {active && (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3 rounded-r bg-mem-accent"
              />
            )}
            {f.label}
          </button>
        )
      })}
    </div>
  )
}
