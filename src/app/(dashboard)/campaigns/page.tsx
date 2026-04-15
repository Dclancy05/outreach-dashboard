"use client"

import { useState, useEffect, Suspense, lazy } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Target,
  LayoutDashboard,
  Zap,
  Users,
  MessageSquare,
  GitBranch,
  Rocket,
  Kanban,
  Plus,
} from "lucide-react"
import { CampaignsDashboard } from "@/components/campaigns/campaigns-dashboard"
import { LaunchDeployTab } from "@/components/campaigns/launch-deploy-tab"

// Lazy load the heavy page components
const PowerDMPage = lazy(() => import("@/app/(dashboard)/power-dm/page"))
const LeadsPage = lazy(() => import("@/app/(dashboard)/leads/page"))
const GeneratePage = lazy(() => import("@/app/(dashboard)/generate/page"))
const SequencesPage = lazy(() => import("@/app/(dashboard)/sequences/page"))
const PipelinePage = lazy(() => import("@/app/(dashboard)/pipeline/page"))

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "power-dm", label: "Power DM", icon: Zap },
  { id: "leads", label: "Leads", icon: Users },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "sequences", label: "Sequences", icon: GitBranch },
  { id: "launch", label: "Launch & Deploy", icon: Rocket },
  { id: "pipeline", label: "Pipeline", icon: Kanban },
] as const

type TabId = (typeof TABS)[number]["id"]

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent" />
    </div>
  )
}

function CampaignsPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get("tab") as TabId | null
  const [activeTab, setActiveTab] = useState<TabId>(tabParam && TABS.some(t => t.id === tabParam) ? tabParam : "dashboard")

  useEffect(() => {
    if (tabParam && TABS.some(t => t.id === tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [tabParam, activeTab])

  const switchTab = (tab: TabId) => {
    setActiveTab(tab)
    const url = tab === "dashboard" ? "/campaigns" : `/campaigns?tab=${tab}`
    router.push(url, { scroll: false })
  }

  return (
    <div className="space-y-4">
      {/* Header with New Campaign button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Target className="h-8 w-8 text-violet-400" />
          <div>
            <h1 className="text-2xl font-bold">Campaigns</h1>
            <p className="text-sm text-muted-foreground">Manage your entire outreach workflow</p>
          </div>
        </div>
        <Button onClick={() => { switchTab("dashboard") }} className="gap-2">
          <Plus className="h-4 w-4" /> New Campaign
        </Button>
      </div>

      {/* Tab Bar */}
      <div className="border-b">
        <div className="flex gap-0.5 overflow-x-auto scrollbar-none -mb-px">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                  isActive
                    ? "border-violet-500 text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-violet-400" : ""}`} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[60vh]">
        {activeTab === "dashboard" && <CampaignsDashboard hideHeader />}
        {activeTab === "power-dm" && <Suspense fallback={<TabFallback />}><PowerDMPage /></Suspense>}
        {activeTab === "leads" && <Suspense fallback={<TabFallback />}><LeadsPage /></Suspense>}
        {activeTab === "messages" && <Suspense fallback={<TabFallback />}><GeneratePage /></Suspense>}
        {activeTab === "sequences" && <Suspense fallback={<TabFallback />}><SequencesPage /></Suspense>}
        {activeTab === "launch" && <LaunchDeployTab />}
        {activeTab === "pipeline" && <Suspense fallback={<TabFallback />}><PipelinePage /></Suspense>}
      </div>
    </div>
  )
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={<TabFallback />}>
      <CampaignsPageInner />
    </Suspense>
  )
}
