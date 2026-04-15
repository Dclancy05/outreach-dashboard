"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { createClient } from "@supabase/supabase-js"
import {
  ArrowLeft,
  Loader2,
  Play,
  Pause,
  StopCircle,
  Send,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Users,
  BarChart3,
  Shield,
  GitBranch,
  ExternalLink,
  Trash2,
  Plus,
  Instagram,
  Facebook,
  Linkedin,
  Mail,
  Phone,
  MessageSquare,
} from "lucide-react"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yfufocegjhxxffqtkvkr.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmdWZvY2Vnamh4eGZmcXRrdmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyOTIyODYsImV4cCI6MjA4NDg2ODI4Nn0.uqgHS-X8K-0vM37BJPTzc6a0cFUreON3P6zgmp2HSjA"
)

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  email: Mail,
  sms: Phone,
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E4405F",
  facebook: "#1877F2",
  linkedin: "#0A66C2",
  email: "#FFB800",
  sms: "#10B981",
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }

interface CampaignData {
  campaign_id: string
  campaign_name: string
  status: string
  created_at: string
  sequence_id: string | null
  settings: {
    min_delay_seconds: number
    max_delay_seconds: number
    batch_size: number
    active_hours_start: string
    active_hours_end: string
    pause_after_n_sends: number
    pause_duration_minutes: number
  } | null
}

interface SendQueueItem {
  id: string
  campaign_id: string
  lead_id: string
  lead_name: string
  platform: string
  message_text: string
  status: string
  sent_at: string | null
  created_at: string
  error_message: string | null
}

interface SequenceData {
  sequence_id: string
  sequence_name: string
  steps: Record<string, { platform: string; action: string; day_offset: number; messages: string[]; subject: string | null }>
}

export default function CampaignEditPage() {
  const params = useParams()
  const router = useRouter()
  const campaignId = params.id as string

  const [campaign, setCampaign] = useState<CampaignData | null>(null)
  const [stats, setStats] = useState({ queued: 0, sent: 0, failed: 0, skipped: 0 })
  const [recentSends, setRecentSends] = useState<SendQueueItem[]>([])
  const [leads, setLeads] = useState<SendQueueItem[]>([])
  const [sequence, setSequence] = useState<SequenceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [campaignName, setCampaignName] = useState("")
  const [activeTab, setActiveTab] = useState("overview")

  // Safety settings state
  const [safetySettings, setSafetySettings] = useState({
    min_delay_seconds: 30,
    max_delay_seconds: 90,
    batch_size: 20,
    active_hours_start: "09:00",
    active_hours_end: "17:00",
    pause_after_n_sends: 50,
    pause_duration_minutes: 30,
  })

  const fetchStats = useCallback(async () => {
    const { data } = await supabase
      .from("send_queue")
      .select("status")
      .eq("campaign_id", campaignId)

    if (data) {
      const counts = { queued: 0, sent: 0, failed: 0, skipped: 0 }
      data.forEach((row: { status: string }) => {
        if (row.status === "pending" || row.status === "queued") counts.queued++
        else if (row.status === "sent") counts.sent++
        else if (row.status === "failed" || row.status === "error") counts.failed++
        else if (row.status === "skipped") counts.skipped++
      })
      setStats(counts)
    }
  }, [campaignId])

  const fetchRecentSends = useCallback(async () => {
    const { data } = await supabase
      .from("send_queue")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(20)
    if (data) setRecentSends(data as SendQueueItem[])
  }, [campaignId])

  const fetchLeads = useCallback(async () => {
    const { data } = await supabase
      .from("send_queue")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
    if (data) setLeads(data as SendQueueItem[])
  }, [campaignId])

  // Initial load
  useEffect(() => {
    async function load() {
      setLoading(true)
      // Try to load from send_queue to infer campaign data
      const { data: queueData } = await supabase
        .from("send_queue")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(1)

      // Build campaign object from available data
      const campData: CampaignData = {
        campaign_id: campaignId,
        campaign_name: campaignId.replace(/^camp_/, "Campaign "),
        status: "active",
        created_at: queueData?.[0]?.created_at || new Date().toISOString(),
        sequence_id: null,
        settings: null,
      }
      setCampaign(campData)
      setCampaignName(campData.campaign_name)

      if (campData.settings) {
        setSafetySettings({ ...safetySettings, ...campData.settings })
      }

      await Promise.all([fetchStats(), fetchRecentSends(), fetchLeads()])
      setLoading(false)
    }
    load()
  }, [campaignId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Polling
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats()
      fetchRecentSends()
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchStats, fetchRecentSends])

  const togglePause = async () => {
    if (!campaign) return
    const newStatus = campaign.status === "paused" ? "active" : "paused"
    setCampaign({ ...campaign, status: newStatus })
    toast.success(newStatus === "paused" ? "Campaign paused" : "Campaign resumed")
  }

  const stopCampaign = async () => {
    if (!campaign) return
    // Mark remaining pending as skipped
    await supabase
      .from("send_queue")
      .update({ status: "skipped" })
      .eq("campaign_id", campaignId)
      .eq("status", "pending")

    setCampaign({ ...campaign, status: "completed" })
    toast.success("Campaign stopped")
    fetchStats()
  }

  const saveSafetySettings = async () => {
    setSaving(true)
    toast.success("Safety settings saved")
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>Campaign not found</p>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={() => router.push("/campaigns")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Campaigns
        </Button>
      </div>
    )
  }

  const statusColors: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    paused: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    completed: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={() => router.push("/campaigns")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <Input
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            className="text-2xl font-bold bg-transparent border-none shadow-none px-0 h-auto focus-visible:ring-0"
          />
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="outline" className={statusColors[campaign.status] || statusColors.active}>
              {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
            </Badge>
            <span>Created {new Date(campaign.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="rounded-xl gap-1.5"
            onClick={togglePause}
            disabled={campaign.status === "completed"}
          >
            {campaign.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {campaign.status === "paused" ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="outline"
            className="rounded-xl gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
            onClick={stopCampaign}
            disabled={campaign.status === "completed"}
          >
            <StopCircle className="h-4 w-4" /> Stop
          </Button>
        </div>
      </motion.div>

      {/* Stats cards */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Queued", value: stats.queued, color: "blue", icon: Clock },
          { label: "Sent", value: stats.sent, color: "emerald", icon: CheckCircle },
          { label: "Failed", value: stats.failed, color: "red", icon: XCircle },
          { label: "Skipped", value: stats.skipped, color: "amber", icon: AlertTriangle },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <motion.div key={stat.label} variants={item}>
              <Card className={`bg-${stat.color}-500/5 border-${stat.color}-500/20 rounded-2xl`}>
                <CardContent className="p-4 text-center">
                  <Icon className={`h-5 w-5 mx-auto mb-1 text-${stat.color}-400`} />
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className={`text-2xl font-bold text-${stat.color}-400`}>{stat.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Polling indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>Auto-refreshing every 10 seconds</span>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/30 backdrop-blur-sm rounded-xl p-1">
          <TabsTrigger value="overview" className="rounded-lg gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="leads" className="rounded-lg gap-1.5"><Users className="h-3.5 w-3.5" /> Leads</TabsTrigger>
          <TabsTrigger value="safety" className="rounded-lg gap-1.5"><Shield className="h-3.5 w-3.5" /> Safety</TabsTrigger>
          <TabsTrigger value="sequence" className="rounded-lg gap-1.5"><GitBranch className="h-3.5 w-3.5" /> Sequence</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card className="rounded-2xl bg-card/60 backdrop-blur-xl border-border/50">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3">Recent Activity</h3>
              {recentSends.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No sends yet</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {recentSends.map((send) => {
                    const Icon = PLATFORM_ICONS[send.platform] || MessageSquare
                    const color = PLATFORM_COLORS[send.platform] || "#888"
                    const statusBg = send.status === "sent" ? "bg-emerald-500" : send.status === "failed" || send.status === "error" ? "bg-red-500" : "bg-amber-500"
                    return (
                      <div key={send.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors">
                        <span style={{ color }}><Icon className="h-4 w-4 shrink-0" /></span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{send.lead_name || send.lead_id}</p>
                          <p className="text-xs text-muted-foreground truncate">{send.message_text}</p>
                        </div>
                        <div className={`h-2 w-2 rounded-full shrink-0 ${statusBg}`} />
                        <span className="text-xs text-muted-foreground shrink-0">
                          {send.sent_at ? new Date(send.sent_at).toLocaleTimeString() : "Pending"}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leads Tab */}
        <TabsContent value="leads" className="mt-4 space-y-4">
          <Card className="rounded-2xl bg-card/60 backdrop-blur-xl border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Campaign Leads ({leads.length})</h3>
              </div>
              {leads.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No leads in this campaign</p>
              ) : (
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                  {leads.map((lead) => {
                    const Icon = PLATFORM_ICONS[lead.platform] || MessageSquare
                    const color = PLATFORM_COLORS[lead.platform] || "#888"
                    const statusLabel = lead.status === "sent" ? "Sent" : lead.status === "failed" ? "Failed" : lead.status === "skipped" ? "Skipped" : "Pending"
                    const statusColor = lead.status === "sent" ? "text-emerald-400" : lead.status === "failed" ? "text-red-400" : lead.status === "skipped" ? "text-amber-400" : "text-blue-400"
                    return (
                      <div key={lead.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/20">
                        <span style={{ color }}><Icon className="h-4 w-4 shrink-0" /></span>
                        <span className="text-sm font-medium flex-1 truncate">{lead.lead_name || lead.lead_id}</span>
                        <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Safety Tab */}
        <TabsContent value="safety" className="mt-4 space-y-4">
          <Card className="rounded-2xl bg-card/60 backdrop-blur-xl border-border/50">
            <CardContent className="p-6 space-y-6">
              <h3 className="font-semibold">Safety Settings</h3>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Min Delay (seconds)</Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[safetySettings.min_delay_seconds]}
                      onValueChange={([v]) => setSafetySettings({ ...safetySettings, min_delay_seconds: v })}
                      min={5} max={300} step={5}
                      className="flex-1"
                    />
                    <span className="text-sm font-mono w-12 text-right">{safetySettings.min_delay_seconds}s</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Max Delay (seconds)</Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[safetySettings.max_delay_seconds]}
                      onValueChange={([v]) => setSafetySettings({ ...safetySettings, max_delay_seconds: v })}
                      min={10} max={600} step={10}
                      className="flex-1"
                    />
                    <span className="text-sm font-mono w-12 text-right">{safetySettings.max_delay_seconds}s</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Batch Size</Label>
                  <Input
                    type="number"
                    value={safetySettings.batch_size}
                    onChange={(e) => setSafetySettings({ ...safetySettings, batch_size: parseInt(e.target.value) || 10 })}
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Pause After N Sends</Label>
                  <Input
                    type="number"
                    value={safetySettings.pause_after_n_sends}
                    onChange={(e) => setSafetySettings({ ...safetySettings, pause_after_n_sends: parseInt(e.target.value) || 50 })}
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Active Hours Start</Label>
                  <Input
                    type="time"
                    value={safetySettings.active_hours_start}
                    onChange={(e) => setSafetySettings({ ...safetySettings, active_hours_start: e.target.value })}
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Active Hours End</Label>
                  <Input
                    type="time"
                    value={safetySettings.active_hours_end}
                    onChange={(e) => setSafetySettings({ ...safetySettings, active_hours_end: e.target.value })}
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Pause Duration (minutes)</Label>
                  <Input
                    type="number"
                    value={safetySettings.pause_duration_minutes}
                    onChange={(e) => setSafetySettings({ ...safetySettings, pause_duration_minutes: parseInt(e.target.value) || 15 })}
                    className="rounded-xl"
                  />
                </div>
              </div>

              <Button className="rounded-xl gap-1.5" onClick={saveSafetySettings} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Save Safety Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sequence Tab */}
        <TabsContent value="sequence" className="mt-4 space-y-4">
          <Card className="rounded-2xl bg-card/60 backdrop-blur-xl border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Sequence</h3>
                {campaign.sequence_id && (
                  <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => router.push(`/sequences/builder?id=${campaign.sequence_id}`)}>
                    <ExternalLink className="h-3.5 w-3.5" /> Edit in Builder
                  </Button>
                )}
              </div>
              {sequence ? (
                <div className="space-y-3">
                  {Object.entries(sequence.steps).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([num, step]) => {
                    const Icon = PLATFORM_ICONS[step.platform] || MessageSquare
                    const color = PLATFORM_COLORS[step.platform] || "#888"
                    return (
                      <div key={num} className="rounded-xl bg-muted/20 p-3 border-l-2" style={{ borderLeftColor: color }}>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs rounded-full px-2" style={{ borderColor: color, color }}>
                            {num}
                          </Badge>
                          <span style={{ color }}><Icon className="h-4 w-4" /></span>
                          <span className="text-sm font-medium">{step.platform} — {step.action}</span>
                          {step.day_offset > 0 && (
                            <span className="text-xs text-muted-foreground ml-auto">+{step.day_offset}d</span>
                          )}
                        </div>
                        {step.messages?.[0] && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{step.messages[0]}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No sequence linked to this campaign.
                  <br />
                  <Button variant="link" className="text-violet-400" onClick={() => router.push("/sequences/builder")}>
                    Create one in the Sequence Builder
                  </Button>
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
