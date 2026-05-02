"use client"
/**
 * Filter chips at top of /agency/memory + /jarvis/memory header.
 * 5 filters: All · Knowledge · Code · Conversations · Inbox folder.
 *
 * - All / Knowledge → vault tree (knowledge = vault minus /Conversations and /Code)
 * - Code           → CodeTreeView (GitHub source) + Files/Pages sub-toggle
 * - Conversations  → vault tree scoped to /Conversations
 * - Inbox folder   → vault tree scoped to /Inbox (the folder, NOT the bell drawer)
 *
 * BUG-003 + BUG-011 fix: the chip used to fire the global notification drawer.
 * It now ALWAYS filters to the /Inbox vault folder. Callers who want the legacy
 * "open the bell drawer" behavior can pass `onSelectInboxFolder` to override the
 * default (used by /jarvis/memory) — omitting it keeps the legacy onChange path
 * for /agency/memory, which has its own drawer-opening side-effect on `inbox`.
 *
 * The label was renamed from "Inbox" to "Inbox folder" so it stops colliding
 * with the bell-drawer "Inbox" label.
 */
import { cn } from "@/lib/utils"

export type FilterId = "all" | "knowledge" | "code" | "conversations" | "inbox"

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "knowledge", label: "Knowledge" },
  { id: "code", label: "Code" },
  { id: "conversations", label: "Conversations" },
  { id: "inbox", label: "Inbox folder" },
]

interface Props {
  value: FilterId
  onChange: (id: FilterId) => void
  /**
   * Optional override fired when the user clicks "Inbox folder". When set, this
   * is invoked INSTEAD OF onChange for the inbox chip. /jarvis/memory passes
   * this to filter the vault tree to /Inbox without opening the bell drawer.
   * Legacy /agency/memory omits it and keeps its own drawer-opening side-effect
   * inside its onChange handler.
   */
  onSelectInboxFolder?: () => void
}

export function FilterChips({ value, onChange, onSelectInboxFolder }: Props) {
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
            onClick={(e) => {
              // BUG-003: stop the click from bubbling to any global "Inbox" key
              // listener (the bell button used to swallow these).
              e.stopPropagation()
              if (f.id === "inbox" && onSelectInboxFolder) {
                onSelectInboxFolder()
                return
              }
              onChange(f.id)
            }}
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
