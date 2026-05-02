// Static actions — built-in commands the palette always shows. Each action
// produces either a navigation (href) or a side-effect callback (run).
//
// Keep this list short and high-signal; long lists dilute the palette. If
// you find yourself adding more than ~10 actions, group them into a
// sub-palette instead.

export type StaticActionKind = "nav" | "run"

export interface StaticAction {
  id: string
  kind: StaticActionKind
  title: string
  hint?: string
  /** Lucide icon name (resolved in jarvis-cmdk to the actual component). */
  icon: StaticActionIcon
  /** For nav actions only. */
  href?: string
  /** For run actions only — pure client-side side effect. */
  run?: () => void
  /** Keyboard shortcut hint (display-only — wiring lives elsewhere). */
  shortcut?: string
}

export type StaticActionIcon =
  | "memory"
  | "agents"
  | "workflows"
  | "runs"
  | "terminals"
  | "inbox"
  | "mcps"
  | "settings"
  | "remember"
  | "theme"
  | "persona"
  | "home"

const NAV_ACTIONS: StaticAction[] = [
  { id: "go-home", kind: "nav", title: "Go to Jarvis home", icon: "home", href: "/jarvis" },
  { id: "go-memory", kind: "nav", title: "Open Memory vault", hint: "Browse markdown vault", icon: "memory", href: "/jarvis/memory" },
  { id: "go-agents", kind: "nav", title: "Open Agents", hint: "View / edit agent skills", icon: "agents", href: "/jarvis/agents" },
  { id: "go-workflows", kind: "nav", title: "Open Workflows", icon: "workflows", href: "/jarvis/workflows" },
  { id: "go-runs", kind: "nav", title: "Open Runs", hint: "Recent workflow executions", icon: "runs", href: "/jarvis/agents?tab=runs" },
  { id: "go-terminals", kind: "nav", title: "Open Terminals", hint: "Persistent Claude sessions", icon: "terminals", href: "/jarvis/terminals" },
  { id: "go-inbox", kind: "nav", title: "Open Inbox", icon: "inbox", href: "/jarvis/inbox" },
  { id: "go-mcps", kind: "nav", title: "Open MCP servers", icon: "mcps", href: "/jarvis/mcps" },
  { id: "go-observability", kind: "nav", title: "Open Observability", hint: "Live VNC viewer of senders", icon: "terminals", href: "/jarvis/observability" },
  { id: "go-status", kind: "nav", title: "Open System Status", hint: "VPS · services · crons · DB", icon: "settings", href: "/jarvis/status" },
  { id: "go-cost", kind: "nav", title: "Open Cost dashboard", hint: "Daily AI spend vs cap", icon: "settings", href: "/jarvis/cost" },
  { id: "go-audit", kind: "nav", title: "Open Audit log", hint: "Every change ever made", icon: "settings", href: "/jarvis/audit" },
  { id: "go-settings", kind: "nav", title: "Open Settings", icon: "settings", href: "/jarvis/settings" },
]

export function getStaticActions(): StaticAction[] {
  return [
    ...NAV_ACTIONS,
    {
      id: "quick-remember",
      kind: "run",
      title: "Quick remember",
      hint: "Save a memory from anywhere",
      icon: "remember",
      shortcut: "⌘⇧K",
      run: () => {
        // Dispatched as a custom event the global RememberPalette listens for.
        // Implemented here so callers don't need to know the listener exists.
        window.dispatchEvent(new CustomEvent("jarvis:open-remember-palette"))
      },
    },
    {
      id: "toggle-theme",
      kind: "run",
      title: "Toggle theme",
      hint: "Light / dark",
      icon: "theme",
      run: () => {
        const root = document.documentElement
        const isDark = root.classList.contains("dark")
        root.classList.toggle("dark", !isDark)
        try {
          localStorage.setItem("jarvis-theme", !isDark ? "dark" : "light")
        } catch {
          /* localStorage may be unavailable */
        }
      },
    },
  ]
}

export function filterStaticActions(actions: StaticAction[], query: string, limit = 8): StaticAction[] {
  if (!query.trim()) return actions.slice(0, limit)
  const q = query.toLowerCase()
  return actions
    .filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.hint?.toLowerCase().includes(q) ?? false)
    )
    .slice(0, limit)
}
