"use client"

// Mobile-only 5-item bottom dock. Hidden ≥ lg.
// Memory · Agents · Runs · MCPs · Settings — equally spaced 56px row.
// Active item draws an animated underline pill via `tabSwap`.

import { Bot, Brain, PlayCircle, Settings, ShieldCheck, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { useId } from "react"
import { cn } from "@/lib/utils"
import { JARVIS_EASE } from "@/components/jarvis/motion/presets"

interface DockItem {
  href: string
  label: string
  icon: LucideIcon
  matchPrefix: string
  /** Optional query param to detect "active" state (e.g. ?tab=runs). */
  matchQuery?: { key: string; value: string }
}

const DOCK_ITEMS: DockItem[] = [
  { href: "/jarvis/memory", label: "Memory", icon: Brain, matchPrefix: "/jarvis/memory" },
  { href: "/jarvis/agents", label: "Agents", icon: Bot, matchPrefix: "/jarvis/agents" },
  {
    href: "/jarvis/agents?tab=runs",
    label: "Runs",
    icon: PlayCircle,
    matchPrefix: "/jarvis/agents",
    matchQuery: { key: "tab", value: "runs" },
  },
  { href: "/jarvis/proof", label: "Proof", icon: ShieldCheck, matchPrefix: "/jarvis/proof" },
  { href: "/jarvis/settings", label: "Settings", icon: Settings, matchPrefix: "/jarvis/settings" },
]

export function JarvisBottomDock() {
  const pathname = usePathname() ?? ""
  const search =
    typeof window !== "undefined" ? window.location.search : ""
  const reduced = useReducedMotion()
  const layoutId = useId()

  return (
    <nav
      aria-label="Jarvis mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-mem-border bg-mem-surface-1 lg:hidden"
    >
      {DOCK_ITEMS.map((item) => {
        const Icon = item.icon
        const active = isActive(pathname, search, item)
        return (
          <Link
            key={item.href + item.label}
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
              active
                ? "text-mem-text-primary"
                : "text-mem-text-secondary hover:text-mem-text-primary"
            )}
          >
            {active && (
              <motion.span
                layoutId={`dock-pill-${layoutId}`}
                className="absolute inset-x-3 top-0 h-[2px] rounded-full bg-mem-accent"
                transition={
                  reduced ? { duration: 0 } : { duration: 0.2, ease: JARVIS_EASE }
                }
              />
            )}
            <Icon
              className={cn(
                "h-4 w-4",
                active ? "text-mem-accent" : "text-mem-text-secondary"
              )}
            />
            <span className="tracking-wide">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function isActive(
  pathname: string,
  search: string,
  item: DockItem
): boolean {
  if (item.matchQuery) {
    const params = new URLSearchParams(search)
    return (
      pathname.startsWith(item.matchPrefix) &&
      params.get(item.matchQuery.key) === item.matchQuery.value
    )
  }
  if (!pathname.startsWith(item.matchPrefix)) return false
  const params = new URLSearchParams(search)
  return !params.has("tab")
}
