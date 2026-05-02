"use client"
/**
 * Mobile-only bottom tab bar for the agency shell.
 * Hidden on lg+ screens (>=1024px) where the sidebar is visible.
 *
 * 5 tabs (agency context): Home · Memory · Agents · Terminals · Settings
 * 5 tabs (jarvis context): Memory · Terminals · Agents · MCPs · Settings
 *
 * BUG-020/021 fix: when the URL is on /jarvis/*, render the jarvis-specific
 * tab set so users on the jarvis surface don't see the dashboard's
 * Home/Campaigns/Content/Settings nav. Mobile (375) and tablet (768) now
 * render the same component (no divergence between viewports).
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Brain, TerminalSquare, Bot, Home, Settings, Plug } from "lucide-react"
import { cn } from "@/lib/utils"

const AGENCY_TABS = [
  { path: "/agency", label: "Home", icon: Home, exact: true },
  { path: "/agency/memory", label: "Memory", icon: Brain },
  { path: "/agency/agents", label: "Agents", icon: Bot },
  { path: "/agency/terminals", label: "Terminals", icon: TerminalSquare },
  { path: "/agency/team", label: "Settings", icon: Settings },
]

// BUG-020 fix: dedicated tab set for /jarvis/* paths. Matches the
// JarvisBottomDock items so visiting /jarvis/* doesn't surface the
// agency or dashboard navs.
const JARVIS_TABS = [
  { path: "/jarvis/memory", label: "Memory", icon: Brain },
  { path: "/jarvis/terminals", label: "Terminals", icon: TerminalSquare },
  { path: "/jarvis/agents", label: "Agents", icon: Bot },
  { path: "/jarvis/mcps", label: "MCPs", icon: Plug },
  { path: "/jarvis/settings", label: "Settings", icon: Settings },
]

export function MobileTabBar() {
  const pathname = usePathname() || ""

  // BUG-020 fix: pick the tab set based on top-level route. Business-scoped
  // pages (everything outside /agency/* and /jarvis/*) keep their own
  // bottom nav and this component renders nothing.
  const onJarvis = pathname.startsWith("/jarvis")
  const onAgency = pathname.startsWith("/agency")
  if (!onAgency && !onJarvis) return null

  const tabs = onJarvis ? JARVIS_TABS : AGENCY_TABS

  return (
    <nav
      className={cn(
        "lg:hidden fixed bottom-0 inset-x-0 z-30",
        "h-14 bg-background/95 backdrop-blur border-t border-border",
        "flex items-stretch justify-around safe-area-pb"
      )}
      aria-label="Mobile tab bar"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const exact = "exact" in tab && tab.exact
        const active = exact ? pathname === tab.path : pathname.startsWith(tab.path)
        return (
          <Link
            key={tab.path}
            href={tab.path}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors",
              active ? "text-mem-accent" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active && (
              <span aria-hidden className="absolute top-0 h-[2px] w-8 rounded-b bg-mem-accent" />
            )}
            <Icon size={18} className={active ? "fill-mem-accent/20" : ""} />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
