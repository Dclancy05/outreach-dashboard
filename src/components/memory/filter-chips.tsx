"use client"
/**
 * Filter chips at top of /agency/memory + /jarvis/memory header.
 *
 * Chips (the "modes" of the unified Command Center):
 *   All · Knowledge · Code · Conversations · Agents · Terminals · Inbox folder
 *
 * - All / Knowledge → vault tree (knowledge = vault minus /Conversations and /Code)
 * - Code            → CodeTreeView (GitHub source) + Files/Pages sub-toggle
 * - Conversations   → vault tree scoped to /Conversations
 * - Agents          → multi-agent system (Agents/Workflows/Schedules/Runs/Health)
 * - Terminals       → parallel-claude workspace (sessions, panes, activity feed)
 * - Inbox folder    → vault tree scoped to /Inbox (the folder, NOT the bell drawer)
 *
 * BUG-003 + BUG-011 fix: the chip used to fire the global notification drawer.
 * It now ALWAYS filters to the /Inbox vault folder. Callers who want the legacy
 * "open the bell drawer" behavior can pass `onSelectInboxFolder` to override the
 * default (used by /jarvis/memory) — omitting it keeps the legacy onChange path
 * for /agency/memory, which has its own drawer-opening side-effect on `inbox`.
 *
 * The label was renamed from "Inbox" to "Inbox folder" so it stops colliding
 * with the bell-drawer "Inbox" label.
 *
 * Phase 3 (Command Center unify) added the `agents` and `terminals` chips so
 * the standalone /agency/agents + /agency/terminals routes can redirect into
 * the same 4-pane vault shell as the rest of the Memory page.
 */
import { cn } from "@/lib/utils"
import { Bot, TerminalSquare } from "lucide-react"

export type FilterId =
  | "all"
  | "knowledge"
  | "code"
  | "conversations"
  | "agents"
  | "terminals"
  | "inbox"

interface ChipDef {
  id: FilterId
  label: string
  /** Optional icon — used by `agents` / `terminals` so they read at a glance. */
  icon?: typeof Bot
  /** Optional title (tooltip). */
  title?: string
}

const FILTERS: ChipDef[] = [
  { id: "all", label: "All" },
  { id: "knowledge", label: "Knowledge" },
  { id: "code", label: "Code" },
  { id: "conversations", label: "Conversations" },
  {
    id: "agents",
    label: "Agents",
    icon: Bot,
    title: "Agents · Workflows · Schedules · Runs · Health",
  },
  {
    id: "terminals",
    label: "Terminals",
    icon: TerminalSquare,
    title: "Parallel Claude sessions running on the VPS",
  },
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
      className="inline-flex items-center gap-1 bg-mem-surface-2 border border-mem-border rounded-lg p-0.5 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {FILTERS.map((f) => {
        const active = value === f.id
        const Icon = f.icon
        return (
          <button
            key={f.id}
            role="tab"
            aria-selected={active}
            title={f.title}
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
              "relative h-7 px-2 sm:px-3 rounded-md font-mono text-[11px] sm:text-[12px] font-medium transition-colors inline-flex items-center gap-1 shrink-0",
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
            {Icon && <Icon size={11} className="opacity-80" />}
            {f.label}
          </button>
        )
      })}
    </div>
  )
}
