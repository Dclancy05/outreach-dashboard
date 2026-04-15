"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { TagInput } from "@/components/tag-input"
import { AnimatedNumber, PageTransition, GlassCard } from "@/components/motion"
import { toast } from "sonner"
import {
  Radar, Plus, Play, Pause, Trash2, ExternalLink, Check, X, RefreshCw,
  MessageSquare, Send, Eye, Filter, Clock, TrendingUp, Users, Zap,
  AlertCircle, ChevronDown, MoreHorizontal, Search, ArrowUpDown, CheckCheck,
  XCircle, Edit3, RotateCcw, MessageCircle, Activity, Shield, Wifi,
} from "lucide-react"

interface Campaign {
  id: string
  name: string
  platform: string
  subreddits: string[]
  keywords: string[]
  tone: string
  account_id: string | null
  schedule_interval: string
  max_replies_per_day: number
  status: string
  last_scan_at: string | null
  match_count: number
  reply_count: number
  created_at: string
}

interface Match {
  id: string
  campaign_id: string
  post_url: string
  post_title: string
  post_body: string
  subreddit: string
  author: string
  score: number
  comment_count: number
  matched_keywords: string[]
  found_at: string
  status: string
  scout_campaigns?: { name: string }
  scout_replies?: Reply[]
}

interface Reply {
  id: string
  match_id: string
  reply_text: string
  ai_generated: boolean
  edited_by_human: boolean
  status: string
  sent_at: string | null
  created_at: string
  feedback_notes: string | null
}

interface Account {
  id: string
  platform: string
  username: string
  api_client_id: string
  api_client_secret: string
  karma: number
  account_age_days: number
  daily_limit: number
  sends_today: number
  status: string
  created_at: string
}

const SCHEDULE_OPTIONS = [
  { value: "1h", label: "Every 1 hour" },
  { value: "2h", label: "Every 2 hours" },
  { value: "4h", label: "Every 4 hours" },
  { value: "6h", label: "Every 6 hours" },
  { value: "12h", label: "Every 12 hours" },
  { value: "24h", label: "Every 24 hours" },
]

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  paused: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  warming: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  cooldown: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  banned: "bg-red-500/20 text-red-400 border-red-500/30",
  pending: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  approved: "bg-green-500/20 text-green-400 border-green-500/30",
  sent: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  skipped: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  draft: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
}

export default function SocialScoutPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("queue")
  const [showCampaignModal, setShowCampaignModal] = useState(false)
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [filterCampaign, setFilterCampaign] = useState("all")
  const [filterStatus, setFilterStatus] = useState("pending")
  const [sortBy, setSortBy] = useState("found_at")
  const [editingReply, setEditingReply] = useState<string | null>(null)
  const [editTexts, setEditTexts] = useState<Record<string, string>>({})
  const [scanning, setScanning] = useState(false)

  // Stats
  const activeCampaigns = campaigns.filter(c => c.status === "active").length
  const matchesToday = matches.filter(m => new Date(m.found_at).toDateString() === new Date().toDateString()).length
  const repliesSentToday = matches.filter(m => m.status === "sent" && m.scout_replies?.some(r => r.sent_at && new Date(r.sent_at).toDateString() === new Date().toDateString())).length
  const activeAccounts = accounts.filter(a => a.status === "active").length
  const pendingQueue = matches.filter(m => m.status === "pending").length

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [campRes, matchRes, acctRes] = await Promise.all([
        fetch("/api/social-scout/campaigns").then(r => r.json()),
        fetch("/api/social-scout/matches?limit=200").then(r => r.json()),
        fetch("/api/social-scout/accounts").then(r => r.json()),
      ])
      setCampaigns(campRes.data || [])
      setMatches(matchRes.data || [])
      setAccounts(acctRes.data || [])
    } catch (err) {
      toast.error("Failed to load data")
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const triggerScan = async (campaignId?: string) => {
    setScanning(true)
    try {
      const res = await fetch("/api/social-scout/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignId ? { campaign_id: campaignId } : {}),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Scan complete! Found ${data.new_matches} new matches`)
        fetchAll()
      } else {
        toast.error(data.error || "Scan failed")
      }
    } catch { toast.error("Scan failed") }
    setScanning(false)
  }

  const updateMatch = async (id: string, updates: Record<string, unknown>) => {
    try {
      await fetch("/api/social-scout/matches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      })
      setMatches(prev => prev.map(m => m.id === id ? { ...m, ...updates } as Match : m))
    } catch { toast.error("Update failed") }
  }

  const bulkUpdateMatches = async (ids: string[], updates: Record<string, unknown>) => {
    try {
      await fetch("/api/social-scout/matches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, ...updates }),
      })
      setMatches(prev => prev.map(m => ids.includes(m.id) ? { ...m, ...updates } as Match : m))
      toast.success(`Updated ${ids.length} items`)
    } catch { toast.error("Bulk update failed") }
  }

  const approveAndSend = async (match: Match) => {
    const reply = match.scout_replies?.[0]
    const text = editTexts[match.id] || reply?.reply_text || ""
    if (!text) { toast.error("No reply text"); return }
    
    if (reply) {
      await fetch("/api/social-scout/replies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reply.id, status: "sent", reply_text: text }),
      })
    }
    await updateMatch(match.id, { status: "approved" })
    toast.success("Reply approved & queued for sending!")
  }

  const skipMatch = async (matchId: string) => {
    await updateMatch(matchId, { status: "skipped" })
    toast("Skipped", { icon: "⏭️" })
  }

  const filteredMatches = matches.filter(m => {
    if (filterCampaign !== "all" && m.campaign_id !== filterCampaign) return false
    if (filterStatus !== "all" && m.status !== filterStatus) return false
    return true
  }).sort((a, b) => {
    if (sortBy === "score") return b.score - a.score
    return new Date(b.found_at).getTime() - new Date(a.found_at).getTime()
  })

  const sentReplies = matches
    .filter(m => m.status === "sent" || m.status === "approved")
    .flatMap(m => (m.scout_replies || []).map(r => ({ ...r, match: m })))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="rounded-xl bg-green-500/10 p-2.5">
                <Radar className="h-7 w-7 text-green-400" />
              </div>
              Social Scout
            </h1>
            <p className="text-muted-foreground mt-1">Monitor Reddit for relevant posts & queue AI replies</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => triggerScan()}
              disabled={scanning}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? "Scanning..." : "Scan Now"}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Active Campaigns", value: activeCampaigns, icon: Zap, color: "text-green-400", bg: "bg-green-500/10" },
            { label: "Matches Today", value: matchesToday, icon: Search, color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "Replies Sent", value: repliesSentToday, icon: Send, color: "text-purple-400", bg: "bg-purple-500/10" },
            { label: "Active Accounts", value: activeAccounts, icon: Users, color: "text-orange-400", bg: "bg-orange-500/10" },
            { label: "Pending Queue", value: pendingQueue, icon: Clock, color: "text-yellow-400", bg: "bg-yellow-500/10" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="relative overflow-hidden border-border/50 bg-card/60 backdrop-blur-xl">
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className={`text-2xl font-bold mt-1 ${stat.color}`}>
                        <AnimatedNumber value={stat.value} />
                      </p>
                    </div>
                    <div className={`rounded-xl p-2.5 ${stat.bg}`}>
                      <stat.icon className={`h-5 w-5 ${stat.color}`} />
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-card/60 backdrop-blur-xl border border-border/50">
            <TabsTrigger value="queue" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Approval Queue
              {pendingQueue > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 text-[10px]">{pendingQueue}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="gap-2">
              <Radar className="h-4 w-4" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="accounts" className="gap-2">
              <Shield className="h-4 w-4" />
              Accounts
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-2">
              <Activity className="h-4 w-4" />
              Activity Log
            </TabsTrigger>
          </TabsList>

          {/* APPROVAL QUEUE */}
          <TabsContent value="queue" className="space-y-4 mt-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={filterCampaign} onValueChange={setFilterCampaign}>
                <SelectTrigger className="w-[200px] bg-card/60 border-border/50">
                  <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="All Campaigns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaigns.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[160px] bg-card/60 border-border/50">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[160px] bg-card/60 border-border/50">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="found_at">Most Recent</SelectItem>
                  <SelectItem value="score">Highest Score</SelectItem>
                </SelectContent>
              </Select>
              {filterStatus === "pending" && filteredMatches.length > 0 && (
                <div className="flex gap-2 ml-auto">
                  <Button size="sm" variant="outline" className="gap-1.5 text-green-400 border-green-500/30 hover:bg-green-500/10"
                    onClick={() => bulkUpdateMatches(filteredMatches.map(m => m.id), { status: "approved" })}>
                    <CheckCheck className="h-3.5 w-3.5" /> Approve All
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-zinc-400 border-zinc-500/30 hover:bg-zinc-500/10"
                    onClick={() => bulkUpdateMatches(filteredMatches.map(m => m.id), { status: "skipped" })}>
                    <XCircle className="h-3.5 w-3.5" /> Skip All
                  </Button>
                </div>
              )}
            </div>

            {/* Match Cards */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredMatches.length === 0 ? (
              <Card className="p-12 text-center border-border/50 bg-card/60 backdrop-blur-xl">
                <Radar className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No matches found. Try running a scan!</p>
              </Card>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {filteredMatches.map((match, i) => {
                    const reply = match.scout_replies?.[0]
                    const replyText = editTexts[match.id] ?? reply?.reply_text ?? ""
                    const isEditing = editingReply === match.id
                    const age = Math.round((Date.now() - new Date(match.found_at).getTime()) / 3600000)

                    return (
                      <motion.div
                        key={match.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20, height: 0 }}
                        transition={{ delay: i * 0.03 }}
                      >
                        <Card className="border-border/50 bg-card/60 backdrop-blur-xl overflow-hidden hover:border-border/80 transition-all">
                          <div className="p-5">
                            {/* Post Header */}
                            <div className="flex items-start gap-3 mb-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-400 border-orange-500/30">
                                    r/{match.subreddit}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">u/{match.author}</span>
                                  <span className="text-[10px] text-muted-foreground">• {age}h ago</span>
                                  <span className="text-[10px] text-muted-foreground">↑ {match.score}</span>
                                  <span className="text-[10px] text-muted-foreground">💬 {match.comment_count}</span>
                                  <Badge className={`text-[10px] ${STATUS_COLORS[match.status] || ""}`}>
                                    {match.status}
                                  </Badge>
                                </div>
                                <a href={match.post_url} target="_blank" rel="noopener noreferrer"
                                  className="text-sm font-semibold hover:text-primary transition-colors flex items-center gap-1.5">
                                  {match.post_title}
                                  <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                                </a>
                                {match.post_body && (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{match.post_body}</p>
                                )}
                              </div>
                            </div>

                            {/* Context */}
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              <span className="text-[10px] text-muted-foreground">Campaign: {match.scout_campaigns?.name || "—"}</span>
                              <span className="text-[10px] text-muted-foreground">•</span>
                              <span className="text-[10px] text-muted-foreground">Keywords:</span>
                              {match.matched_keywords?.map(kw => (
                                <Badge key={kw} variant="outline" className="text-[10px] bg-blue-500/10 text-blue-300 border-blue-500/30">
                                  {kw}
                                </Badge>
                              ))}
                            </div>

                            {/* Reply Section */}
                            {replyText && (
                              <div className="bg-muted/20 rounded-xl p-3 mb-3 border border-border/30">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <MessageCircle className="h-3.5 w-3.5 text-green-400" />
                                  <span className="text-xs font-medium text-green-400">AI Reply</span>
                                  {reply?.ai_generated && <Badge variant="outline" className="text-[9px]">AI</Badge>}
                                </div>
                                {isEditing ? (
                                  <Textarea
                                    value={editTexts[match.id] ?? replyText}
                                    onChange={e => setEditTexts(prev => ({ ...prev, [match.id]: e.target.value }))}
                                    className="min-h-[100px] text-sm bg-background/50"
                                    autoFocus
                                  />
                                ) : (
                                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{replyText}</p>
                                )}
                              </div>
                            )}

                            {/* Actions */}
                            {match.status === "pending" && (
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={() => approveAndSend(match)}>
                                  <Check className="h-3.5 w-3.5" /> Approve & Send
                                </Button>
                                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
                                  if (isEditing) { setEditingReply(null) } else { setEditingReply(match.id) }
                                }}>
                                  <Edit3 className="h-3.5 w-3.5" /> {isEditing ? "Done" : "Edit"}
                                </Button>
                                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => toast("Regeneration coming soon!")}>
                                  <RotateCcw className="h-3.5 w-3.5" /> Regenerate
                                </Button>
                                <Button size="sm" variant="outline" className="gap-1.5 text-red-400 hover:bg-red-500/10" onClick={() => skipMatch(match.id)}>
                                  <X className="h-3.5 w-3.5" /> Skip
                                </Button>
                              </div>
                            )}
                          </div>
                        </Card>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )}
          </TabsContent>

          {/* CAMPAIGNS TAB */}
          <TabsContent value="campaigns" className="space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Campaign Manager</h2>
              <Button onClick={() => { setEditingCampaign(null); setShowCampaignModal(true) }} className="gap-2">
                <Plus className="h-4 w-4" /> New Campaign
              </Button>
            </div>

            {campaigns.length === 0 ? (
              <Card className="p-12 text-center border-border/50 bg-card/60 backdrop-blur-xl">
                <Radar className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground mb-4">No campaigns yet. Create one to start monitoring!</p>
                <Button onClick={() => { setEditingCampaign(null); setShowCampaignModal(true) }} className="gap-2">
                  <Plus className="h-4 w-4" /> Create Campaign
                </Button>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {campaigns.map(campaign => (
                  <Card key={campaign.id} className="border-border/50 bg-card/60 backdrop-blur-xl p-5 hover:border-border/80 transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2">
                          {campaign.name}
                          <Badge className={STATUS_COLORS[campaign.status]}>{campaign.status}</Badge>
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {campaign.subreddits?.length || 0} subreddits • {campaign.keywords?.length || 0} keywords • {campaign.schedule_interval}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground mb-3">
                      <span>Matches: <strong className="text-foreground">{campaign.match_count}</strong></span>
                      <span>Replies: <strong className="text-foreground">{campaign.reply_count}</strong></span>
                      <span>Last scan: {campaign.last_scan_at ? new Date(campaign.last_scan_at).toLocaleString() : "Never"}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {campaign.subreddits?.slice(0, 4).map(s => (
                        <Badge key={s} variant="outline" className="text-[10px] bg-orange-500/10 text-orange-400 border-orange-500/30">r/{s}</Badge>
                      ))}
                      {(campaign.subreddits?.length || 0) > 4 && (
                        <Badge variant="outline" className="text-[10px]">+{campaign.subreddits.length - 4} more</Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => triggerScan(campaign.id)} disabled={scanning}>
                        <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} /> Scan
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5"
                        onClick={async () => {
                          const newStatus = campaign.status === "active" ? "paused" : "active"
                          await fetch("/api/social-scout/campaigns", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: campaign.id, status: newStatus }),
                          })
                          setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: newStatus } : c))
                          toast.success(`Campaign ${newStatus}`)
                        }}>
                        {campaign.status === "active" ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Resume</>}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditingCampaign(campaign); setShowCampaignModal(true) }}>
                        <Edit3 className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5 text-red-400 hover:bg-red-500/10"
                        onClick={async () => {
                          await fetch(`/api/social-scout/campaigns?id=${campaign.id}`, { method: "DELETE" })
                          setCampaigns(prev => prev.filter(c => c.id !== campaign.id))
                          toast.success("Campaign deleted")
                        }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ACCOUNTS TAB */}
          <TabsContent value="accounts" className="space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Reddit Accounts</h2>
                <p className="text-xs text-muted-foreground">Manage accounts used for posting replies</p>
              </div>
              <Button onClick={() => setShowAccountModal(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Add Account
              </Button>
            </div>

            <Card className="border-border/50 bg-card/60 backdrop-blur-xl p-4">
              <div className="flex items-start gap-3 text-xs text-muted-foreground">
                <AlertCircle className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground mb-1">How to set up a Reddit API app:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Go to <a href="https://www.reddit.com/prefs/apps" target="_blank" className="text-primary hover:underline">reddit.com/prefs/apps</a></li>
                    <li>Click &quot;create another app...&quot; at the bottom</li>
                    <li>Select &quot;script&quot; as the type</li>
                    <li>Set redirect URI to <code className="bg-muted/50 px-1 rounded">http://localhost:8080</code></li>
                    <li>Copy the Client ID (under the app name) and Client Secret</li>
                  </ol>
                </div>
              </div>
            </Card>

            {accounts.length === 0 ? (
              <Card className="p-12 text-center border-border/50 bg-card/60 backdrop-blur-xl">
                <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No accounts yet. Add your first Reddit account above.</p>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {accounts.map(account => {
                  const healthColor = account.status === "active" ? "bg-green-500" :
                    account.status === "warming" ? "bg-yellow-500" :
                    account.status === "cooldown" ? "bg-orange-500" : "bg-red-500"

                  return (
                    <Card key={account.id} className="border-border/50 bg-card/60 backdrop-blur-xl p-4 hover:border-border/80 transition-all">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="relative">
                          <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400 font-bold">
                            {account.username?.[0]?.toUpperCase() || "?"}
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${healthColor}`} />
                        </div>
                        <div>
                          <p className="font-medium text-sm">u/{account.username}</p>
                          <Badge className={`text-[10px] ${STATUS_COLORS[account.status]}`}>{account.status}</Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className="bg-muted/20 rounded-lg px-2.5 py-1.5">
                          <span className="text-muted-foreground">Karma</span>
                          <p className="font-semibold">{account.karma.toLocaleString()}</p>
                        </div>
                        <div className="bg-muted/20 rounded-lg px-2.5 py-1.5">
                          <span className="text-muted-foreground">Age</span>
                          <p className="font-semibold">{account.account_age_days}d</p>
                        </div>
                        <div className="bg-muted/20 rounded-lg px-2.5 py-1.5">
                          <span className="text-muted-foreground">Today</span>
                          <p className="font-semibold">{account.sends_today}/{account.daily_limit}</p>
                        </div>
                        <div className="bg-muted/20 rounded-lg px-2.5 py-1.5">
                          <span className="text-muted-foreground">Platform</span>
                          <p className="font-semibold capitalize">{account.platform}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={async () => {
                          await fetch("/api/social-scout/accounts", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: account.id, daily_limit: account.daily_limit + 5 }),
                          })
                          setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, daily_limit: a.daily_limit + 5 } : a))
                        }}>
                          +5 Limit
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-red-400 hover:bg-red-500/10 text-xs"
                          onClick={async () => {
                            await fetch(`/api/social-scout/accounts?id=${account.id}`, { method: "DELETE" })
                            setAccounts(prev => prev.filter(a => a.id !== account.id))
                            toast.success("Account removed")
                          }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* ACTIVITY LOG */}
          <TabsContent value="activity" className="space-y-4 mt-4">
            <h2 className="text-lg font-semibold">Activity Log</h2>
            {sentReplies.length === 0 ? (
              <Card className="p-12 text-center border-border/50 bg-card/60 backdrop-blur-xl">
                <Activity className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No activity yet. Approve some replies to see them here!</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {sentReplies.slice(0, 50).map((item, i) => (
                  <motion.div key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}>
                    <Card className="border-border/50 bg-card/60 backdrop-blur-xl p-4 flex items-center gap-4">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center ${item.status === "sent" ? "bg-green-500/10" : item.status === "failed" ? "bg-red-500/10" : "bg-blue-500/10"}`}>
                        {item.status === "sent" ? <Check className="h-4 w-4 text-green-400" /> :
                         item.status === "failed" ? <X className="h-4 w-4 text-red-400" /> :
                         <Clock className="h-4 w-4 text-blue-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{(item as any).match?.post_title || "Reply"}</p>
                        <p className="text-xs text-muted-foreground">
                          r/{(item as any).match?.subreddit} • {item.reply_text?.slice(0, 80)}...
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge className={STATUS_COLORS[item.status]}>{item.status}</Badge>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {new Date(item.created_at).toLocaleString()}
                        </p>
                      </div>
                      {(item as any).match?.post_url && (
                        <a href={(item as any).match.post_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </a>
                      )}
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Campaign Modal */}
        <CampaignModal
          open={showCampaignModal}
          onClose={() => setShowCampaignModal(false)}
          campaign={editingCampaign}
          accounts={accounts}
          onSave={async (data) => {
            if (editingCampaign) {
              await fetch("/api/social-scout/campaigns", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: editingCampaign.id, ...data }),
              })
            } else {
              await fetch("/api/social-scout/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
              })
            }
            toast.success(editingCampaign ? "Campaign updated" : "Campaign created")
            setShowCampaignModal(false)
            fetchAll()
          }}
        />

        {/* Account Modal */}
        <AccountModal
          open={showAccountModal}
          onClose={() => setShowAccountModal(false)}
          onSave={async (data) => {
            await fetch("/api/social-scout/accounts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            })
            toast.success("Account added")
            setShowAccountModal(false)
            fetchAll()
          }}
        />
      </div>
    </PageTransition>
  )
}

// Campaign Modal Component
function CampaignModal({ open, onClose, campaign, accounts, onSave }: {
  open: boolean
  onClose: () => void
  campaign: Campaign | null
  accounts: Account[]
  onSave: (data: Record<string, unknown>) => void
}) {
  const [name, setName] = useState("")
  const [subreddits, setSubreddits] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [tone, setTone] = useState("helpful expert")
  const [accountId, setAccountId] = useState("")
  const [schedule, setSchedule] = useState("4h")
  const [maxReplies, setMaxReplies] = useState(10)

  useEffect(() => {
    if (campaign) {
      setName(campaign.name)
      setSubreddits(campaign.subreddits || [])
      setKeywords(campaign.keywords || [])
      setTone(campaign.tone || "helpful expert")
      setAccountId(campaign.account_id || "")
      setSchedule(campaign.schedule_interval)
      setMaxReplies(campaign.max_replies_per_day)
    } else {
      setName(""); setSubreddits([]); setKeywords([]); setTone("helpful expert")
      setAccountId(""); setSchedule("4h"); setMaxReplies(10)
    }
  }, [campaign, open])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle>{campaign ? "Edit Campaign" : "New Campaign"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Campaign Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. HVAC Homeowners" className="mt-1" />
          </div>
          <div>
            <Label className="flex items-center gap-2">
              Platform
              <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-400">Reddit</Badge>
              <Badge variant="outline" className="text-[10px] opacity-50">Twitter — Coming Soon</Badge>
            </Label>
          </div>
          <div>
            <Label>Subreddits to Monitor</Label>
            <div className="mt-1 rounded-xl border border-border/50 bg-background/50 px-3 py-2">
              <TagInput tags={subreddits} onChange={setSubreddits} placeholder="Type subreddit and press Enter..." />
            </div>
          </div>
          <div>
            <Label>Keywords to Match</Label>
            <div className="mt-1 rounded-xl border border-border/50 bg-background/50 px-3 py-2">
              <TagInput tags={keywords} onChange={setKeywords} placeholder="Type keyword and press Enter..." />
            </div>
          </div>
          <div>
            <Label>Tone / Angle</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="helpful expert">Helpful Expert</SelectItem>
                <SelectItem value="college student sharing experience">College Student</SelectItem>
                <SelectItem value="casual recommendation">Casual Recommendation</SelectItem>
                <SelectItem value="industry insider">Industry Insider</SelectItem>
                <SelectItem value="concerned citizen">Concerned Citizen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Schedule</Label>
              <Select value={schedule} onValueChange={setSchedule}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCHEDULE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Max Replies/Day</Label>
              <Input type="number" value={maxReplies} onChange={e => setMaxReplies(parseInt(e.target.value) || 10)} className="mt-1" />
            </div>
          </div>
          {accounts.length > 0 && (
            <div>
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select account..." /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>u/{a.username}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={() => onSave({
            name, subreddits, keywords, tone, account_id: accountId || null,
            schedule_interval: schedule, max_replies_per_day: maxReplies,
          })} className="w-full gap-2">
            <Check className="h-4 w-4" /> {campaign ? "Update Campaign" : "Create Campaign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Account Modal Component
function AccountModal({ open, onClose, onSave }: {
  open: boolean
  onClose: () => void
  onSave: (data: Record<string, unknown>) => void
}) {
  const [username, setUsername] = useState("")
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [dailyLimit, setDailyLimit] = useState(10)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle>Add Reddit Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Reddit Username</Label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="your_username" className="mt-1" />
          </div>
          <div>
            <Label>API Client ID</Label>
            <Input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Found under app name" className="mt-1" />
          </div>
          <div>
            <Label>API Client Secret</Label>
            <Input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="Secret key" className="mt-1" />
          </div>
          <div>
            <Label>Daily Reply Limit</Label>
            <Input type="number" value={dailyLimit} onChange={e => setDailyLimit(parseInt(e.target.value) || 10)} className="mt-1" />
          </div>
          <Button onClick={() => {
            onSave({ username, api_client_id: clientId, api_client_secret: clientSecret, daily_limit: dailyLimit })
            setUsername(""); setClientId(""); setClientSecret(""); setDailyLimit(10)
          }} className="w-full gap-2">
            <Plus className="h-4 w-4" /> Add Account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
