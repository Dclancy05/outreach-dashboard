"use client"

// 240/56px collapsible left sidebar.
// - Collapse persisted via JarvisShellProviders → SidebarCollapseContext.
// - Active route detected via next/navigation usePathname().
// - Persona switcher renders at the bottom; pulls from PersonaContext.
//
// Visual treatment (W1A spec):
//   surface-1 background + 4% violet vertical gradient overlay + 1% film-grain.
// Background layers are applied via the `.jarvis-sidebar-bg` class in
// jarvis-shell.css so we don't duplicate inline SVG data URIs in JS.

import {
  Bell,
  Bot,
  Brain,
  ChevronLeft,
  PanelLeft,
  PlayCircle,
  Plug,
  Settings,
  Terminal,
  Workflow,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  jarvisSpring,
  personaFlip,
  personaFlipTransition,
} from "@/components/jarvis/motion/presets"
import {
  useSidebarCollapse,
  usePersona,
} from "@/components/jarvis/shell/jarvis-shell-providers"

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  matchPrefix?: string
  /** Optional query param to detect "active" sub-tab (e.g. ?tab=runs). */
  matchQuery?: { key: string; value: string }
}

const NAV_ITEMS: NavItem[] = [
  { href: "/jarvis/memory", label: "Memory", icon: Brain },
  { href: "/jarvis/agents", label: "Agents", icon: Bot, matchPrefix: "/jarvis/agents" },
  { href: "/jarvis/workflows", label: "Workflows", icon: Workflow },
  {
    href: "/jarvis/agents?tab=runs",
    label: "Runs",
    icon: PlayCircle,
    matchQuery: { key: "tab", value: "runs" },
  },
  { href: "/jarvis/terminals", label: "Terminals", icon: Terminal },
  { href: "/jarvis/inbox", label: "Inbox", icon: Bell },
  { href: "/jarvis/mcps", label: "MCPs", icon: Plug },
]

/* -------------------------------------------------------------------------- */

export function JarvisSidebar() {
  const pathname = usePathname() ?? ""
  const { collapsed, toggle } = useSidebarCollapse()
  const reduced = useReducedMotion()

  // For matchQuery items we need the search string. usePathname() returns
  // pathname only; we read window.location.search lazily on the client (and
  // skip during SSR).
  const search =
    typeof window !== "undefined" ? window.location.search : ""

  const widthClass = collapsed ? "w-14" : "w-60"

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 56 : 240 }}
      transition={reduced ? { duration: 0 } : jarvisSpring}
      className={cn(
        "jarvis-sidebar-bg fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-mem-border lg:flex",
        widthClass
      )}
      aria-label="Jarvis primary navigation"
    >
      {/* Top: brand + collapse toggle */}
      <div className="flex h-14 items-center justify-between border-b border-mem-border px-3">
        {!collapsed ? (
          <Link
            href="/jarvis"
            className="flex items-center gap-2 text-mem-text-primary"
            aria-label="Jarvis home"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-mem-accent/15 text-mem-accent">
              <Brain className="h-4 w-4" />
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-mem-text-primary">
              Jarvis
            </span>
          </Link>
        ) : (
          <Link
            href="/jarvis"
            className="mx-auto flex h-7 w-7 items-center justify-center rounded-md bg-mem-accent/15 text-mem-accent"
            aria-label="Jarvis home"
          >
            <Brain className="h-4 w-4" />
          </Link>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-mem-text-secondary transition-colors hover:bg-white/[0.04] hover:text-mem-text-primary",
            collapsed && "absolute right-[-12px] top-3 border border-mem-border bg-mem-surface-2"
          )}
        >
          {collapsed ? (
            <PanelLeft className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isActive(pathname, search, item)
            return (
              <li key={item.href + item.label}>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-mem-surface-2 text-mem-text-primary"
                      : "text-mem-text-secondary hover:bg-white/[0.03] hover:text-mem-text-primary"
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-mem-accent"
                    />
                  )}
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-mem-text-primary" : "text-mem-text-secondary group-hover:text-mem-text-primary"
                    )}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer: persona switcher + settings */}
      <div className="border-t border-mem-border p-2">
        <PersonaPill collapsed={collapsed} />
        <Link
          href="/jarvis/settings"
          aria-label="Settings"
          aria-current={pathname.startsWith("/jarvis/settings") ? "page" : undefined}
          className={cn(
            "mt-1 flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] font-medium text-mem-text-secondary transition-colors hover:bg-white/[0.03] hover:text-mem-text-primary",
            pathname.startsWith("/jarvis/settings") &&
              "bg-mem-surface-2 text-mem-text-primary"
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate">Settings</span>}
        </Link>
      </div>
    </motion.aside>
  )
}

/* -------------------------------------------------------------------------- */
/*                                Persona pill                                 */
/* -------------------------------------------------------------------------- */

interface PersonaPillProps {
  collapsed: boolean
}

function PersonaPill({ collapsed }: PersonaPillProps) {
  const { persona, loading } = usePersona()
  const [open, setOpen] = useState(false)
  const reduced = useReducedMotion()

  const initial = useMemo(() => {
    if (!persona?.name) return "?"
    return persona.name.trim().charAt(0).toUpperCase() || "?"
  }, [persona?.name])

  const colorChip = persona?.color ?? "#7C5CFF"

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={
        persona?.name
          ? `Active persona: ${persona.name}. Click to switch.`
          : "Choose persona"
      }
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-md border border-mem-border bg-mem-surface-2 px-2 transition-colors hover:border-mem-border-strong",
        loading && "opacity-60"
      )}
    >
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] text-white"
        style={{ backgroundColor: colorChip }}
      >
        {persona?.emoji ?? initial}
      </span>
      {!collapsed && (
        <motion.span
          key={persona?.id ?? "none"}
          variants={reduced ? undefined : personaFlip}
          initial="initial"
          animate="animate"
          transition={personaFlipTransition}
          className="flex-1 truncate text-left text-[12px] font-medium text-mem-text-primary"
        >
          {loading ? "Loading…" : persona?.name ?? "No persona"}
        </motion.span>
      )}
    </button>
  )

  // Popover behavior is intentionally minimal; W4A may replace it with a
  // richer combobox. For now we just render a small list of "set" actions
  // visible only when expanded.
  return (
    <div className="relative">
      {trigger}
      {open && !collapsed && (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 mb-2 rounded-md border border-mem-border bg-mem-surface-2 p-2 text-[12px] shadow-lg"
        >
          <p className="mb-1 px-1 font-mono text-[10px] uppercase tracking-wider text-mem-text-muted">
            Persona
          </p>
          <p className="px-1 py-1 text-mem-text-secondary">
            Switching personas lands in the next update.
          </p>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                    */
/* -------------------------------------------------------------------------- */

function isActive(
  pathname: string,
  search: string,
  item: NavItem
): boolean {
  // Items with matchQuery are active only when the query param is set.
  if (item.matchQuery) {
    const params = new URLSearchParams(search)
    return (
      pathname.startsWith(item.matchPrefix ?? item.href.split("?")[0]) &&
      params.get(item.matchQuery.key) === item.matchQuery.value
    )
  }
  // Items without matchQuery should not activate when a sibling is filtering
  // by query (e.g. /jarvis/agents shouldn't be "active" when ?tab=runs).
  if (item.matchPrefix) {
    if (!pathname.startsWith(item.matchPrefix)) return false
    const params = new URLSearchParams(search)
    return !params.has("tab")
  }
  // Exact match for top-level routes.
  return pathname === item.href || pathname.startsWith(item.href + "/")
}
