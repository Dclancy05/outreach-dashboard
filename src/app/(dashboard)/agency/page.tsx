"use client"

import { useState } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/dashboard/stat-card"
import { PageInstructions } from "@/components/page-instructions"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Users,
  Send,
  MessageSquare,
  Plus,
  Activity,
  ArrowRight,
  Store,
  TrendingUp,
  Shield,
  BarChart3,
  Trash2,
  ArchiveRestore,
  Eye,
  EyeOff,
} from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const COLORS = [
  "#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#EC4899", "#06B6D4", "#F97316",
]

const ICONS = ["🏪", "💈", "🍕", "🏋️", "🏥", "🎨", "📸", "🏠", "🚗", "💻", "📱", "🎯"]

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}

export default function AgencyHomePage() {
  const { data: bizData, mutate } = useSWR("/api/businesses", fetcher)
  const { data: activityData } = useSWR("/api/activity?limit=10", fetcher)
  const { data: analytics } = useSWR("agency_analytics", () => dashboardApi("get_agency_analytics"), { refreshInterval: 30000 })

  const [showCreate, setShowCreate] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [newBiz, setNewBiz] = useState({ name: "", description: "", service_type: "", color: COLORS[0], icon: "🏪" })
  const [creating, setCreating] = useState(false)
  const [confirmDeleteAgencyBizId, setConfirmDeleteAgencyBizId] = useState<string | null>(null)

  const allBusinesses: Array<{
    id: string; name: string; description: string; service_type: string;
    color: string; icon: string; status: string; leads_count: number;
    accounts_count: number; messages_sent: number;
  }> = bizData?.data || []

  const businesses = showArchived ? allBusinesses : allBusinesses.filter(b => b.status !== "archived")
  const archivedCount = allBusinesses.filter(b => b.status === "archived").length
  const activities = activityData?.data || []

  const handleCreate = async () => {
    setCreating(true)
    try {
      await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...newBiz }),
      })
      mutate()
      setShowCreate(false)
      setNewBiz({ name: "", description: "", service_type: "", color: COLORS[0], icon: "🏪" })
    } finally {
      setCreating(false)
    }
  }

  const selectAndGo = (biz: typeof allBusinesses[0]) => {
    localStorage.setItem("selected_business", JSON.stringify(biz))
    window.location.href = "/leads"
  }

  const handleArchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch("/api/businesses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive", id }) })
    mutate()
  }

  const handleUnarchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch("/api/businesses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", id, status: "active" }) })
    mutate()
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch("/api/businesses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) })
      toast.success("Business deleted"); mutate()
    } catch { toast.error("Failed to delete") }
    finally { setConfirmDeleteAgencyBizId(null) }
  }

  const ah = analytics?.account_health || { active: 0, warming: 0, at_limit: 0, banned: 0, paused: 0 }
  const funnel = analytics?.funnel || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            🏢 Agency HQ
            <PageInstructions
              title="Agency Home"
              storageKey="instructions-agency-home"
              steps={[
                "This is your agency command center with live analytics.",
                "Click any business card to enter it and manage outreach.",
                "Monitor DM sending, response rates, and account health.",
              ]}
            />
          </h1>
          <p className="text-muted-foreground mt-1">Manage all your businesses from one place</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Business
        </Button>
      </div>

      {/* Live Analytics Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="DMs Today" value={analytics?.dms_today || 0} icon={Send} color="green" />
        <StatCard title="DMs This Week" value={analytics?.dms_week || 0} icon={BarChart3} color="blue" />
        <StatCard title="Response Rate" value={`${analytics?.response_rate || 0}%`} icon={MessageSquare} color="purple" />
        <StatCard title="Active VAs" value={analytics?.active_vas || 0} icon={Users} color="orange" />
      </div>

      {/* Account Health + Funnel Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-purple-400" /> Account Health
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm">{ah.active} Active</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-500/10">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-sm">{ah.warming} Warming</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10">
                <span className="w-2 h-2 rounded-full bg-orange-500" />
                <span className="text-sm">{ah.at_limit} At Limit</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-sm">{ah.banned} Banned</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-400" /> Conversion Funnel
            </h3>
            <div className="space-y-2">
              {[
                { label: "Total Leads", value: funnel.total_leads || 0, color: "bg-blue-500", width: 100 },
                { label: "Messaged", value: funnel.messaged || 0, color: "bg-purple-500", width: funnel.total_leads ? ((funnel.messaged || 0) / funnel.total_leads * 100) : 0 },
                { label: "Responded", value: funnel.responded || 0, color: "bg-green-500", width: funnel.total_leads ? ((funnel.responded || 0) / funnel.total_leads * 100) : 0 },
                { label: "Booked", value: funnel.booked || 0, color: "bg-yellow-500", width: funnel.total_leads ? ((funnel.booked || 0) / funnel.total_leads * 100) : 0 },
                { label: "Closed", value: funnel.closed || 0, color: "bg-red-500", width: funnel.total_leads ? ((funnel.closed || 0) / funnel.total_leads * 100) : 0 },
              ].map(step => (
                <div key={step.label} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-20">{step.label}</span>
                  <div className="flex-1 bg-secondary rounded-full h-4 overflow-hidden">
                    <div className={`${step.color} h-full rounded-full transition-all`} style={{ width: `${Math.max(step.width, 2)}%` }} />
                  </div>
                  <span className="text-sm font-medium w-10 text-right">{step.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top VAs */}
      {analytics?.top_vas && analytics.top_vas.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">🏆 Top VAs Today</h3>
            <div className="space-y-2">
              {analytics.top_vas.map((va: { session_id: string; va_name: string; sent: number; responses: number }, i: number) => (
                <div key={va.session_id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30">
                  <span className="text-lg">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "👤"}</span>
                  <span className="flex-1 font-medium">{va.va_name}</span>
                  <span className="text-sm text-green-400">{va.sent} sent</span>
                  <span className="text-sm text-blue-400">{va.responses} responses</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All-Time Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold">{analytics?.dms_all_time || 0}</div><div className="text-xs text-muted-foreground">Total DMs Sent</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold">{analytics?.responses_all_time || 0}</div><div className="text-xs text-muted-foreground">Total Responses</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold">{analytics?.responses_week || 0}</div><div className="text-xs text-muted-foreground">Responses This Week</div></CardContent></Card>
      </div>

      {/* Business Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Your Businesses</h2>
          {archivedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowArchived(!showArchived)} className="gap-2 text-muted-foreground">
              {showArchived ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showArchived ? "Hide" : "Show"} {archivedCount} archived
            </Button>
          )}
        </div>
        {businesses.length === 0 ? (
          <Card className="p-12 text-center">
            <Store className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No businesses yet</h3>
            <p className="text-muted-foreground mb-4">Create your first business to start managing outreach</p>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Create Business
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {businesses.map((biz) => (
              <div key={biz.id}>
                <Card
                  className={cn("cursor-pointer hover:border-primary/50 transition-all group", biz.status === "archived" && "opacity-50")}
                  onClick={() => selectAndGo(biz)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                          style={{ backgroundColor: (biz.color || "#8B5CF6") + "20" }}
                        >
                          {biz.icon || "🏪"}
                        </div>
                        <div>
                          <h3 className="font-semibold group-hover:text-primary transition-colors">{biz.name}</h3>
                          {biz.service_type && (
                            <p className="text-xs text-muted-foreground">{biz.service_type}</p>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    {biz.status === "archived" && <Badge variant="secondary" className="text-xs mb-2">Archived</Badge>}
                    {biz.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{biz.description}</p>
                    )}
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {biz.leads_count} leads
                      </span>
                      <span className="flex items-center gap-1">
                        <Send className="h-3 w-3" /> {biz.messages_sent} sent
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> {biz.accounts_count} accounts
                      </span>
                    </div>
                  </CardContent>
                </Card>
                <div className="flex gap-2 mt-1 justify-end">
                  {biz.status === "archived" ? (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => handleUnarchive(biz.id, e)}>
                      <ArchiveRestore className="h-3 w-3 mr-1" /> Unarchive
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => handleArchive(biz.id, e)}>
                      <ArchiveRestore className="h-3 w-3 mr-1" /> Archive
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" onClick={(e) => { e.stopPropagation(); setConfirmDeleteAgencyBizId(biz.id) }}>
                    <Trash2 className="h-3 w-3 mr-1" /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      {activities.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          <Card>
            <CardContent className="p-4 space-y-3">
              {activities.map((a: { id: string; action: string; details: string; created_at: string }) => (
                <div key={a.id} className="flex items-center gap-3 text-sm">
                  <Activity className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1">{a.action}</span>
                  {a.details && <span className="text-muted-foreground text-xs">{a.details}</span>}
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Business Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Business</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Business Name</label>
              <Input value={newBiz.name} onChange={(e) => setNewBiz({ ...newBiz, name: e.target.value })} placeholder="e.g. Manhattan Restaurants" />
            </div>
            <div>
              <label className="text-sm font-medium">Service Type</label>
              <Input value={newBiz.service_type} onChange={(e) => setNewBiz({ ...newBiz, service_type: e.target.value })} placeholder="e.g. Social Media Management" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea value={newBiz.description} onChange={(e) => setNewBiz({ ...newBiz, description: e.target.value })} placeholder="Brief description..." />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Icon</label>
              <div className="flex flex-wrap gap-2">
                {ICONS.map((icon) => (
                  <button key={icon} onClick={() => setNewBiz({ ...newBiz, icon })}
                    className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-lg border transition-all",
                      newBiz.icon === icon ? "border-primary bg-primary/10" : "border-border hover:border-primary/50")}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Color</label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setNewBiz({ ...newBiz, color: c })}
                    className={cn("w-8 h-8 rounded-full border-2 transition-all",
                      newBiz.color === c ? "border-white scale-110" : "border-transparent")}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <Button onClick={handleCreate} disabled={!newBiz.name || creating} className="w-full">
              {creating ? "Creating..." : "Create Business"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
