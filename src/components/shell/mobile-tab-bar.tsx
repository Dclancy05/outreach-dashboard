"use client"
/**
 * Mobile-only bottom tab bar for the agency shell.
 * Hidden on lg+ screens (>=1024px) where the sidebar is visible.
 *
 * 5 tabs: Memory · Terminals · Agents · Home · Settings
 * (Agency Home is the agency dashboard; Settings routes to /agency/team for now.)
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Brain, TerminalSquare, Bot, Home, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

const TABS = [
  { path: "/agency", label: "Home", icon: Home, exact: true },
  { path: "/agency/memory", label: "Memory", icon: Brain },
  { path: "/agency/agents", label: "Agents", icon: Bot },
  { path: "/agency/terminals", label: "Terminals", icon: TerminalSquare },
  { path: "/agency/team", label: "Settings", icon: Settings },
]

export function MobileTabBar() {
  const pathname = usePathname() || ""

  // Only show on agency pages — business-scoped pages have their own bottom nav.
  if (!pathname.startsWith("/agency")) return null

  return (
    <nav
      className={cn(
        "lg:hidden fixed bottom-0 inset-x-0 z-30",
        "h-14 bg-background/95 backdrop-blur border-t border-border",
        "flex items-stretch justify-around safe-area-pb"
      )}
      aria-label="Mobile tab bar"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon
        const active = tab.exact ? pathname === tab.path : pathname.startsWith(tab.path)
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
