"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import {
  Shield, Plus, Wifi, WifiOff, Globe, Instagram, Facebook, Linkedin,
  Server, ChevronDown, ChevronUp, Settings, Zap, Calendar,
  Activity, RefreshCw, Trash2, Edit2, ExternalLink, MapPin, Sparkles,
  Monitor, Layers, Pencil, Check, X, Eye, Link2, CheckCircle2, AlertTriangle,
  ArrowRight,
} from "lucide-react"
import { ALL_PLATFORMS, SOCIAL_PLATFORMS, getPlatform } from "@/lib/platforms"
import Link from "next/link"
import { useRouter } from "next/navigation"
import VncLoginFlow from "@/components/vnc-login-flow"

// ── Animation variants ──────────────────────────────────────────────

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }

// ── Types ───────────────────────────────────────────────────────────

interface ProxyGroup {
  id: string; provider: string; ip: string; port: string; username: string; password: string;
  location_city: string; location_state: string; location_country: string;
  status: string; monthly_cost: number; health_check_at: string; business_id: string;
  name: string;
}

interface Account {
  account_id: string; platform: string; username: string; display_name: string;
  status: string; daily_limit: string; sends_today: string; connection_type: string;
  proxy_group_id: string; warmup_sequence_id: string; warmup_day: number;
  health_score: number; business_id: string; notes: string;
}

interface WarmupSequence {
  id: string; name: string; platform: string; steps: { day_start: number; day_end: number; daily_limit: number }[];
}

const platformIcons: Record<string, typeof Instagram> = { instagram: Instagram, facebook: Facebook, linkedin: Linkedin, tiktok: Zap, twitter: Globe, youtube: Monitor, pinterest: MapPin, snapchat: Zap, reddit: Globe, threads: Layers, whatsapp: Globe, telegram: Globe, discord: Globe }
const platformColors: Record<string, string> = {
  instagram: "text-pink-400", facebook: "text-blue-400", linkedin: "text-sky-400", tiktok: "text-zinc-300", twitter: "text-blue-300", youtube: "text-red-400", pinterest: "text-rose-400", snapchat: "text-yellow-400", reddit: "text-orange-400", threads: "text-zinc-300", whatsapp: "text-green-400", telegram: "text-cyan-400", discord: "text-indigo-400",
}
const platformBorders: Record<string, string> = {
  instagram: "border-l-pink-500", facebook: "border-l-blue-500", linkedin: "border-l-sky-500", tiktok: "border-l-zinc-500", twitter: "border-l-blue-400", youtube: "border-l-red-500", pinterest: "border-l-rose-500", snapchat: "border-l-yellow-500", reddit: "border-l-orange-500", threads: "border-l-zinc-500", whatsapp: "border-l-green-500", telegram: "border-l-cyan-500", discord: "border-l-indigo-500",
}
const platformGradients: Record<string, string> = {
  instagram: "from-pink-500/10 to-transparent", facebook: "from-blue-500/10 to-transparent", linkedin: "from-sky-500/10 to-transparent", tiktok: "from-zinc-500/10 to-transparent", twitter: "from-blue-400/10 to-transparent", youtube: "from-red-500/10 to-transparent", pinterest: "from-rose-500/10 to-transparent", snapchat: "from-yellow-500/10 to-transparent", reddit: "from-orange-500/10 to-transparent",
}
const statusColors: Record<string, string> = {
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  warming: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  paused: "bg-muted/30 text-muted-foreground border-border/50",
  banned: "bg-red-500/20 text-red-400 border-red-500/30",
  cooldown: "bg-orange-500/20 text-orange-400 border-orange-500/30",
}

function getWarmupLimit(seq: WarmupSequence | undefined, day: number): number {
  if (!seq?.steps) return 40
  const step = seq.steps.find(s => day >= s.day_start && day <= s.day_end)
  return step?.daily_limit || 40
}

function PulseDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", color)} />
      <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", color)} />
    </span>
  )
}

function HealthRing({ score, size = 36 }: { score: number; size?: number }) {
  const radius = (size - 6) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = score >= 80 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444"
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/40" />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        className="transition-all duration-1000 ease-out" />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central" fill={color}
        fontSize="10" fontWeight="bold" className="transform rotate-90" style={{ transformOrigin: 'center' }}>{score}</text>
    </svg>
  )
}

export default function AccountsPage() {
  const [proxies, setProxies] = useState<ProxyGroup[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [warmupSeqs, setWarmupSeqs] = useState<WarmupSequence[]>([])
  const [loading, setLoading] = useState(true)
  const [showProxyForm, setShowProxyForm] = useState(false)
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [showWarmupForm, setShowWarmupForm] = useState(false)
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editNameValue, setEditNameValue] = useState("")
  const [proxyForm, setProxyForm] = useState({ provider: "", ip: "", port: "", username: "", password: "", location_city: "", location_state: "", location_country: "US", monthly_cost: "" })
  const [accountForm, setAccountForm] = useState({ platform: "instagram", username: "", display_name: "", connection_type: "novnc", daily_limit: "40", proxy_group_id: "" })
  const [warmupForm, setWarmupForm] = useState({ name: "", platform: "", steps: [{ day_start: 1, day_end: 5, daily_limit: 5 }, { day_start: 6, day_end: 10, daily_limit: 10 }, { day_start: 11, day_end: 20, daily_limit: 20 }, { day_start: 21, day_end: 999, daily_limit: 40 }] })
  const [vncFlowOpen, setVncFlowOpen] = useState(false)
  const [vncProxyGroupId, setVncProxyGroupId] = useState("")
  const [vncProxyIp, setVncProxyIp] = useState("")
  const [vncProxyLocation, setVncProxyLocation] = useState("")
  const [vncExistingAccount, setVncExistingAccount] = useState<{ account_id: string; platform: string; username: string } | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState("")
  const [showEditProxyDialog, setShowEditProxyDialog] = useState(false)
  const [editProxyForm, setEditProxyForm] = useState({ id: "", provider: "", ip: "", port: "", username: "", password: "", location_city: "", location_state: "", location_country: "US", monthly_cost: "" })
  const router = useRouter()

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [proxyRes, accountRes, warmupRes] = await Promise.all([
        fetch("/api/proxy-groups").then(r => r.json()),
        fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_accounts" }) }).then(r => r.json()),
        fetch("/api/warmup").then(r => r.json()),
      ])
      setProxies(proxyRes.data || [])
      setAccounts(accountRes.data || [])
      setWarmupSeqs(warmupRes.data || [])
    } catch (e) { toast.error("Failed to load data") }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function createProxy() {
    const res = await fetch("/api/proxy-groups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...proxyForm, monthly_cost: parseFloat(proxyForm.monthly_cost) || 0 }),
    })
    if (res.ok) { toast.success("Proxy added"); setShowProxyForm(false); setProxyForm({ provider: "", ip: "", port: "", username: "", password: "", location_city: "", location_state: "", location_country: "US", monthly_cost: "" }); fetchAll() }
    else toast.error("Failed to add proxy")
  }

  async function deleteProxy(id: string) {
    if (!confirm("Delete this proxy?")) return
    await fetch("/api/proxy-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) })
    toast.success("Proxy deleted"); fetchAll()
  }

  async function renameGroup(id: string, name: string) {
    const res = await fetch("/api/proxy-groups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", id, name }),
    })
    if (res.ok) { toast.success("Group renamed"); setEditingGroupId(null); fetchAll() }
    else toast.error("Failed to rename group")
  }

  async function deleteGroup(id: string) {
    const groupAccounts = accounts.filter(a => a.proxy_group_id === id)
    const msg = groupAccounts.length > 0
      ? `This will unassign ${groupAccounts.length} account(s) from this group and delete the proxy. Continue?`
      : "Delete this proxy group?"
    if (!confirm(msg)) return
    const res = await fetch("/api/proxy-groups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    })
    if (res.ok) { toast.success("Group deleted"); fetchAll() }
    else toast.error("Failed to delete group")
  }

  async function updateProxyDetails() {
    const res = await fetch("/api/proxy-groups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id: editProxyForm.id,
        provider: editProxyForm.provider,
        ip: editProxyForm.ip,
        port: editProxyForm.port,
        username: editProxyForm.username,
        password: editProxyForm.password,
        location_city: editProxyForm.location_city,
        location_state: editProxyForm.location_state,
        location_country: editProxyForm.location_country,
        monthly_cost: parseFloat(editProxyForm.monthly_cost) || 0,
      }),
    })
    if (res.ok) { toast.success("Proxy updated"); setShowEditProxyDialog(false); fetchAll() }
    else toast.error("Failed to update proxy")
  }

  function openEditProxy(proxy: ProxyGroup) {
    setEditProxyForm({
      id: proxy.id,
      provider: proxy.provider || "",
      ip: proxy.ip || "",
      port: proxy.port || "",
      username: proxy.username || "",
      password: proxy.password || "",
      location_city: proxy.location_city || "",
      location_state: proxy.location_state || "",
      location_country: proxy.location_country || "US",
      monthly_cost: String(proxy.monthly_cost || ""),
    })
    setShowEditProxyDialog(true)
  }

  function canAssignProxy(proxyId: string, platform: string, excludeAccountId?: string) {
    const existing = accounts.find(a => a.proxy_group_id === proxyId && a.platform === platform && a.account_id !== excludeAccountId)
    return !existing
  }

  async function saveAccountName(accountId: string) {
    await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_account", account_id: accountId, display_name: editNameValue }) })
    toast.success("Name updated"); setEditingName(null); fetchAll()
  }

  async function createAccount() {
    if (accountForm.proxy_group_id && !canAssignProxy(accountForm.proxy_group_id, accountForm.platform)) {
      toast.error(`This proxy already has a ${accountForm.platform} account. Each proxy can only have one account per platform.`)
      return
    }
    const accountId = `${accountForm.platform}_${Date.now().toString(36)}`
    await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_account", account_id: accountId, ...accountForm, status: "pending_setup", sends_today: "0", business_id: "default" }) })
    toast.success("Account added — set it up via noVNC to activate"); setShowAccountForm(false); setAccountForm({ platform: "instagram", username: "", display_name: "", connection_type: "novnc", daily_limit: "40", proxy_group_id: "" }); fetchAll()
  }

  async function assignProxy(accountId: string, proxyGroupId: string) {
    if (proxyGroupId) {
      const account = accounts.find(a => a.account_id === accountId)
      if (account && !canAssignProxy(proxyGroupId, account.platform, accountId)) {
        toast.error(`This proxy already has a ${account.platform} account assigned. One per platform per proxy.`)
        return
      }
    }
    await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_account", account_id: accountId, proxy_group_id: proxyGroupId }) })
    toast.success("Proxy assigned"); fetchAll()
  }

  async function assignWarmup(accountId: string, warmupId: string) {
    await fetch("/api/warmup", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", account_id: accountId, warmup_sequence_id: warmupId }) })
    toast.success("Warmup assigned"); fetchAll()
  }

  async function createWarmup() {
    const res = await fetch("/api/warmup", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...warmupForm }) })
    if (res.ok) { toast.success("Warmup sequence created"); setShowWarmupForm(false); fetchAll() }
  }

  async function deleteWarmup(id: string) {
    if (!confirm("Delete this warmup sequence?")) return
    await fetch("/api/warmup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) })
    toast.success("Warmup deleted"); fetchAll()
  }

  const grouped = accounts.reduce<Record<string, Account[]>>((acc, a) => {
    const p = a.platform || "other"; if (!acc[p]) acc[p] = []; acc[p].push(a); return acc
  }, {})

  const totalMonthlyCost = proxies.reduce((s, p) => s + (p.monthly_cost || 0), 0)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-emerald-500/20 border-t-emerald-500" />
          <Shield className="h-5 w-5 text-emerald-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">Loading accounts & proxies...</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 pb-8"
    >
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center">
              <Shield className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Accounts & Proxies</h1>
              <p className="text-muted-foreground mt-1">
                {accounts.length} accounts · {proxies.length} proxies · ${Math.round(totalMonthlyCost)}/mo
              </p>
            </div>
          </div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button onClick={() => fetchAll()} variant="outline" size="sm" className="rounded-xl">
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </motion.div>
        </div>
      </motion.div>

      <Tabs defaultValue="groups">
        <div className="flex gap-1 p-1 rounded-xl bg-muted/30 backdrop-blur-sm w-fit">
          <TabsList className="bg-transparent p-0 h-auto">
            <TabsTrigger value="groups" className="gap-1.5 rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-all"><Layers className="h-4 w-4" /> Groups</TabsTrigger>
            <TabsTrigger value="accounts" className="gap-1.5 rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-all"><Shield className="h-4 w-4" /> Accounts</TabsTrigger>
            <TabsTrigger value="proxies" className="gap-1.5 rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-all"><Server className="h-4 w-4" /> Proxies</TabsTrigger>
            <TabsTrigger value="warmup" className="gap-1.5 rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-all"><Activity className="h-4 w-4" /> Warmup</TabsTrigger>
          </TabsList>
        </div>

        {/* ═══ GROUPS TAB (Group Status Dashboard) ═══ */}
        <TabsContent value="groups" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Each group = 1 proxy + 1 Chrome profile + accounts across platforms. Set up once, runs forever.</p>
            <Button
              onClick={() => router.push("/accounts/setup")}
              size="sm"
              className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 shadow-lg shadow-violet-500/20 rounded-xl"
            >
              <Plus className="h-4 w-4 mr-1" /> Set Up New Group
            </Button>
          </div>

          <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
            {proxies.map((proxy) => {
              const proxyAccounts = accounts.filter(a => a.proxy_group_id === proxy.id)
              const usedPlatforms = proxyAccounts.map(a => a.platform)
              const activeAccounts = proxyAccounts.filter(a => a.status === "active")
              const setupNeeded = proxyAccounts.filter(a => a.status !== "active")
              const groupStatus = proxyAccounts.length === 0 ? "empty" : setupNeeded.length > 0 ? "needs_setup" : "active"
              const health = proxy.status === "blocked" ? "red" : groupStatus === "active" ? "green" : groupStatus === "needs_setup" ? "yellow" : "gray"
              const availablePlatforms = SOCIAL_PLATFORMS.filter(p => !usedPlatforms.includes(p.id))

              return (
                <motion.div key={proxy.id} variants={item}>
                  <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg overflow-hidden">
                    <div className="p-4 bg-gradient-to-r from-violet-500/5 to-blue-500/5 border-b border-border/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center",
                            health === "green" ? "bg-green-500/20" : health === "yellow" ? "bg-amber-500/20" : "bg-muted/30"
                          )}>
                            <Server className={cn("h-5 w-5",
                              health === "green" ? "text-green-400" : health === "yellow" ? "text-amber-400" : "text-muted-foreground"
                            )} />
                          </div>
                          <div>
                            {editingGroupId === proxy.id ? (
                              <div className="flex items-center gap-1.5">
                                <Input
                                  value={editingGroupName}
                                  onChange={e => setEditingGroupName(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") renameGroup(proxy.id, editingGroupName); if (e.key === "Escape") setEditingGroupId(null) }}
                                  className="h-7 text-sm font-semibold w-48"
                                  autoFocus
                                />
                                <button onClick={() => renameGroup(proxy.id, editingGroupName)} className="text-emerald-400 hover:text-emerald-300"><Check className="h-4 w-4" /></button>
                                <button onClick={() => setEditingGroupId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <h3 className="font-semibold text-foreground">{proxy.name || proxy.location_city || proxy.ip}</h3>
                                <button
                                  onClick={() => { setEditingGroupId(proxy.id); setEditingGroupName(proxy.name || proxy.location_city || proxy.ip) }}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  title="Rename group"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground font-mono">{proxy.ip}:{proxy.port} · {proxy.provider || "Unknown"} · ${proxy.monthly_cost}/mo</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {groupStatus === "active" && (
                            <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30 gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Active
                            </Badge>
                          )}
                          {groupStatus === "needs_setup" && (
                            <Badge className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1">
                              <AlertTriangle className="h-3 w-3" /> Needs Setup
                            </Badge>
                          )}
                          {groupStatus === "empty" && (
                            <Badge className="text-xs bg-muted/30 text-muted-foreground border-border/50">No Accounts</Badge>
                          )}
                          <button
                            onClick={() => openEditProxy(proxy)}
                            className="text-muted-foreground hover:text-blue-400 transition-colors p-1 rounded-lg hover:bg-blue-500/10"
                            title="Edit proxy details"
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteGroup(proxy.id)}
                            className="text-muted-foreground hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10"
                            title="Delete group"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <PulseDot color={health === "green" ? "bg-green-500" : health === "yellow" ? "bg-amber-500" : "bg-zinc-500"} />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      {proxyAccounts.length > 0 ? (
                        <>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {proxyAccounts.map((a) => {
                              const Icon = platformIcons[a.platform] || Shield
                              const ws = warmupSeqs.find(w => w.id === a.warmup_sequence_id)
                              const warmupLimit = ws ? getWarmupLimit(ws, a.warmup_day || 0) : parseInt(a.daily_limit || "40")
                              const isActive = a.status === "active"
                              return (
                                <div key={a.account_id} className={cn("rounded-xl border border-border/40 p-3 space-y-2 bg-card/40", platformBorders[a.platform] || "border-l-muted", "border-l-4")}>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Icon className={cn("h-4 w-4", platformColors[a.platform])} />
                                      <span className="text-sm font-medium text-foreground">@{a.username || a.display_name || a.account_id}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <Badge className={cn("text-[10px]", statusColors[a.status] || "bg-muted/30")}>{a.status}</Badge>
                                      {isActive && (
                                        <button
                                          onClick={() => { setVncProxyGroupId(proxy.id); setVncProxyIp(proxy.ip); setVncProxyLocation(proxy.location_city || ""); setVncExistingAccount({ account_id: a.account_id, platform: a.platform, username: a.username || a.display_name || "" }); setVncFlowOpen(true) }}
                                          className="text-blue-400 hover:text-blue-300 transition-colors"
                                          title="Re-login / Swap account"
                                        >
                                          <RefreshCw className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {isActive && (
                                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                      <span className="font-mono">{a.sends_today || 0}/{warmupLimit}/day</span>
                                      {ws && <span className="text-orange-400">Day {a.warmup_day || 0}</span>}
                                    </div>
                                  )}
                                  {isActive && (
                                    <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                      <div className={cn("h-full rounded-full transition-all", parseInt(a.sends_today || "0") / warmupLimit > 0.8 ? "bg-orange-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, (parseInt(a.sends_today || "0") / warmupLimit) * 100)}%` }} />
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {/* Group actions */}
                          <div className="flex items-center gap-2 pt-2 border-t border-border/20">
                            {setupNeeded.length > 0 && (
                              <Button
                                size="sm"
                                onClick={() => router.push(`/accounts/setup?proxy=${proxy.id}`)}
                                className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-xl text-xs"
                              >
                                <ArrowRight className="h-3 w-3 mr-1" /> Complete Setup ({setupNeeded.length} remaining)
                              </Button>
                            )}
                            {availablePlatforms.length > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/accounts/setup?proxy=${proxy.id}&add=true`)}
                                className="rounded-xl text-xs"
                              >
                                <Plus className="h-3 w-3 mr-1" /> Add More Accounts ({availablePlatforms.length} platforms)
                              </Button>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-4">
                          <p className="text-sm text-muted-foreground mb-3">No accounts in this group yet</p>
                          <Button
                            size="sm"
                            onClick={() => router.push(`/accounts/setup?proxy=${proxy.id}`)}
                            className="bg-gradient-to-r from-violet-600 to-blue-600 rounded-xl"
                          >
                            <Plus className="h-4 w-4 mr-1" /> Set Up This Group
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })}

            {/* Unassigned accounts */}
            {accounts.filter(a => !a.proxy_group_id).length > 0 && (
              <motion.div variants={item}>
                <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-dashed border-amber-500/30 shadow-lg overflow-hidden">
                  <div className="p-4 bg-amber-500/5 border-b border-border/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                          <WifiOff className="h-5 w-5 text-amber-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">Unassigned Accounts</h3>
                          <p className="text-xs text-muted-foreground">{accounts.filter(a => !a.proxy_group_id).length} accounts ready to be added to a group</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => router.push("/accounts/setup")}
                        className="bg-gradient-to-r from-violet-600 to-blue-600 rounded-xl"
                      >
                        <Plus className="h-4 w-4 mr-1" /> Create Group
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {accounts.filter(a => !a.proxy_group_id).map(a => {
                      const Icon = platformIcons[a.platform] || Shield
                      return (
                        <div key={a.account_id} className={cn("rounded-xl border border-border/40 p-3 bg-card/40", platformBorders[a.platform] || "border-l-muted", "border-l-4")}>
                          <div className="flex items-center gap-2">
                            <Icon className={cn("h-4 w-4", platformColors[a.platform])} />
                            <span className="text-sm font-medium">@{a.username || a.display_name}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1 pl-6 capitalize">{a.platform}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {proxies.length === 0 && accounts.filter(a => !a.proxy_group_id).length === 0 && (
              <div className="rounded-2xl border border-dashed border-border/50 bg-card/30 backdrop-blur-xl py-16 text-center">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-violet-500/20 flex items-center justify-center mb-4">
                  <Layers className="h-8 w-8 text-violet-400/60" />
                </div>
                <h3 className="text-lg font-semibold mb-1 text-foreground">No groups set up yet</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  Pick a proxy, choose your platforms, and log into each one. Takes about 2 minutes.
                </p>
                <Button
                  onClick={() => router.push("/accounts/setup")}
                  size="lg"
                  className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 rounded-xl shadow-lg shadow-violet-500/20 h-14 px-8 text-base"
                >
                  <Plus className="h-5 w-5 mr-2" /> Add Your First Group
                </Button>
              </div>
            )}
          </motion.div>
        </TabsContent>

        {/* ═══ ACCOUNTS TAB ═══ */}
        <TabsContent value="accounts" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{accounts.length} accounts across {Object.keys(grouped).length} platforms</p>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button onClick={() => setShowAccountForm(true)} size="sm" className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-500/20 rounded-xl">
                <Plus className="h-4 w-4 mr-1" /> Add Account
              </Button>
            </motion.div>
          </div>

          {Object.entries(grouped).map(([platform, accts]) => {
            const Icon = platformIcons[platform] || Shield
            return (
              <motion.div key={platform} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-5 w-5", platformColors[platform] || "text-muted-foreground")} />
                  <h3 className="font-semibold capitalize text-lg text-foreground">{platform}</h3>
                  <Badge variant="outline" className="text-xs">{accts.length}</Badge>
                </div>
                <motion.div variants={container} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {accts.map((a) => {
                    const ws = warmupSeqs.find(w => w.id === a.warmup_sequence_id)
                    const warmupLimit = ws ? getWarmupLimit(ws, a.warmup_day || 0) : parseInt(a.daily_limit || "40")
                    const expanded = expandedAccount === a.account_id
                    const proxy = proxies.find(p => p.id === a.proxy_group_id)
                    const sendsPercent = Math.min(100, (parseInt(a.sends_today || "0") / warmupLimit) * 100)
                    const healthScore = a.health_score || Math.round(70 + Math.random() * 30)

                    return (
                      <motion.div
                        key={a.account_id}
                        variants={item}
                        whileHover={{ y: -2, scale: 1.01 }}
                      >
                        <div
                          className={cn(
                            "relative rounded-2xl border-l-4 border border-border/50 backdrop-blur-xl cursor-pointer",
                            "bg-card/60 shadow-lg",
                            "hover:shadow-xl hover:border-border transition-all duration-300",
                            platformBorders[platform] || "border-l-muted-foreground"
                          )}
                          onClick={() => setExpandedAccount(expanded ? null : a.account_id)}
                        >
                          {/* Subtle platform gradient overlay */}
                          <div className={cn("absolute inset-0 rounded-2xl bg-gradient-to-r opacity-30 pointer-events-none", platformGradients[platform])} />

                          <div className="relative p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-sm text-foreground">@{a.username || a.display_name || a.account_id}</span>
                                </div>
                                <Badge className={cn("text-[10px] border", statusColors[a.status] || "bg-muted/30 text-muted-foreground")}>
                                  {a.status === "active" && <PulseDot color="bg-green-400" />}
                                  <span className="ml-1">{a.status}</span>
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                {a.health_score > 0 && <HealthRing score={healthScore} size={32} />}
                                {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                              </div>
                            </div>

                            {/* Stats row */}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="font-mono">{a.sends_today || 0}/{warmupLimit} today</span>
                              {proxy && <span className="flex items-center gap-1"><Wifi className="h-3 w-3 text-green-400" />{proxy.location_city || proxy.ip}</span>}
                              {ws && (
                                <span className="flex items-center gap-1 text-orange-400">
                                  <Sparkles className="h-3 w-3" /> Day {a.warmup_day || 0}
                                </span>
                              )}
                            </div>

                            {/* Progress bar */}
                            <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${sendsPercent}%` }}
                                transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                                className={cn(
                                  "h-full rounded-full",
                                  sendsPercent > 80 ? "bg-gradient-to-r from-orange-500 to-red-500" :
                                  "bg-gradient-to-r from-emerald-500 to-teal-400"
                                )}
                              />
                            </div>

                            {/* Warmup progress (if assigned) */}
                            {ws && (
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">Warmup:</span>
                                <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, ((a.warmup_day || 0) / (ws.steps[ws.steps.length - 1]?.day_end === 999 ? 30 : ws.steps[ws.steps.length - 1]?.day_end || 30)) * 100)}%` }}
                                    transition={{ duration: 1.2, ease: "easeOut", delay: 0.5 }}
                                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400"
                                  />
                                </div>
                                <span className="text-orange-400 font-mono">{ws.name}</span>
                              </div>
                            )}

                            {expanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="pt-3 space-y-3 border-t border-border/30"
                                onClick={e => e.stopPropagation()}
                              >
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Connection</Label>
                                    <p className="text-sm font-medium text-foreground">{a.connection_type || "chrome_direct"}</p>
                                  </div>
                                  <div>
                                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Daily Limit</Label>
                                    <p className="text-sm font-bold text-emerald-400">{warmupLimit}</p>
                                  </div>
                                </div>

                                <div>
                                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Proxy</Label>
                                  <Select value={a.proxy_group_id || "none"} onValueChange={v => assignProxy(a.account_id, v === "none" ? "" : v)}>
                                    <SelectTrigger className="h-8 text-xs bg-muted/20 border-border/50"><SelectValue placeholder="No proxy" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">None</SelectItem>
                                      {proxies.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.ip} ({p.location_city})</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div>
                                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Warmup Sequence</Label>
                                  <Select value={a.warmup_sequence_id || "none"} onValueChange={v => assignWarmup(a.account_id, v === "none" ? "" : v)}>
                                    <SelectTrigger className="h-8 text-xs bg-muted/20 border-border/50"><SelectValue placeholder="None" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">None</SelectItem>
                                      {warmupSeqs.map(w => (
                                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {a.notes && <p className="text-xs text-muted-foreground italic">{a.notes}</p>}
                              </motion.div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </motion.div>
              </motion.div>
            )
          })}

          {accounts.length === 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="rounded-2xl border border-dashed border-border/50 bg-card/30 backdrop-blur-xl py-16 text-center">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center mb-4">
                  <Shield className="h-8 w-8 text-emerald-400/60" />
                </div>
                <h3 className="text-lg font-semibold mb-1 text-foreground">No accounts yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Add your first social media account to get started</p>
                <Button onClick={() => setShowAccountForm(true)} className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl">
                  <Plus className="h-4 w-4 mr-1" /> Add Account
                </Button>
              </div>
            </motion.div>
          )}

          <div className="mt-4 rounded-xl bg-card/40 border border-border/30 p-3 flex items-center gap-3">
            <Activity className="h-5 w-5 text-orange-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Need a sending warmup sequence?</p>
              <p className="text-xs text-muted-foreground">Gradually increase limits to build account trust and avoid bans</p>
            </div>
            <Link href="/accounts?tab=warmup">
              <Button variant="outline" size="sm" className="rounded-xl text-xs whitespace-nowrap">
                <Plus className="h-3 w-3 mr-1" /> Create Warmup
              </Button>
            </Link>
          </div>

          <Dialog open={showAccountForm} onOpenChange={setShowAccountForm}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Add Account</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Platform</Label>
                  <Select value={accountForm.platform} onValueChange={v => setAccountForm(f => ({ ...f, platform: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SOCIAL_PLATFORMS.map(p => {
                        const taken = accountForm.proxy_group_id ? !canAssignProxy(accountForm.proxy_group_id, p.id) : false
                        return (
                          <SelectItem key={p.id} value={p.id} disabled={taken}>
                            {p.label} {taken && "(already on this proxy)"}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Username</Label><Input placeholder="@username" value={accountForm.username} onChange={e => setAccountForm(f => ({ ...f, username: e.target.value }))} /></div>
                <div><Label>Display Name</Label><Input placeholder="John Doe" value={accountForm.display_name} onChange={e => setAccountForm(f => ({ ...f, display_name: e.target.value }))} /></div>
                {!accountForm.proxy_group_id && (
                  <div>
                    <Label>Assign to Proxy Group</Label>
                    <Select value={accountForm.proxy_group_id || "none"} onValueChange={v => setAccountForm(f => ({ ...f, proxy_group_id: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="Select a proxy group" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (assign later)</SelectItem>
                        {proxies.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.ip} — {p.location_city || "Unknown"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div><Label>Daily Limit</Label><Input type="number" value={accountForm.daily_limit} onChange={e => setAccountForm(f => ({ ...f, daily_limit: e.target.value }))} /></div>
                <Button onClick={createAccount} className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl">Add Account</Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ═══ PROXIES TAB ═══ */}
        <TabsContent value="proxies" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Residential proxies for account isolation</p>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button onClick={() => setShowProxyForm(true)} size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/20 rounded-xl">
                <Plus className="h-4 w-4 mr-1" /> Add Proxy
              </Button>
            </motion.div>
          </div>

          <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-dashed border-blue-500/30 p-4 shadow-lg">
            <p className="text-sm text-muted-foreground">💡 We use <a href="https://iproyal.com/?r=dylan" className="text-blue-400 underline hover:text-blue-300 transition-colors" target="_blank" rel="noreferrer">IPRoyal</a> for residential proxies — static IPs, good for social media. ~$7/mo per IP.</p>
          </div>

          <motion.div variants={container} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {proxies.map((p) => {
              const age = p.health_check_at ? Math.round((Date.now() - new Date(p.health_check_at).getTime()) / 3600000) : 999
              const health = p.status === "blocked" ? "red" : age < 24 ? "green" : age < 72 ? "yellow" : "red"
              const healthColor = health === "green" ? "bg-green-500" : health === "yellow" ? "bg-yellow-500" : "bg-red-500"
              return (
                <motion.div key={p.id} variants={item} whileHover={{ y: -3, scale: 1.01 }}>
                  <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg hover:shadow-xl hover:border-border transition-all duration-300 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <PulseDot color={healthColor} />
                        <span className="font-mono text-sm font-medium text-foreground">{p.ip}:{p.port}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">{p.status}</Badge>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-blue-400" />
                      <span className="font-medium text-foreground">{p.location_city}{p.location_state ? `, ${p.location_state}` : ""}</span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">{p.location_country}</Badge>
                    </div>

                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><Server className="h-3 w-3" />{p.provider || "Unknown"}</span>
                        <span className="font-semibold text-emerald-400">${p.monthly_cost}/mo</span>
                      </div>
                      {p.health_check_at && <p className="text-[10px]">Last checked: {age}h ago</p>}
                    </div>

                    <div className="flex gap-1.5 pt-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl" onClick={() => deleteProxy(p.id)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Remove
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
            {proxies.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full">
                <div className="rounded-2xl border border-dashed border-border/50 bg-card/30 backdrop-blur-xl py-16 text-center">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4">
                    <WifiOff className="h-8 w-8 text-blue-400/60" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1 text-foreground">No proxies yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Add residential proxies for account isolation</p>
                  <Button onClick={() => setShowProxyForm(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl">
                    <Plus className="h-4 w-4 mr-1" /> Add Proxy
                  </Button>
                </div>
              </motion.div>
            )}
          </motion.div>

          <Dialog open={showProxyForm} onOpenChange={setShowProxyForm}>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Proxy</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Provider</Label><Input placeholder="IPRoyal" value={proxyForm.provider} onChange={e => setProxyForm(f => ({ ...f, provider: e.target.value }))} /></div>
                  <div><Label>Monthly Cost ($)</Label><Input placeholder="7" value={proxyForm.monthly_cost} onChange={e => setProxyForm(f => ({ ...f, monthly_cost: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>IP Address</Label><Input placeholder="86.109.92.98" value={proxyForm.ip} onChange={e => setProxyForm(f => ({ ...f, ip: e.target.value }))} /></div>
                  <div><Label>Port</Label><Input placeholder="12324" value={proxyForm.port} onChange={e => setProxyForm(f => ({ ...f, port: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Username</Label><Input value={proxyForm.username} onChange={e => setProxyForm(f => ({ ...f, username: e.target.value }))} /></div>
                  <div><Label>Password</Label><Input type="password" value={proxyForm.password} onChange={e => setProxyForm(f => ({ ...f, password: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>City</Label><Input placeholder="Charlotte" value={proxyForm.location_city} onChange={e => setProxyForm(f => ({ ...f, location_city: e.target.value }))} /></div>
                  <div><Label>State</Label><Input placeholder="NC" value={proxyForm.location_state} onChange={e => setProxyForm(f => ({ ...f, location_state: e.target.value }))} /></div>
                  <div><Label>Country</Label><Input placeholder="US" value={proxyForm.location_country} onChange={e => setProxyForm(f => ({ ...f, location_country: e.target.value }))} /></div>
                </div>
                <Button onClick={createProxy} className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl">Add Proxy</Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ═══ WARMUP TAB ═══ */}
        <TabsContent value="warmup" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Gradually increase sending limits to build account trust</p>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button onClick={() => setShowWarmupForm(true)} size="sm" className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-lg shadow-orange-500/20 rounded-xl">
                <Plus className="h-4 w-4 mr-1" /> New Sequence
              </Button>
            </motion.div>
          </div>

          <motion.div variants={container} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {warmupSeqs.map((w) => (
              <motion.div key={w.id} variants={item} whileHover={{ y: -3, scale: 1.01 }}>
                <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg hover:shadow-xl hover:border-border transition-all duration-300">
                  <div className="p-4 pb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-foreground">{w.name}</h3>
                    <Button variant="ghost" size="sm" className="h-6 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl" onClick={() => deleteWarmup(w.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="px-4 pb-4 space-y-3">
                    {w.platform && <Badge variant="outline" className="text-xs capitalize">{w.platform}</Badge>}
                    <div className="space-y-2">
                      {(w.steps || []).map((step, si) => {
                        const width = Math.min(100, (step.daily_limit / 50) * 100)
                        return (
                          <div key={si} className="flex items-center gap-2 text-xs">
                            <span className="w-20 text-muted-foreground">Day {step.day_start}-{step.day_end === 999 ? "∞" : step.day_end}</span>
                            <div className="flex-1 h-2.5 bg-muted/30 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${width}%` }}
                                transition={{ duration: 0.8, delay: si * 0.15 }}
                                className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full"
                              />
                            </div>
                            <span className="w-12 text-right font-mono text-orange-400">{step.daily_limit}/d</span>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {accounts.filter(a => a.warmup_sequence_id === w.id).length} accounts using this
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}

            {warmupSeqs.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full">
                <div className="rounded-2xl border border-dashed border-border/50 bg-card/30 backdrop-blur-xl py-16 text-center">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-orange-500/20 flex items-center justify-center mb-4">
                    <Activity className="h-8 w-8 text-orange-400/60" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1 text-foreground">No warmup sequences</h3>
                  <p className="text-sm text-muted-foreground mb-4">Create sequences to gradually increase sending limits</p>
                  <Button onClick={() => setShowWarmupForm(true)} className="bg-gradient-to-r from-orange-600 to-amber-600 rounded-xl">
                    <Plus className="h-4 w-4 mr-1" /> Create Sequence
                  </Button>
                </div>
              </motion.div>
            )}
          </motion.div>

          <Dialog open={showWarmupForm} onOpenChange={setShowWarmupForm}>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create Warmup Sequence</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input placeholder="My Warmup" value={warmupForm.name} onChange={e => setWarmupForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div>
                  <Label>Platform (optional)</Label>
                  <Select value={warmupForm.platform || "all"} onValueChange={v => setWarmupForm(f => ({ ...f, platform: v === "all" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="All platforms" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Platforms</SelectItem>
                      {SOCIAL_PLATFORMS.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Steps</Label>
                  <div className="space-y-2">
                    {warmupForm.steps.map((step, i) => (
                      <div key={i} className="grid grid-cols-4 gap-2 items-end">
                        <div><Label className="text-[10px]">Day Start</Label><Input type="number" value={step.day_start} onChange={e => { const s = [...warmupForm.steps]; s[i] = { ...s[i], day_start: parseInt(e.target.value) || 1 }; setWarmupForm(f => ({ ...f, steps: s })) }} /></div>
                        <div><Label className="text-[10px]">Day End</Label><Input type="number" value={step.day_end} onChange={e => { const s = [...warmupForm.steps]; s[i] = { ...s[i], day_end: parseInt(e.target.value) || 999 }; setWarmupForm(f => ({ ...f, steps: s })) }} /></div>
                        <div><Label className="text-[10px]">Daily Limit</Label><Input type="number" value={step.daily_limit} onChange={e => { const s = [...warmupForm.steps]; s[i] = { ...s[i], daily_limit: parseInt(e.target.value) || 5 }; setWarmupForm(f => ({ ...f, steps: s })) }} /></div>
                        <Button variant="ghost" size="sm" className="h-8 text-red-400" onClick={() => { const s = warmupForm.steps.filter((_, j) => j !== i); setWarmupForm(f => ({ ...f, steps: s })) }}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setWarmupForm(f => ({ ...f, steps: [...f.steps, { day_start: (f.steps[f.steps.length - 1]?.day_end || 0) + 1, day_end: 999, daily_limit: 40 }] }))}>
                      <Plus className="h-3 w-3 mr-1" /> Add Step
                    </Button>
                  </div>
                </div>
                <Button onClick={createWarmup} className="w-full bg-gradient-to-r from-orange-600 to-amber-600 rounded-xl">Create Sequence</Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>

      {/* Edit Proxy Dialog */}
      <Dialog open={showEditProxyDialog} onOpenChange={setShowEditProxyDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Proxy Details</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Provider</Label><Input placeholder="IPRoyal" value={editProxyForm.provider} onChange={e => setEditProxyForm(f => ({ ...f, provider: e.target.value }))} /></div>
              <div><Label>Monthly Cost ($)</Label><Input placeholder="7" value={editProxyForm.monthly_cost} onChange={e => setEditProxyForm(f => ({ ...f, monthly_cost: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>IP Address</Label><Input placeholder="86.109.92.98" value={editProxyForm.ip} onChange={e => setEditProxyForm(f => ({ ...f, ip: e.target.value }))} /></div>
              <div><Label>Port</Label><Input placeholder="12324" value={editProxyForm.port} onChange={e => setEditProxyForm(f => ({ ...f, port: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Username</Label><Input value={editProxyForm.username} onChange={e => setEditProxyForm(f => ({ ...f, username: e.target.value }))} /></div>
              <div><Label>Password</Label><Input type="password" value={editProxyForm.password} onChange={e => setEditProxyForm(f => ({ ...f, password: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>City</Label><Input placeholder="Charlotte" value={editProxyForm.location_city} onChange={e => setEditProxyForm(f => ({ ...f, location_city: e.target.value }))} /></div>
              <div><Label>State</Label><Input placeholder="NC" value={editProxyForm.location_state} onChange={e => setEditProxyForm(f => ({ ...f, location_state: e.target.value }))} /></div>
              <div><Label>Country</Label><Input placeholder="US" value={editProxyForm.location_country} onChange={e => setEditProxyForm(f => ({ ...f, location_country: e.target.value }))} /></div>
            </div>
            <Button onClick={updateProxyDetails} className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      <VncLoginFlow
        open={vncFlowOpen}
        onClose={() => setVncFlowOpen(false)}
        onComplete={() => { setVncFlowOpen(false); fetchAll() }}
        proxyGroupId={vncProxyGroupId}
        proxyIp={vncProxyIp}
        proxyLocation={vncProxyLocation}
        existingAccount={vncExistingAccount}
      />
    </motion.div>
  )
}
