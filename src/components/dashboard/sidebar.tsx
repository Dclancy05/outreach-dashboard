"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { useTheme } from "@/contexts/theme-context"
import {
  Users,
  Settings,
  Zap,
  GitBranch,
  ListChecks,
  Sun,
  Moon,
  Menu,
  X,
  Shield,
  TerminalSquare,
  Palette,
  CalendarDays,
  Upload,
  BookOpen,
  Briefcase,
  ArrowLeft,
  ChevronDown,
  Home,
  Store,
  Search,
  DollarSign,
  BarChart3,
  UserPlus,
  LayoutDashboard,
  Target,
  Kanban,
  Sparkles,
  Ghost,
  Radio,
  Globe,
  TrendingUp,
  UserCheck,
  Brain,
} from "lucide-react"

interface NavItem {
  path: string
  label: string
  icon: typeof Home
  color: string
  exact?: boolean
}

interface NavSection {
  title?: string
  emoji?: string
  sectionColor?: string
  items: NavItem[]
}

// Agency-level navigation
const agencyNavSections: NavSection[] = [
  {
    title: "Agency",
    emoji: "🏢",
    sectionColor: "text-purple-400",
    items: [
      { path: "/agency", label: "Home", icon: Home, color: "text-purple-400", exact: true },
      { path: "/agency/businesses", label: "Businesses", icon: Store, color: "text-blue-400" },
      { path: "/agency/team", label: "Team", icon: UserPlus, color: "text-green-400" },
      { path: "/agency/lead-scraper", label: "Lead Scraper", icon: Search, color: "text-yellow-400" },
      { path: "/agency/costs", label: "Costs & Revenue", icon: DollarSign, color: "text-orange-400" },
      { path: "/agency/analytics", label: "Analytics", icon: BarChart3, color: "text-pink-400" },
      { path: "/agency/phantom", label: "Phantom", icon: Ghost, color: "text-violet-400" },
      { path: "/agency/memory", label: "Memory", icon: Brain, color: "text-amber-400" },
      { path: "/agency/terminals", label: "Terminals", icon: TerminalSquare, color: "text-cyan-400" },
    ],
  },
]

// Business-level navigation — consolidated
const businessNavSections: NavSection[] = [
  {
    items: [
      { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: "text-blue-400", exact: true },
      { path: "/outreach", label: "Outreach Hub", icon: Radio, color: "text-violet-400" },
      { path: "/social-scout", label: "Social Scout", icon: Globe, color: "text-sky-400" },
      { path: "/content", label: "Content", icon: Palette, color: "text-cyan-400" },
      { path: "/content-hq/trends", label: "Content HQ", icon: Sparkles, color: "text-amber-400" },
      { path: "/seo", label: "SEO", icon: TrendingUp, color: "text-green-400" },
      { path: "/revenue", label: "Revenue", icon: DollarSign, color: "text-emerald-400" },
      { path: "/leads", label: "Leads", icon: UserCheck, color: "text-orange-400" },
    ],
  },
  {
    items: [
      { path: "/accounts", label: "Accounts & Proxies", icon: Shield, color: "text-emerald-500" },
      { path: "/automations", label: "Automations", icon: Zap, color: "text-amber-400" },
      { path: "/settings", label: "Settings", icon: Settings, color: "text-muted-foreground" },
      { path: "/get-started", label: "Get Started", icon: Sparkles, color: "text-fuchsia-400" },
    ],
  },
]

interface Business {
  id: string
  name: string
  icon: string
  color: string
}

export function Sidebar() {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [showBizPicker, setShowBizPicker] = useState(false)

  const isAgencyPage = pathname.startsWith("/agency")
  const navSections = isAgencyPage ? agencyNavSections : businessNavSections

  useEffect(() => {
    const stored = localStorage.getItem("selected_business")
    if (stored) {
      try { setSelectedBusiness(JSON.parse(stored)) } catch {}
    }
    fetch("/api/businesses")
      .then((r) => r.json())
      .then((d) => setBusinesses(d.data || []))
      .catch(() => {})
  }, [])

  const switchBusiness = (biz: Business) => {
    setSelectedBusiness(biz)
    localStorage.setItem("selected_business", JSON.stringify(biz))
    setShowBizPicker(false)
    window.dispatchEvent(new Event("storage"))
  }

  function NavLink({ item }: { item: NavItem }) {
    const isActive = item.exact
      ? pathname === item.path
      : pathname === item.path || pathname.startsWith(item.path + "/")
    return (
      <Link
        href={item.path}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
      >
        <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : item.color)} />
        {item.label}
      </Link>
    )
  }

  const navContent = (
    <>
      {/* Header */}
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Link href="/agency" className="flex items-center gap-2 transition-colors hover:opacity-80" onClick={() => setMobileOpen(false)}>
          <Zap className="h-6 w-6 text-neon-purple" />
          <span className="text-lg font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            {isAgencyPage ? "AGENCY HQ" : "OUTREACH"}
          </span>
        </Link>
        <button className="ml-auto md:hidden p-1" onClick={() => setMobileOpen(false)}>
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Back to Agency (only shown in business view) */}
      {!isAgencyPage && (
        <div className="px-4 pt-3">
          <Link
            href="/agency"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
            onClick={() => setMobileOpen(false)}
          >
            <ArrowLeft className="h-4 w-4" /> Back to Agency
          </Link>
        </div>
      )}

      {/* Business Selector (only shown in business view) */}
      {!isAgencyPage && (
        <div className="px-4 pt-2 pb-1">
          <button
            onClick={() => setShowBizPicker(!showBizPicker)}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 bg-secondary/50 hover:bg-secondary transition-all"
          >
            <span className="text-lg">{selectedBusiness?.icon || "🏪"}</span>
            <span className="text-sm font-medium flex-1 text-left truncate">
              {selectedBusiness?.name || "Select Business"}
            </span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showBizPicker && "rotate-180")} />
          </button>
          {showBizPicker && (
            <div className="mt-1 rounded-lg border bg-card shadow-lg overflow-hidden">
              {businesses.filter((biz: Business & { status?: string }) => biz.status !== "archived").map((biz) => (
                <button
                  key={biz.id}
                  onClick={() => switchBusiness(biz)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-all text-left",
                    selectedBusiness?.id === biz.id && "bg-primary/10 text-primary"
                  )}
                >
                  <span>{biz.icon}</span>
                  <span className="truncate">{biz.name}</span>
                </button>
              ))}
              {businesses.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">No businesses yet — create one in Agency HQ</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
        {navSections.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-3" : ""}>
            {section.title && (
              <div className={cn("px-3 py-1 text-[10px] font-semibold uppercase tracking-wider", section.sectionColor || "text-muted-foreground/60")}>
                {section.emoji && <span className="mr-1">{section.emoji}</span>}
                {section.title}
              </div>
            )}
            {section.items.map((item) => (
              <NavLink key={item.path} item={item} />
            ))}
          </div>
        ))}
      </nav>

      {/* Theme Toggle */}
      <div className="border-t px-4 py-3">
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
        >
          {theme === "dark" ? <Sun className="h-4 w-4 text-yellow-400" /> : <Moon className="h-4 w-4 text-blue-400" />}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>
      </div>
    </>
  )

  return (
    <>
      <button
        className="fixed top-4 left-4 z-50 md:hidden rounded-lg bg-card border p-2 shadow-lg"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r bg-card/95 backdrop-blur-xl transition-transform duration-200",
          "md:translate-x-0 md:z-40",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {navContent}
      </aside>
    </>
  )
}
