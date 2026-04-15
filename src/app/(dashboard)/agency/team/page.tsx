"use client"

import { useState } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageInstructions } from "@/components/page-instructions"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Users, Plus, Edit, Trash2, Shield, User, Send, MessageSquare,
  Clock, Calendar, BarChart3, Target,
} from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const ALL_PAGES = ["leads", "va-queue", "sequences", "generate", "accounts-manage", "content-personas", "content-calendar", "content-creator", "content-publisher", "settings"]

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8) // 8am - 7pm

interface TeamMember {
  id: string; name: string; pin: string; email: string; phone: string
  role: string; status: string; business_ids: string[]; permissions: Record<string, boolean>
  // Stats fields (from API or computed)
  dms_sent?: number; hours_logged?: number; response_rate?: number; campaigns_assigned?: number
  schedule?: Record<string, string[]> // day -> hours
}

interface VAStats {
  va_id: string; va_name: string; dms_sent: number; responses: number
  hours_logged: number; response_rate: number; avg_daily: number
}

export default function TeamPage() {
  const { data: teamData, mutate } = useSWR("/api/team", fetcher)
  const { data: bizData } = useSWR("/api/businesses", fetcher)
  const { data: campaignsData } = useSWR("campaigns-for-team", () => dashboardApi("get_campaigns", {}))
  const { data: vaStatsData } = useSWR("va-stats", () => dashboardApi("get_va_stats"))

  const members: TeamMember[] = teamData?.data || []
  const businesses = bizData?.data || []
  const campaigns = campaignsData || []
  const vaStats: VAStats[] = vaStatsData || []

  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedVA, setSelectedVA] = useState<TeamMember | null>(null)
  const [activeTab, setActiveTab] = useState("members")
  const [confirmDeleteTeamId, setConfirmDeleteTeamId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: "", pin: "", email: "", phone: "", role: "va" as string,
    business_ids: [] as string[], permissions: {} as Record<string, boolean>,
  })

  const openCreate = () => {
    setForm({ name: "", pin: "", email: "", phone: "", role: "va", business_ids: [], permissions: ALL_PAGES.reduce((a, p) => ({ ...a, [p]: true }), {}) })
    setShowCreate(true)
  }

  const openEdit = (m: TeamMember) => {
    setForm({ name: m.name, pin: m.pin, email: m.email, phone: m.phone, role: m.role, business_ids: m.business_ids, permissions: m.permissions })
    setEditing(m)
  }

  const handleSave = async (isNew: boolean) => {
    await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: isNew ? "create" : "update", id: editing?.id, ...form }),
    })
    mutate()
    setShowCreate(false)
    setEditing(null)
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      })
      toast.success("Team member deleted")
      mutate()
    } catch { toast.error("Failed to delete") }
    finally { setConfirmDeleteTeamId(null) }
  }

  const toggleBusiness = (bizId: string) => {
    const ids = form.business_ids.includes(bizId)
      ? form.business_ids.filter((id) => id !== bizId)
      : [...form.business_ids, bizId]
    setForm({ ...form, business_ids: ids })
  }

  const getVAStats = (vaId: string): VAStats | undefined => {
    return vaStats.find((s) => s.va_id === vaId)
  }

  // Build stats chart data
  const statsChartData = members
    .filter((m) => m.role === "va")
    .map((m) => {
      const stats = getVAStats(m.id)
      return {
        name: m.name,
        sent: stats?.dms_sent || 0,
        responses: stats?.responses || 0,
        hours: stats?.hours_logged || 0,
      }
    })
    .sort((a, b) => b.sent - a.sent)

  const formOpen = showCreate || !!editing

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          👥 Team Management
          <PageInstructions title="Team Management" storageKey="instructions-team"
            steps={[
              "Add VAs and admins with name, PIN, email, and phone.",
              "View VA performance stats: DMs sent, response rate, hours logged.",
              "Assign VAs to businesses and campaigns.",
              "View the weekly schedule to manage VA shifts.",
            ]} />
        </h1>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Add Member</Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" />
            <div>
              <div className="text-lg font-bold">{members.length}</div>
              <div className="text-[10px] text-muted-foreground">Team Members</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-green-400" />
            <div>
              <div className="text-lg font-bold">{members.filter((m) => m.role === "va" && m.status === "active").length}</div>
              <div className="text-[10px] text-muted-foreground">Active VAs</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-violet-400" />
            <div>
              <div className="text-lg font-bold">{vaStats.reduce((s, v) => s + v.dms_sent, 0)}</div>
              <div className="text-[10px] text-muted-foreground">Total DMs Sent</div>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-400" />
            <div>
              <div className="text-lg font-bold">{vaStats.reduce((s, v) => s + (v.hours_logged || 0), 0).toFixed(0)}</div>
              <div className="text-[10px] text-muted-foreground">Hours Logged</div>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-3 mt-4">
          {members.map((m) => {
            const stats = getVAStats(m.id)
            return (
              <Card key={m.id} className="hover:border-primary/30 transition-all">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    {m.role === "admin" ? <Shield className="h-5 w-5 text-yellow-400" /> : <User className="h-5 w-5 text-blue-400" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{m.name}</h3>
                      <Badge variant={m.role === "admin" ? "default" : "secondary"}>{m.role}</Badge>
                      <Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{m.email || "No email"} · PIN: {m.pin}</p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>Businesses: {m.business_ids?.length || 0}</span>
                      {stats && (
                        <>
                          <span className="text-blue-400">{stats.dms_sent} DMs sent</span>
                          <span className="text-green-400">{stats.response_rate.toFixed(1)}% response rate</span>
                          <span className="text-orange-400">{stats.hours_logged.toFixed(0)}h logged</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedVA(m)}>
                      <BarChart3 className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(m)}><Edit className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => setConfirmDeleteTeamId(m.id)}><Trash2 className="h-4 w-4 text-red-400" /></Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {members.length === 0 && (
            <Card className="p-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No team members yet. Add your first VA or admin.</p>
            </Card>
          )}
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4 mt-4">
          {statsChartData.length > 0 ? (
            <>
              <Card className="p-4">
                <h3 className="font-semibold mb-4">📊 VA Performance Comparison</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={statsChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="name" stroke="#888" />
                    <YAxis stroke="#888" />
                    <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333" }} />
                    <Bar dataKey="sent" fill="#8B5CF6" name="DMs Sent" />
                    <Bar dataKey="responses" fill="#10B981" name="Responses" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <div className="grid gap-3">
                <div className="grid grid-cols-6 gap-3 text-xs font-medium text-muted-foreground px-4">
                  <span>VA Name</span>
                  <span className="text-center">DMs Sent</span>
                  <span className="text-center">Responses</span>
                  <span className="text-center">Response Rate</span>
                  <span className="text-center">Hours Logged</span>
                  <span className="text-center">Avg Daily</span>
                </div>
                {statsChartData.map((va, i) => {
                  const stats = vaStats.find((s) => s.va_name === va.name)
                  return (
                    <Card key={va.name}>
                      <CardContent className="p-3 grid grid-cols-6 gap-3 items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "👤"}</span>
                          <span className="font-medium text-sm">{va.name}</span>
                        </div>
                        <span className="text-center font-bold text-sm">{va.sent}</span>
                        <span className="text-center text-green-400 text-sm">{va.responses}</span>
                        <span className="text-center text-sm">
                          <Badge variant={stats && stats.response_rate > 10 ? "default" : "secondary"}>
                            {stats?.response_rate.toFixed(1) || 0}%
                          </Badge>
                        </span>
                        <span className="text-center text-sm">{va.hours}h</span>
                        <span className="text-center text-sm text-muted-foreground">{stats?.avg_daily.toFixed(0) || 0}/day</span>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </>
          ) : (
            <Card className="p-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No VA performance data yet. Stats appear once VAs start sending DMs.</p>
            </Card>
          )}
        </TabsContent>

        {/* Schedule Tab */}
        <TabsContent value="schedule" className="mt-4">
          <Card className="p-4 overflow-x-auto">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-400" /> Weekly VA Schedule
            </h3>
            <div className="min-w-[700px]">
              {/* Header row */}
              <div className="grid gap-1" style={{ gridTemplateColumns: `120px repeat(${DAYS.length}, 1fr)` }}>
                <div />
                {DAYS.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                ))}
              </div>
              {/* VA rows */}
              {members.filter((m) => m.role === "va" && m.status === "active").map((va) => (
                <div key={va.id} className="grid gap-1 mt-1" style={{ gridTemplateColumns: `120px repeat(${DAYS.length}, 1fr)` }}>
                  <div className="flex items-center gap-2 text-sm font-medium py-2">
                    <User className="h-3 w-3 text-blue-400" />
                    <span className="truncate">{va.name}</span>
                  </div>
                  {DAYS.map((day) => {
                    const schedule = va.schedule?.[day] || []
                    const isScheduled = schedule.length > 0
                    return (
                      <div
                        key={day}
                        className={`rounded-md h-10 flex items-center justify-center text-xs transition-all ${
                          isScheduled ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-secondary/30 text-muted-foreground/30"
                        }`}
                      >
                        {isScheduled ? schedule.join("-") : "—"}
                      </div>
                    )
                  })}
                </div>
              ))}
              {members.filter((m) => m.role === "va" && m.status === "active").length === 0 && (
                <p className="text-center text-muted-foreground py-8">No active VAs to show schedule for</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              💡 VA schedules are set via the VA edit dialog. Schedule data syncs from shift assignments.
            </p>
          </Card>
        </TabsContent>
      </Tabs>

      {/* VA Detail Dialog */}
      <Dialog open={!!selectedVA} onOpenChange={() => setSelectedVA(null)}>
        <DialogContent className="max-w-lg">
          {selectedVA && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-blue-400" /> {selectedVA.name} — Stats
                </DialogTitle>
              </DialogHeader>
              {(() => {
                const stats = getVAStats(selectedVA.id)
                return stats ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Card className="p-3 text-center">
                        <div className="text-2xl font-bold text-violet-400">{stats.dms_sent}</div>
                        <div className="text-xs text-muted-foreground">DMs Sent</div>
                      </Card>
                      <Card className="p-3 text-center">
                        <div className="text-2xl font-bold text-green-400">{stats.responses}</div>
                        <div className="text-xs text-muted-foreground">Responses</div>
                      </Card>
                      <Card className="p-3 text-center">
                        <div className="text-2xl font-bold text-yellow-400">{stats.response_rate.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">Response Rate</div>
                      </Card>
                      <Card className="p-3 text-center">
                        <div className="text-2xl font-bold text-orange-400">{stats.hours_logged.toFixed(0)}h</div>
                        <div className="text-xs text-muted-foreground">Hours Logged</div>
                      </Card>
                    </div>
                    <Card className="p-3">
                      <div className="text-sm text-muted-foreground">Average daily: <span className="font-bold text-foreground">{stats.avg_daily.toFixed(0)} DMs/day</span></div>
                    </Card>
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Assigned Businesses</h4>
                      <div className="flex flex-wrap gap-2">
                        {businesses
                          .filter((b: { id: string }) => selectedVA.business_ids?.includes(b.id))
                          .map((b: { id: string; name: string; icon: string }) => (
                            <Badge key={b.id} variant="secondary">{b.icon} {b.name}</Badge>
                          ))}
                        {(!selectedVA.business_ids || selectedVA.business_ids.length === 0) && (
                          <span className="text-sm text-muted-foreground">None assigned</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground py-4">No stats available for this VA yet.</p>
                )
              })()}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={() => { setShowCreate(false); setEditing(null) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{showCreate ? "Add" : "Edit"} Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">PIN (4 digits)</label>
                <Input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} maxLength={4} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Phone</label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="va">VA</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Business Access</label>
              <div className="space-y-2">
                {businesses.map((b: { id: string; name: string; icon: string }) => (
                  <label key={b.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.business_ids.includes(b.id)} onChange={() => toggleBusiness(b.id)} className="rounded" />
                    <span>{b.icon} {b.name}</span>
                  </label>
                ))}
                {businesses.length === 0 && <p className="text-sm text-muted-foreground">No businesses created yet</p>}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Page Permissions</label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_PAGES.map((page) => (
                  <label key={page} className="flex items-center justify-between gap-2 p-2 rounded bg-secondary/50">
                    <span className="text-sm capitalize">{page.replace(/-/g, " ")}</span>
                    <Switch
                      checked={form.permissions[page] !== false}
                      onCheckedChange={(v) => setForm({ ...form, permissions: { ...form.permissions, [page]: v } })}
                    />
                  </label>
                ))}
              </div>
            </div>

            <Button onClick={() => handleSave(showCreate)} disabled={!form.name || !form.pin} className="w-full">
              {showCreate ? "Add Member" : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!confirmDeleteTeamId} onOpenChange={(open) => { if (!open) setConfirmDeleteTeamId(null) }} title="Delete Team Member" description="Delete this team member? This cannot be undone." onConfirm={() => confirmDeleteTeamId && handleDelete(confirmDeleteTeamId)} />
    </div>
  )
}
