"use client"

// JarvisCmdk — the actual command palette dialog.
//
// W1A locked design:
//   - Centered ~640×480 dialog, surface-2 background, backdrop-blur 20px
//     on a 60% black scrim
//   - 2px violet TOP border (border-mem-accent) — palette identity cue
//   - Header: prompt + JARVIS wordmark in Geist Mono uppercase tracking +0.08em
//   - Body: scrollable list of suggestions GROUPED by source
//   - Footer hint bar with keyboard cheatsheet
//
// Implementation notes:
//   - `cmdk` package is NOT installed and shadcn `<Command>` is NOT in
//     /components/ui (verified via package.json + ui/ directory listing).
//   - We build a minimal-but-correct palette on top of Radix Dialog:
//     keyboard nav (↑↓ Enter Esc), grouped sections, fuzzy substring filter.
//   - Keyboard model: a single flat `flatItems` array of all visible rows
//     drives `activeIndex`. ↑↓ wraps. Enter fires the activeItem's action.

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

import { useRouter } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import {
  Bell,
  Bot,
  Brain,
  ChevronRight,
  CornerDownLeft,
  FileText,
  History,
  Home,
  MessageSquare,
  Moon,
  Palette as PaletteIcon,
  PlayCircle,
  Plug,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Terminal,
  UserCircle,
  Workflow,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  fetchMemoryHits,
  filterMemoryHits,
  type MemoryHit,
} from "./sources/memory-search"
import {
  fetchPersonaHits,
  filterPersonaHits,
  type PersonaHit,
} from "./sources/personas"
import {
  fetchAgentHits,
  filterAgentHits,
  type AgentHit,
} from "./sources/agents"
import {
  fetchWorkflowHits,
  filterWorkflowHits,
  type WorkflowHit,
} from "./sources/workflows"
import {
  fetchRunHits,
  filterRunHits,
  type RunHit,
} from "./sources/runs"
import {
  fetchMcpHits,
  filterMcpHits,
  type McpHit,
} from "./sources/mcps"
import {
  filterStaticActions,
  getStaticActions,
  type StaticAction,
  type StaticActionIcon,
} from "./sources/static-actions"

/* -------------------------------------------------------------------------- */
/*                                   Types                                     */
/* -------------------------------------------------------------------------- */

type GroupKey =
  | "memory"
  | "agents"
  | "personas"
  | "workflows"
  | "runs"
  | "mcps"
  | "actions"
  | "ask"

interface FlatItem {
  group: GroupKey
  id: string
  title: string
  hint?: string
  emoji?: string
  icon: LucideIcon
  shortcut?: string
  /** Run on selection. */
  onRun: () => void
}

interface JarvisCmdkProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

/* -------------------------------------------------------------------------- */
/*                                  Component                                  */
/* -------------------------------------------------------------------------- */

export function JarvisCmdk({ open, onOpenChange }: JarvisCmdkProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)

  // Source data (fetched on open).
  const [memory, setMemory] = useState<MemoryHit[]>([])
  const [personas, setPersonas] = useState<PersonaHit[]>([])
  const [agents, setAgents] = useState<AgentHit[]>([])
  const [workflows, setWorkflows] = useState<WorkflowHit[]>([])
  const [runs, setRuns] = useState<RunHit[]>([])
  const [mcps, setMcps] = useState<McpHit[]>([])
  const staticActions = useMemo(() => getStaticActions(), [])

  /* ───────────────────────── Fetch on open ─────────────────────────────── */

  useEffect(() => {
    if (!open) return
    setQuery("")
    setActiveIndex(0)

    let cancelled = false
    Promise.all([
      fetchMemoryHits(),
      fetchPersonaHits(),
      fetchAgentHits(),
      fetchWorkflowHits(),
      fetchRunHits(),
      fetchMcpHits(),
    ]).then(([m, p, a, w, r, mc]) => {
      if (cancelled) return
      setMemory(m)
      setPersonas(p)
      setAgents(a)
      setWorkflows(w)
      setRuns(r)
      setMcps(mc)
    })

    // Focus input next tick so Radix has finished mounting.
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [open])

  /* ─────────────────── Build flat keyboard-nav array ───────────────────── */

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const runAndClose = useCallback(
    (fn: () => void) => () => {
      fn()
      close()
    },
    [close]
  )

  const navigateAndClose = useCallback(
    (href: string) => () => {
      router.push(href)
      close()
    },
    [router, close]
  )

  const groups = useMemo(() => {
    const memoryItems: FlatItem[] = filterMemoryHits(memory, query, 6).map((h) => ({
      group: "memory" as const,
      id: `memory:${h.id}`,
      title: h.title,
      hint: h.hint,
      icon: FileText,
      onRun: navigateAndClose(`/jarvis/memory?file=${encodeURIComponent(h.path)}`),
    }))

    const agentItems: FlatItem[] = filterAgentHits(agents, query, 6).map((h) => ({
      group: "agents" as const,
      id: `agent:${h.id}`,
      title: h.title,
      hint: h.hint,
      emoji: h.emoji,
      icon: Bot,
      onRun: navigateAndClose(`/jarvis/agents/${h.slug}`),
    }))

    const personaItems: FlatItem[] = filterPersonaHits(personas, query, 6).map((h) => ({
      group: "personas" as const,
      id: `persona:${h.id}`,
      title: h.title,
      hint: h.hint || (h.is_default ? "Default persona" : undefined),
      emoji: h.emoji,
      icon: UserCircle,
      onRun: runAndClose(() => {
        // Persona switch hand-off: emit a custom event the persona context
        // already listens for elsewhere. Falls back to a settings nav if
        // nothing handles it.
        window.dispatchEvent(
          new CustomEvent("jarvis:set-persona", { detail: { id: h.id } })
        )
        router.push(`/jarvis/settings?persona=${h.id}`)
      }),
    }))

    const workflowItems: FlatItem[] = filterWorkflowHits(workflows, query, 6).map((h) => ({
      group: "workflows" as const,
      id: `workflow:${h.id}`,
      title: h.title,
      hint: h.hint,
      emoji: h.emoji,
      icon: Workflow,
      onRun: navigateAndClose(`/jarvis/workflows?id=${h.id}`),
    }))

    const runItems: FlatItem[] = filterRunHits(runs, query, 6).map((h) => ({
      group: "runs" as const,
      id: `run:${h.id}`,
      title: h.title,
      hint: h.hint,
      emoji: h.emoji,
      icon: History,
      onRun: navigateAndClose(`/jarvis/agents?tab=runs&run=${h.id}`),
    }))

    const mcpItems: FlatItem[] = filterMcpHits(mcps, query, 6).map((h) => ({
      group: "mcps" as const,
      id: `mcp:${h.id}`,
      title: h.title,
      hint: h.hint,
      emoji: h.emoji,
      icon: Plug,
      onRun: navigateAndClose(`/jarvis/mcps`),
    }))

    const actionItems: FlatItem[] = filterStaticActions(staticActions, query, 8).map(
      (a) => buildActionItem(a, navigateAndClose, runAndClose)
    )

    const askItems: FlatItem[] = []
    const trimmed = query.trim()
    if (trimmed.length > 0) {
      askItems.push({
        group: "ask",
        id: `ask:${trimmed}`,
        title: `Ask Jarvis: "${trimmed}"`,
        hint: "Inject memory + chat (mock streaming for now)",
        icon: MessageSquare,
        onRun: navigateAndClose(
          `/jarvis?ask=${encodeURIComponent(trimmed)}`
        ),
      })
    }

    return [
      { key: "memory" as GroupKey, label: "Memory", items: memoryItems },
      { key: "agents" as GroupKey, label: "Agents", items: agentItems },
      { key: "personas" as GroupKey, label: "Personas", items: personaItems },
      { key: "workflows" as GroupKey, label: "Workflows", items: workflowItems },
      { key: "runs" as GroupKey, label: "Recent runs", items: runItems },
      { key: "mcps" as GroupKey, label: "MCPs", items: mcpItems },
      { key: "actions" as GroupKey, label: "Actions", items: actionItems },
      { key: "ask" as GroupKey, label: "Ask Jarvis", items: askItems },
    ].filter((g) => g.items.length > 0)
  }, [
    memory,
    agents,
    personas,
    workflows,
    runs,
    mcps,
    staticActions,
    query,
    navigateAndClose,
    runAndClose,
    router,
  ])

  const flatItems = useMemo(() => {
    const out: FlatItem[] = []
    for (const g of groups) for (const it of g.items) out.push(it)
    return out
  }, [groups])

  // Reset active index whenever the visible list changes.
  useEffect(() => {
    setActiveIndex(0)
  }, [query, groups.length])

  /* ────────────────────────── Keyboard handling ────────────────────────── */

  const onInputKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        if (flatItems.length === 0) return
        setActiveIndex((i) => (i + 1) % flatItems.length)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        if (flatItems.length === 0) return
        setActiveIndex((i) => (i - 1 + flatItems.length) % flatItems.length)
      } else if (e.key === "Enter") {
        e.preventDefault()
        const item = flatItems[activeIndex]
        if (item) item.onRun()
      } else if (e.key === "Escape") {
        // Radix handles Escape via Dialog; don't double-handle.
      }
    },
    [flatItems, activeIndex]
  )

  // Scroll the active row into view when keyboard nav moves past the fold.
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-cmdk-index="${activeIndex}"]`
    )
    if (el) el.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  /* ────────────────────────────── Render ───────────────────────────────── */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Sizing — locked to W1A spec (640×480-ish).
          "max-w-[640px] w-[92vw] gap-0 p-0 overflow-hidden",
          // Surface — surface-2 + backdrop blur is on the overlay (via Radix
          // overlay base styles); this content sits on top.
          "border-mem-border bg-mem-surface-2",
          // Identity cue — 2px violet top border.
          "border-t-2 border-t-mem-accent",
          "shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
        )}
        // Don't auto-focus the close button; let our input grab focus.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <DialogTitle className="sr-only">Jarvis command palette</DialogTitle>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-mem-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-mem-text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="What do you want to do?"
            aria-label="Search Jarvis"
            aria-autocomplete="list"
            aria-controls="jarvis-cmdk-list"
            aria-activedescendant={
              flatItems[activeIndex]
                ? `jarvis-cmdk-item-${activeIndex}`
                : undefined
            }
            className="flex-1 bg-transparent text-[14px] text-mem-text-primary outline-none placeholder:text-mem-text-muted"
          />
          <span
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-mem-text-muted"
            aria-hidden
          >
            JARVIS
          </span>
        </div>

        {/* Body */}
        <div
          ref={listRef}
          id="jarvis-cmdk-list"
          role="listbox"
          aria-label="Suggestions"
          className="max-h-[420px] overflow-y-auto px-2 py-2"
        >
          {groups.length === 0 ? (
            <EmptyState query={query} />
          ) : (
            groups.map((group) => (
              <Group key={group.key} label={group.label}>
                {group.items.map((item) => {
                  const idx = flatItems.indexOf(item)
                  const active = idx === activeIndex
                  return (
                    <Row
                      key={item.id}
                      item={item}
                      active={active}
                      index={idx}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={item.onRun}
                    />
                  )
                })}
              </Group>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-mem-border bg-mem-surface-1 px-4 py-2 text-[10px] text-mem-text-muted">
          <div className="flex items-center gap-3">
            <FooterHint kbd="↑↓" label="navigate" />
            <FooterHint kbd="↵" label="run" Icon={CornerDownLeft} />
            <FooterHint kbd="esc" label="close" />
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono">⌘⇧K</span>
            <span>→ Quick Remember</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/*                                Sub-components                               */
/* -------------------------------------------------------------------------- */

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <div className="px-2 pb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mem-text-muted">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

interface RowProps {
  item: FlatItem
  active: boolean
  index: number
  onMouseEnter: () => void
  onClick: () => void
}

function Row({ item, active, index, onMouseEnter, onClick }: RowProps) {
  const Icon = item.icon
  return (
    <button
      type="button"
      role="option"
      id={`jarvis-cmdk-item-${index}`}
      data-cmdk-index={index}
      aria-selected={active}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
        active
          ? "bg-mem-surface-3 text-mem-text-primary"
          : "text-mem-text-secondary hover:bg-mem-surface-3/60"
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px]",
          active
            ? "bg-mem-accent/15 text-mem-accent"
            : "bg-mem-surface-1 text-mem-text-secondary"
        )}
        aria-hidden
      >
        {item.emoji ? <span>{item.emoji}</span> : <Icon className="h-3.5 w-3.5" />}
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={cn(
            "block truncate text-[13px] font-medium",
            active ? "text-mem-text-primary" : "text-mem-text-primary/95"
          )}
        >
          {item.title}
        </span>
        {item.hint && (
          <span className="block truncate text-[11px] text-mem-text-muted">
            {item.hint}
          </span>
        )}
      </span>
      {item.shortcut && (
        <kbd className="hidden rounded border border-mem-border bg-mem-bg px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-mem-text-muted sm:inline-block">
          {item.shortcut}
        </kbd>
      )}
      {active && (
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-mem-accent"
          aria-hidden
        />
      )}
    </button>
  )
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <Sparkles className="mx-auto h-5 w-5 text-mem-text-muted" aria-hidden />
      <p className="mt-3 text-[13px] text-mem-text-secondary">
        {query.trim()
          ? `No matches for "${query.trim()}"`
          : "Start typing to search memory, agents, workflows, runs…"}
      </p>
      <p className="mt-1 text-[11px] text-mem-text-muted">
        Press ↵ on the bottom row to ask Jarvis directly.
      </p>
    </div>
  )
}

function FooterHint({
  kbd,
  label,
  Icon,
}: {
  kbd: string
  label: string
  Icon?: LucideIcon
}) {
  return (
    <span className="flex items-center gap-1">
      {Icon ? (
        <Icon className="h-3 w-3" aria-hidden />
      ) : (
        <span
          className="rounded border border-mem-border bg-mem-bg px-1 font-mono text-[10px]"
          aria-hidden
        >
          {kbd}
        </span>
      )}
      <span>{label}</span>
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*                              Static-action wiring                           */
/* -------------------------------------------------------------------------- */

function buildActionItem(
  a: StaticAction,
  navigateAndClose: (href: string) => () => void,
  runAndClose: (fn: () => void) => () => void
): FlatItem {
  const Icon = iconFor(a.icon)
  const onRun =
    a.kind === "nav" && a.href
      ? navigateAndClose(a.href)
      : a.kind === "run" && a.run
        ? runAndClose(a.run)
        : () => {}
  return {
    group: "actions",
    id: `action:${a.id}`,
    title: a.title,
    hint: a.hint,
    icon: Icon,
    shortcut: a.shortcut,
    onRun,
  }
}

function iconFor(name: StaticActionIcon): LucideIcon {
  switch (name) {
    case "memory":
      return Brain
    case "agents":
      return Bot
    case "workflows":
      return Workflow
    case "runs":
      return PlayCircle
    case "terminals":
      return Terminal
    case "inbox":
      return Bell
    case "mcps":
      return Plug
    case "settings":
      return SettingsIcon
    case "remember":
      return Sparkles
    case "theme":
      return Moon
    case "persona":
      return UserCircle
    case "home":
      return Home
    default:
      return PaletteIcon
  }
}
