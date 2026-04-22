"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatCard } from "@/components/dashboard/stat-card"
import Link from "next/link"
import { SetupBanner } from "@/components/setup-banner"
import { OnboardingBanner } from "@/components/onboarding-banner"
import {
  LayoutDashboard,
  Users,
  Send,
  MessageSquare,
  GitBranch,
  Sparkles,
  Target,
  Zap,
  TrendingUp,
  Clock,
} from "lucide-react"

export default function DashboardPage() {
  const [businessId, setBusinessId] = useState<string>("")

  useEffect(() => {
    const loadBiz = () => {
      try {
        const stored = localStorage.getItem("selected_business")
        if (stored) setBusinessId(JSON.parse(stored).id || "")
      } catch {}
    }
    loadBiz()
    window.addEventListener("storage", loadBiz)
    return () => window.removeEventListener("storage", loadBiz)
  }, [])

  const { data: stats, isLoading } = useSWR(
    businessId ? `dashboard-stats-${businessId}` : "dashboard-stats",
    () => dashboardApi("get_dashboard", { business_id: businessId || undefined })
  )

  const { data: leadsBreakdown } = useSWR(
    businessId ? `leads-status-counts-${businessId}` : "leads-status-counts",
    () => dashboardApi("get_lead_status_counts", { business_id: businessId || undefined })
  )

  const { data: sequences } = useSWR(
    businessId ? `sequences-${businessId}` : "sequences",
    () => dashboardApi("get_sequences", { business_id: businessId || undefined })
  )

  const activeSequences = sequences?.filter((s: { status?: string }) => s.status !== "paused")?.length || sequences?.length || 0

  const statusCounts = leadsBreakdown || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="h-8 w-8 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Overview of your outreach performance</p>
          </div>
        </div>
      </div>

      {/* First-time user nudge — dismissible */}
      <OnboardingBanner />

      {/* Setup Banner */}
      <SetupBanner
        storageKey="dashboard"
        title="Welcome! Let's get you set up"
        steps={[
          { id: "business", label: "Select a business in Settings", complete: !!businessId, href: "/settings", linkLabel: "Go to Settings" },
          { id: "leads", label: "Import your first leads", complete: (stats?.total_leads || 0) > 0, href: "/leads", linkLabel: "Import Leads" },
          { id: "sequences", label: "Create a message sequence", complete: (sequences?.length || 0) > 0, href: "/sequences", linkLabel: "Create Sequence" },
        ]}
      />

      {/* Stats Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-[120px] animate-pulse bg-secondary/20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Leads"
            value={stats?.total_leads || 0}
            subtitle={`${stats?.active_leads || 0} in sequence`}
            icon={Users}
            color="blue"
          />
          <StatCard
            title="Sent Today"
            value={stats?.today_sends || 0}
            subtitle={`of ${stats?.today_limit || 0} daily limit`}
            icon={Send}
            color="green"
          />
          <StatCard
            title="Response Rate"
            value={`${stats?.response_rate || 0}%`}
            subtitle="of contacted leads"
            icon={TrendingUp}
            color="purple"
          />
          <StatCard
            title="Pending Messages"
            value={stats?.messages_pending || 0}
            subtitle={`${activeSequences} active sequences`}
            icon={MessageSquare}
            color="orange"
          />
        </div>
      )}

      {/* Leads by Status */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Target className="h-5 w-5 text-amber-400" />
            Leads by Status
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(statusCounts).length > 0 ? (
              Object.entries(statusCounts).map(([status, count]) => (
                <div key={status} className="rounded-lg bg-secondary/30 p-3 text-center">
                  <p className="text-2xl font-bold">{count as number}</p>
                  <p className="text-xs text-muted-foreground capitalize mt-1">{status.replace(/_/g, " ")}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground col-span-full">No leads data yet</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Platform Stats */}
      {stats?.platform_stats && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-400" />
              Platform Activity
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.platform_stats.map((p: { platform: string; sends_today: number; daily_limit: number; accounts: number }) => (
                <div key={p.platform} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium capitalize">{p.platform}</span>
                    <span className="text-xs text-muted-foreground">{p.accounts} accounts</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2 mb-1">
                    <div
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{ width: `${Math.min((p.sends_today / (p.daily_limit || 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{p.sends_today} / {p.daily_limit} today</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-cyan-400" />
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/generate">
              <Button variant="outline" className="gap-2">
                <Sparkles className="h-4 w-4 text-violet-400" />
                Generate Messages
              </Button>
            </Link>
            <Link href="/va-queue">
              <Button variant="outline" className="gap-2">
                <Send className="h-4 w-4 text-emerald-400" />
                Open Send Queue
              </Button>
            </Link>
            <Link href="/leads">
              <Button variant="outline" className="gap-2">
                <Target className="h-4 w-4 text-amber-400" />
                Score Leads
              </Button>
            </Link>
            <Link href="/follow-ups">
              <Button variant="outline" className="gap-2">
                <Clock className="h-4 w-4 text-blue-400" />
                Check Follow-Ups
              </Button>
            </Link>
            <Link href="/responses">
              <Button variant="outline" className="gap-2">
                <MessageSquare className="h-4 w-4 text-green-400" />
                View Responses
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
