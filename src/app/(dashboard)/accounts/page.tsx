"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import {
  Shield, Plus, Wifi, WifiOff, Globe, Instagram, Facebook, Linkedin,
  Server, ChevronDown, ChevronUp, Settings, Zap, Calendar,
  Activity, RefreshCw, Trash2, Edit2, ExternalLink, MapPin, Sparkles,
  Monitor, Layers, Pencil, Check, X, Eye, Link2, CheckCircle2, AlertTriangle,
  ArrowRight, Info,
} from "lucide-react"
import { ALL_PLATFORMS, SOCIAL_PLATFORMS, getPlatform } from "@/lib/platforms"
import Link from "next/link"
import { useRouter } from "next/navigation"
import VncLoginFlow from "@/components/vnc-login-flow"
import AccountDetailDialog from "@/components/account-detail-dialog"
import BulkImportDialog from "@/components/bulk-import-dialog"

// ── Animation variants ──────────────────────────────────────────────

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }

// ── Types ───────────────────────────────────────────────────────────

interface ProxyGroup {
  id: string; provider: string; ip: string; port: string; username: string; password: string;
  location_city: string; location_state: string; location_country: string;
  status: string; monthly_cost: number; health_check_at: string; business_id: string;
  name: string;
  is_dummy?: boolean;
}

interface Account {
  account_id: string; platform: string; username: string; display_name: string;
  status: string; daily_limit: string; sends_today: string; connection_type: string;
  proxy_group_id: string; warmup_sequence_id: string; warmup_day: number;
  health_score: number; business_id: string; notes: string;
  // Derived fields from the server — a real login-state rollup so the UI
  // doesn't trust the stale "status" field alone. See get_accounts in supabase.ts.
  session_status?: string;
  session_age_hours?: number | null;
  has_auth_cookie?: boolean;
  has_saved_session?: boolean;
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
  needs_signin: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  expired: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  pending_setup: "bg-amber-500/20 text-amber-400 border-amber-500/30",
}

// Effective status used by the Groups tab. Falls back to the stale DB
// `status` column only when the server hasn't supplied a derived session_status.
function effectiveStatus(a: Account): string {
  if (a.session_status) return a.session_status
  return a.status || "pending_setup"
}

// Human label for a badge/button — "needs_signin" looks ugly, "Needs Sign-In" doesn't.
function statusLabel(s: string): string {
  switch (s) {
    case "active": return "Active"
    case "warming": return "Warming"
    case "paused": return "Paused"
    case "banned": return "Banned"
    case "flagged": return "Flagged"
    case "cooldown": return "Cooldown"
    case "needs_signin": return "Needs Sign-In"
    case "expired": return "Expired"
    case "pending_setup": return "Needs Sign-In"
    default: return s
  }
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

// Number input that allows temporary empty state while editing — no auto-jump on backspace.
// Falls back to `fallback` only on blur if left empty.
function NumberField({
  value, onChange, fallback, min, className, placeholder,
}: {
  value: number
  onChange: (n: number) => void
  fallback: number
  min?: number
  className?: string
  placeholder?: string
}) {
  const [local, setLocal] = useState<string>(String(value))
  const lastExternal = useRef<number>(value)
  useEffect(() => {
    if (value !== lastExternal.current) {
      lastExternal.current = value
      setLocal(String(value))
    }
  }, [value])
  return (
    <Input
      type="number"
      min={min}
      placeholder={placeholder}
      className={className}
      value={local}
      onChange={(e) => {
        const v = e.target.value
        setLocal(v)
        if (v === "" || v === "-") return
        const n = parseInt(v)
        if (!isNaN(n)) {
          lastExternal.current = n
          onChange(n)
        }
      }}
      onBlur={() => {
        if (local === "" || isNaN(parseInt(local))) {
          setLocal(String(fallback))
          lastExternal.current = fallback
          onChange(fallback)
        }
      }}
    />
  )
}

// Redesigned ramp preview — stepped area with gridlines, axis labels, stat pills.
function RampChart({
  steps, currentDay,
}: {
  steps: { day_start: number; day_end: number; daily_limit: number }[]
  currentDay?: number
}) {
  const finiteSteps = steps.filter(s => s.day_end !== 999)
  const totalDays = Math.max(1, finiteSteps.reduce((m, s) => Math.max(m, s.day_end), 0))
  const maxLimit = Math.max(1, ...steps.map(s => s.daily_limit))
  const finalLimit = steps[steps.length - 1]?.daily_limit || 0
  const totalSends = finiteSteps.reduce(
    (sum, s) => sum + Math.max(0, s.day_end - s.day_start + 1) * s.daily_limit, 0
  )

  const W = 400
  const H = 130
  const padL = 30
  const padR = 14
  const padT = 10
  const padB = 22
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const bottom = padT + plotH

  const xScale = (day: number) => padL + ((day - 1) / totalDays) * plotW
  const yScale = (limit: number) => padT + plotH - (limit / maxLimit) * plotH

  const areaPath: string[] = []
  const linePoints: string[] = []
  if (finiteSteps.length > 0) {
    const first = finiteSteps[0]
    areaPath.push(`M ${xScale(first.day_start)} ${bottom}`)
    areaPath.push(`L ${xScale(first.day_start)} ${yScale(first.daily_limit)}`)
    linePoints.push(`${xScale(first.day_start)},${yScale(first.daily_limit)}`)
    for (let i = 0; i < finiteSteps.length; i++) {
      const s = finiteSteps[i]
      areaPath.push(`L ${xScale(s.day_end + 1)} ${yScale(s.daily_limit)}`)
      linePoints.push(`${xScale(s.day_end + 1)},${yScale(s.daily_limit)}`)
      const next = finiteSteps[i + 1]
      if (next) {
        areaPath.push(`L ${xScale(next.day_start)} ${yScale(next.daily_limit)}`)
        linePoints.push(`${xScale(next.day_start)},${yScale(next.daily_limit)}`)
      }
    }
    const last = finiteSteps[finiteSteps.length - 1]
    areaPath.push(`L ${xScale(last.day_end + 1)} ${bottom}`)
    areaPath.push("Z")
  }

  const gridValues = [0.25, 0.5, 0.75]
  const currentLimit = currentDay !== undefined
    ? (steps.find(s => currentDay >= s.day_start && currentDay <= s.day_end)?.daily_limit ?? finalLimit)
    : undefined

  return (
    <div className="rounded-2xl bg-gradient-to-b from-orange-500/5 to-transparent border border-border/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Ramp Preview</Label>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/40 text-foreground/80 border border-border/40 font-medium">
            {totalDays}d
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/30 font-medium">
            Final {finalLimit}/d
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-medium">
            {totalSends.toLocaleString()} sends
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="rampFillV2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fb923c" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridValues.map((g, i) => {
          const y = padT + plotH - g * plotH
          return (
            <line key={i} x1={padL} y1={y} x2={W - padR} y2={y}
              stroke="currentColor" strokeWidth="0.5" className="text-border/40" strokeDasharray="2,3" />
          )
        })}
        <line x1={padL} y1={bottom} x2={W - padR} y2={bottom}
          stroke="currentColor" strokeWidth="0.5" className="text-border/60" />

        <text x={padL - 6} y={padT} textAnchor="end" fontSize="9" dominantBaseline="middle"
          className="fill-muted-foreground/70">{maxLimit}</text>
        <text x={padL - 6} y={padT + plotH / 2} textAnchor="end" fontSize="9" dominantBaseline="middle"
          className="fill-muted-foreground/40">{Math.round(maxLimit / 2)}</text>
        <text x={padL - 6} y={bottom} textAnchor="end" fontSize="9" dominantBaseline="middle"
          className="fill-muted-foreground/70">0</text>

        {areaPath.length > 0 && <path d={areaPath.join(" ")} fill="url(#rampFillV2)" />}
        {linePoints.length > 0 && (
          <polyline fill="none" stroke="#fb923c" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round"
            points={linePoints.join(" ")} />
        )}

        {finiteSteps.map((s, i) => {
          const x = (xScale(s.day_start) + xScale(s.day_end + 1)) / 2
          const y = yScale(s.daily_limit) - 4
          return (
            <text key={i} x={x} y={y} textAnchor="middle" fontSize="9"
              className="fill-orange-300" fontWeight="600">{s.daily_limit}</text>
          )
        })}

        {finiteSteps.map((s, i) => (
          <text key={i} x={xScale(s.day_start)} y={H - 6} textAnchor="middle" fontSize="8"
            className="fill-muted-foreground/70">d{s.day_start}</text>
        ))}
        {finiteSteps.length > 0 && (
          <text x={xScale(totalDays + 1)} y={H - 6} textAnchor="middle" fontSize="8"
            className="fill-muted-foreground/70">d{totalDays + 1}</text>
        )}

        {currentDay !== undefined && currentLimit !== undefined && currentDay >= 1 && currentDay <= totalDays && (
          <g>
            <line x1={xScale(currentDay)} y1={padT} x2={xScale(currentDay)} y2={bottom}
              stroke="#ef4444" strokeWidth="1" strokeDasharray="3,2" opacity="0.7" />
            <circle cx={xScale(currentDay)} cy={yScale(currentLimit)} r="3.5" fill="#ef4444" stroke="#0a0a0a" strokeWidth="1.5" />
            <text x={xScale(currentDay)} y={padT - 3} textAnchor="middle" fontSize="8" fontWeight="600"
              className="fill-red-400">Day {currentDay}</text>
          </g>
        )}
      </svg>
    </div>
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
  const [accountForm, setAccountForm] = useState({
    platform: "instagram",
    username: "",
    display_name: "",
    password: "",
    tfa_codes: "",
    email: "",
    email_username: "",
    email_password: "",
    connection_type: "novnc",
    daily_limit: "40",
    warmup_sequence_id: "",
    proxy_group_id: "",
  })
  const [limitMode, setLimitMode] = useState<"daily" | "warmup">("daily")
  const [activeTab, setActiveTab] = useState("groups")
  const [warmupForm, setWarmupForm] = useState({ name: "", platform: "", steps: [{ day_start: 1, day_end: 5, daily_limit: 5 }, { day_start: 6, day_end: 10, daily_limit: 10 }, { day_start: 11, day_end: 20, daily_limit: 20 }, { day_start: 21, day_end: 999, daily_limit: 40 }] })
  const [editingWarmupId, setEditingWarmupId] = useState<string | null>(null)
  const [warmupAccountsFor, setWarmupAccountsFor] = useState<WarmupSequence | null>(null)
  const [shiftDays, setShiftDays] = useState("0")
  const [scalePct, setScalePct] = useState("0")
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set())
  const [quickFill, setQuickFill] = useState({ days: 3, start: 5, inc: 1, max: 30 })
  const [showQuickFillHelp, setShowQuickFillHelp] = useState(false)
  function applyQuickFill(daysPerStep: number, start: number, increment: number, max: number) {
    const d = Math.max(1, daysPerStep)
    const s = Math.max(1, start)
    const inc = Math.max(1, increment)
    const m = Math.max(s, max)
    const stepCount = Math.max(1, Math.floor((m - s) / inc) + 1)
    const steps: { day_start: number; day_end: number; daily_limit: number }[] = []
    for (let i = 0; i < stepCount; i++) {
      const day_start = i * d + 1
      const day_end = (i + 1) * d
      const daily_limit = Math.min(m, s + inc * i)
      steps.push({ day_start, day_end, daily_limit })
    }
    steps.push({ day_start: stepCount * d + 1, day_end: 999, daily_limit: m })
    setWarmupForm(f => ({ ...f, steps }))
  }
  const [vncFlowOpen, setVncFlowOpen] = useState(false)
  const [vncProxyGroupId, setVncProxyGroupId] = useState("")
  const [vncProxyIp, setVncProxyIp] = useState("")
  const [vncProxyLocation, setVncProxyLocation] = useState("")
  const [vncExistingAccount, setVncExistingAccount] = useState<{ account_id: string; platform: string; username: string } | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState("")
  const [showEditProxyDialog, setShowEditProxyDialog] = useState(false)
  const [editProxyForm, setEditProxyForm] = useState({ id: "", provider: "", ip: "", port: "", username: "", password: "", location_city: "", location_state: "", location_country: "US", monthly_cost: "" })
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [testingProxyId, setTestingProxyId] = useState<string | null>(null)
  const [proxyTestResults, setProxyTestResults] = useState<Record<string, { ok: boolean; ip?: string; country?: string; city?: string; latency_ms?: number; error?: string }>>({})
  const router = useRouter()

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [proxyRes, accountRes, warmupRes] = await Promise.all([
        fetch("/api/proxy-groups").then(r => r.json()),
        fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_accounts", limit: 1000 }) }).then(r => r.json()),
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

  async function toggleDummy(id: string, nextVal: boolean) {
    // Optimistic update so the badge/switch flips instantly and only one group shows as dummy.
    setProxies(prev => prev.map(p => ({ ...p, is_dummy: p.id === id ? nextVal : (nextVal ? false : p.is_dummy) })))
    const res = await fetch("/api/proxy-groups", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_dummy: nextVal }),
    })
    if (res.ok) {
      toast.success(nextVal ? "Marked as dummy group" : "Removed dummy flag")
      fetchAll()
    } else {
      toast.error("Failed to update dummy flag")
      fetchAll()
    }
  }

  async function testProxy(id: string) {
    setTestingProxyId(id)
    setProxyTestResults(prev => { const next = { ...prev }; delete next[id]; return next })
    try {
      const res = await fetch("/api/proxy-groups/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const j = await res.json()
      if (j.ok) {
        const d = j.data || {}
        setProxyTestResults(prev => ({ ...prev, [id]: { ok: true, ip: d.ip, country: d.country, city: d.city, latency_ms: j.latency_ms } }))
        toast.success(`Proxy OK — ${d.ip || "unknown"} (${d.city || ""}${d.country ? ", " + d.country : ""})`)
      } else {
        setProxyTestResults(prev => ({ ...prev, [id]: { ok: false, error: j.error, latency_ms: j.latency_ms } }))
        toast.error(`Proxy failed: ${j.error}`)
      }
    } catch (e: any) {
      setProxyTestResults(prev => ({ ...prev, [id]: { ok: false, error: e.message } }))
      toast.error("Test failed")
    } finally {
      setTestingProxyId(null)
      fetchAll()
    }
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
    const platform = accountForm.platform
    if (!platform) {
      toast.error("Pick a platform")
      return
    }
    if (accountForm.proxy_group_id && !canAssignProxy(accountForm.proxy_group_id, platform)) {
      toast.error(`This proxy already has a ${platform} account. Each proxy can only hold one account per platform.`)
      return
    }
    const username = accountForm.username.replace(/^@/, "").toLowerCase()
    if (username) {
      const dup = accounts.find(a => a.platform === platform && (a.username || "").toLowerCase() === username)
      if (dup) {
        toast.error(`@${username} already exists on ${platform}`)
        return
      }
    }

    const accountId = `${platform}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`
    const payload = {
      action: "update_account",
      account_id: accountId,
      ...accountForm,
      daily_limit: limitMode === "daily" ? (accountForm.daily_limit || "40") : "",
      warmup_sequence_id: limitMode === "warmup" ? accountForm.warmup_sequence_id : "",
      warmup_day: limitMode === "warmup" && accountForm.warmup_sequence_id ? 1 : 0,
      status: "pending_setup",
      sends_today: "0",
      business_id: "default",
    }
    const res = await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json?.success === false) {
      toast.error(`Failed to add account — ${json?.error || "failed"}`)
      return
    }
    toast.success("Account added — set it up via noVNC to activate")
    setShowAccountForm(false)
    setAccountForm({
      platform: "instagram", username: "", display_name: "",
      password: "", tfa_codes: "", email: "", email_username: "", email_password: "",
      connection_type: "novnc", daily_limit: "40", warmup_sequence_id: "", proxy_group_id: "",
    })
    setLimitMode("daily")
    fetchAll()
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
    if (editingWarmupId) {
      const res = await fetch("/api/warmup", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: editingWarmupId, ...warmupForm }) })
      if (res.ok) { toast.success("Warmup sequence updated"); closeWarmupDialog(); fetchAll() }
      return
    }
    const res = await fetch("/api/warmup", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...warmupForm }) })
    if (res.ok) { toast.success("Warmup sequence created"); closeWarmupDialog(); fetchAll() }
  }

  function closeWarmupDialog() {
    setShowWarmupForm(false)
    setEditingWarmupId(null)
    setShiftDays("0")
    setScalePct("0")
  }

  function startEditWarmup(w: WarmupSequence) {
    setEditingWarmupId(w.id)
    setWarmupForm({ name: w.name || "", platform: w.platform || "", steps: (w.steps || []).map(s => ({ ...s })) })
    setShowWarmupForm(true)
  }

  async function duplicateWarmup(w: WarmupSequence) {
    await fetch("/api/warmup", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name: `${w.name || "Sequence"} (copy)`, platform: w.platform || "", steps: w.steps || [] }) })
    toast.success("Duplicated"); fetchAll()
  }

  function applyShift(days: number) {
    if (!days) return
    setWarmupForm(f => ({
      ...f,
      steps: f.steps.map(s => ({
        ...s,
        day_start: Math.max(1, s.day_start + days),
        day_end: s.day_end === 999 ? 999 : Math.max(s.day_start + days, s.day_end + days),
      })),
    }))
  }

  function applyScale(pct: number) {
    if (!pct) return
    const factor = 1 + pct / 100
    setWarmupForm(f => ({
      ...f,
      steps: f.steps.map(s => ({ ...s, daily_limit: Math.max(1, Math.round(s.daily_limit * factor)) })),
    }))
  }

  async function deleteWarmup(id: string) {
    if (!confirm("Delete this warmup sequence?")) return
    await fetch("/api/warmup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) })
    toast.success("Warmup deleted"); fetchAll()
  }

  async function bulkPauseAccounts(pause: boolean) {
    const ids = Array.from(selectedAccounts)
    if (ids.length === 0) return
    const newStatus = pause ? "paused" : "warming"
    await Promise.all(ids.map(id =>
      fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_account", account_id: id, status: newStatus }) })
    ))
    toast.success(`${ids.length} account${ids.length === 1 ? "" : "s"} ${pause ? "paused" : "resumed"}`)
    setSelectedAccounts(new Set())
    fetchAll()
  }

  function toggleSelectAccount(id: string) {
    setSelectedAccounts(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex gap-1 p-1 rounded-xl bg-muted/30 backdrop-blur-sm w-fit">
          <TabsList className="bg-transparent p-0 h-auto">
            <TabsTrigger value="groups" className="gap-1.5 rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-all"><Layers className="h-4 w-4" /> Overview</TabsTrigger>
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
              // Use the *derived* status the server computed from cookie freshness —
              // the raw accounts.status column gets sticky-"active" and lies.
              const activeAccounts = proxyAccounts.filter(a => effectiveStatus(a) === "active")
              const setupNeeded = proxyAccounts.filter(a => {
                const s = effectiveStatus(a)
                return s === "needs_signin" || s === "expired" || s === "pending_setup"
              })
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
                          {proxy.is_dummy && (
                            <Badge className="text-[10px] tracking-wide bg-violet-500/20 text-violet-300 border-violet-500/30">DUMMY</Badge>
                          )}
                          {groupStatus === "active" && (
                            <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30 gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Active
                            </Badge>
                          )}
                          {groupStatus === "needs_setup" && (
                            <Badge className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1">
                              <AlertTriangle className="h-3 w-3" /> {setupNeeded.length} Need{setupNeeded.length === 1 ? "s" : ""} Sign-In
                            </Badge>
                          )}
                          {groupStatus === "empty" && (
                            <Badge className="text-xs bg-muted/30 text-muted-foreground border-border/50">No Accounts</Badge>
                          )}
                          {proxyTestResults[proxy.id] && (
                            proxyTestResults[proxy.id].ok ? (
                              <Badge className="text-[10px] bg-emerald-500/20 text-emerald-300 border-emerald-500/30 gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {proxyTestResults[proxy.id].ip || "OK"}
                                {proxyTestResults[proxy.id].latency_ms ? ` · ${proxyTestResults[proxy.id].latency_ms}ms` : ""}
                              </Badge>
                            ) : (
                              <Badge className="text-[10px] bg-red-500/20 text-red-300 border-red-500/30 gap-1">
                                <AlertTriangle className="h-3 w-3" /> Failed
                              </Badge>
                            )
                          )}
                          <button
                            onClick={() => testProxy(proxy.id)}
                            disabled={testingProxyId === proxy.id}
                            className="text-muted-foreground hover:text-emerald-400 transition-colors p-1 rounded-lg hover:bg-emerald-500/10 disabled:opacity-50"
                            title="Test proxy — sends a live request and reports the returned IP/geo"
                          >
                            {testingProxyId === proxy.id
                              ? <RefreshCw className="h-4 w-4 animate-spin" />
                              : <Activity className="h-4 w-4" />}
                          </button>
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
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          checked={!!proxy.is_dummy}
                          onCheckedChange={(v) => toggleDummy(proxy.id, !!v)}
                          aria-label="Dummy group toggle"
                        />
                        <span>Dummy group (used only for automations)</span>
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
                              const effStatus = effectiveStatus(a)
                              const isActive = effStatus === "active" || effStatus === "warming"
                              const needsAttn = effStatus === "needs_signin" || effStatus === "expired" || effStatus === "pending_setup"
                              const ageHrs = a.session_age_hours
                              const freshness = ageHrs == null
                                ? null
                                : ageHrs < 1 ? "Just now"
                                : ageHrs < 24 ? `${ageHrs}h ago`
                                : `${Math.floor(ageHrs / 24)}d ago`

                              // One-click re-login: opens noVNC pointed at this account's saved
                              // Chrome profile directory + hydrates cookies from Supabase so Dylan
                              // either lands on the feed (cookies still valid) or sees the platform's
                              // own login page with Chrome's saved form prefilled.
                              const openVnc = (e?: React.MouseEvent) => {
                                if (e) e.stopPropagation()
                                setVncProxyGroupId(proxy.id)
                                setVncProxyIp(proxy.ip)
                                setVncProxyLocation(proxy.location_city || "")
                                setVncExistingAccount({
                                  account_id: a.account_id,
                                  platform: a.platform,
                                  username: a.username || a.display_name || "",
                                })
                                setVncFlowOpen(true)
                              }

                              return (
                                <div
                                  key={a.account_id}
                                  className={cn(
                                    "rounded-xl border p-3 space-y-2 cursor-pointer transition-all border-l-4",
                                    platformBorders[a.platform] || "border-l-muted",
                                    needsAttn
                                      ? "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/60 ring-1 ring-amber-500/20"
                                      : "border-border/40 bg-card/40 hover:bg-card/60 hover:border-border",
                                  )}
                                  onClick={() => needsAttn ? openVnc() : setDetailAccountId(a.account_id)}
                                  title={needsAttn ? "Click to sign in — opens your saved Chrome profile" : "Click for full details"}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <Icon className={cn("h-4 w-4 shrink-0", platformColors[a.platform])} />
                                      <span className="text-sm font-medium text-foreground truncate">@{a.username || a.display_name || a.account_id}</span>
                                      {a.has_auth_cookie && <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />}
                                      {(a as any).twofa_secret && <Shield className="h-3 w-3 text-violet-400 shrink-0" />}
                                      {(effStatus === "banned" || a.status === "flagged") && <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                      <Badge className={cn("text-[10px]", statusColors[effStatus] || "bg-muted/30")}>{statusLabel(effStatus)}</Badge>
                                      {isActive && (
                                        <button
                                          onClick={openVnc}
                                          className="text-blue-400 hover:text-blue-300 transition-colors"
                                          title="Re-login / Swap account"
                                        >
                                          <RefreshCw className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {needsAttn && (
                                    <Button
                                      size="sm"
                                      onClick={openVnc}
                                      className="w-full h-7 text-xs bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 rounded-lg"
                                    >
                                      <Monitor className="h-3 w-3 mr-1" /> Sign In Now
                                    </Button>
                                  )}
                                  {isActive && (
                                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                      <span className="font-mono">{a.sends_today || 0}/{warmupLimit}/day</span>
                                      {ws && <span className="text-orange-400">Day {a.warmup_day || 0}</span>}
                                      {freshness && <span className="ml-auto text-muted-foreground/70">Seen {freshness}</span>}
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
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">{accounts.length} accounts across {Object.keys(grouped).length} platforms · click the checkbox to multi-select, click the card for details</p>
            <div className="flex items-center gap-2">
              {selectedAccounts.size === 0 && accounts.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl text-xs"
                  onClick={() => setSelectedAccounts(new Set(accounts.map(a => a.account_id)))}
                >
                  <Check className="h-3 w-3 mr-1" /> Select All
                </Button>
              )}
              <Button onClick={() => setShowBulkImport(true)} size="sm" variant="outline" className="rounded-xl">
                <Layers className="h-4 w-4 mr-1" /> Bulk Import
              </Button>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button onClick={() => setShowAccountForm(true)} size="sm" className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-500/20 rounded-xl">
                  <Plus className="h-4 w-4 mr-1" /> Add Account
                </Button>
              </motion.div>
            </div>
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
                            "relative rounded-2xl border-l-4 border backdrop-blur-xl cursor-pointer",
                            "bg-card/60 shadow-lg",
                            "hover:shadow-xl hover:border-border transition-all duration-300",
                            platformBorders[platform] || "border-l-muted-foreground",
                            selectedAccounts.has(a.account_id) ? "border-emerald-500/60 ring-2 ring-emerald-500/30" : "border-border/50"
                          )}
                          onClick={() => setDetailAccountId(a.account_id)}
                        >
                          {/* Subtle platform gradient overlay */}
                          <div className={cn("absolute inset-0 rounded-2xl bg-gradient-to-r opacity-30 pointer-events-none", platformGradients[platform])} />

                          <div className="relative p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); toggleSelectAccount(a.account_id) }}
                                  className={cn(
                                    "h-4 w-4 rounded border flex items-center justify-center transition-all shrink-0",
                                    selectedAccounts.has(a.account_id)
                                      ? "bg-emerald-500 border-emerald-500 text-white"
                                      : "border-border/60 hover:border-emerald-500/60 bg-background"
                                  )}
                                  title={selectedAccounts.has(a.account_id) ? "Deselect" : "Select"}
                                >
                                  {selectedAccounts.has(a.account_id) && <Check className="h-3 w-3" />}
                                </button>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-sm text-foreground">@{a.username || a.display_name || a.account_id}</span>
                                  {(a as any).session_cookie && (
                                    <span title="Session saved"><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /></span>
                                  )}
                                  {(a as any).twofa_secret && (
                                    <span title="2FA configured"><Shield className="h-3.5 w-3.5 text-violet-400" /></span>
                                  )}
                                  {(a.status === "banned" || a.status === "flagged") && (
                                    <span title={a.status}><AlertTriangle className="h-3.5 w-3.5 text-red-400" /></span>
                                  )}
                                </div>
                                <Badge className={cn("text-[10px] border", statusColors[effectiveStatus(a)] || "bg-muted/30 text-muted-foreground")}>
                                  {effectiveStatus(a) === "active" && <PulseDot color="bg-green-400" />}
                                  <span className="ml-1">{statusLabel(effectiveStatus(a))}</span>
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                {a.health_score > 0 && <HealthRing score={healthScore} size={32} />}
                                <ExternalLink className="h-4 w-4 text-muted-foreground" />
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
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
                            {p.label}{taken ? " — already on this proxy" : ""}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Account Credentials <span className="text-muted-foreground/60 normal-case tracking-normal">(all optional)</span></p>
                  <div><Label className="text-xs">Username</Label><Input placeholder="@username" value={accountForm.username} onChange={e => setAccountForm(f => ({ ...f, username: e.target.value }))} /></div>
                  <div><Label className="text-xs">Display Name</Label><Input placeholder="John Doe" value={accountForm.display_name} onChange={e => setAccountForm(f => ({ ...f, display_name: e.target.value }))} /></div>
                  <div><Label className="text-xs">Password</Label><Input type="password" placeholder="••••••••" value={accountForm.password} onChange={e => setAccountForm(f => ({ ...f, password: e.target.value }))} /></div>
                  <div>
                    <Label className="text-xs">2FA Backup Codes</Label>
                    <textarea
                      className="w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
                      placeholder="Paste your backup codes, one per line"
                      value={accountForm.tfa_codes}
                      onChange={e => setAccountForm(f => ({ ...f, tfa_codes: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Recovery Email <span className="text-muted-foreground/60 normal-case tracking-normal">(optional)</span></p>
                  <div><Label className="text-xs">Email Address</Label><Input type="email" placeholder="recovery@example.com" value={accountForm.email} onChange={e => setAccountForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div><Label className="text-xs">Email Login Username</Label><Input placeholder="email username" value={accountForm.email_username} onChange={e => setAccountForm(f => ({ ...f, email_username: e.target.value }))} /></div>
                  <div><Label className="text-xs">Email Login Password</Label><Input type="password" placeholder="••••••••" value={accountForm.email_password} onChange={e => setAccountForm(f => ({ ...f, email_password: e.target.value }))} /></div>
                </div>

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

                <div className="space-y-2 rounded-xl border border-border/50 bg-muted/20 p-3">
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/50 w-fit">
                    <button
                      type="button"
                      onClick={() => setLimitMode("daily")}
                      className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", limitMode === "daily" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                    >Daily Limit</button>
                    <button
                      type="button"
                      onClick={() => setLimitMode("warmup")}
                      className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", limitMode === "warmup" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                    >Warmup Sequence</button>
                  </div>

                  {limitMode === "daily" ? (
                    <div>
                      <Label className="text-xs">Daily Send Limit</Label>
                      <Input
                        type="number"
                        placeholder="40"
                        value={accountForm.daily_limit}
                        onChange={e => setAccountForm(f => ({ ...f, daily_limit: e.target.value }))}
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Fixed daily send cap — use this for established accounts.</p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs">Warmup Sequence</Label>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAccountForm(false)
                            setActiveTab("warmup")
                            setTimeout(() => setShowWarmupForm(true), 250)
                          }}
                          className="flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
                        >
                          <Plus className="h-3 w-3" /> Make new sequence
                        </button>
                      </div>
                      <Select
                        value={accountForm.warmup_sequence_id || "none"}
                        onValueChange={v => setAccountForm(f => ({ ...f, warmup_sequence_id: v === "none" ? "" : v }))}
                      >
                        <SelectTrigger><SelectValue placeholder={warmupSeqs.length === 0 ? "No sequences yet — click + above" : "Select a sequence"} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {warmupSeqs
                            .filter(w => !w.platform || w.platform === accountForm.platform)
                            .map(w => (
                              <SelectItem key={w.id} value={w.id}>
                                {w.name}{w.platform ? ` — ${w.platform}` : ""}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground mt-1">Gradually ramps daily limit over time — use for new accounts.</p>
                    </div>
                  )}
                </div>

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
            {warmupSeqs.map((w) => {
              const usingCount = accounts.filter(a => a.warmup_sequence_id === w.id).length
              return (
              <motion.div key={w.id} variants={item} whileHover={{ y: -3, scale: 1.01 }}>
                <div
                  className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg hover:shadow-xl hover:border-border transition-all duration-300 cursor-pointer"
                  onClick={() => setWarmupAccountsFor(w)}
                >
                  <div className="p-4 pb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-foreground">{w.name}</h3>
                    <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 rounded-lg" onClick={() => startEditWarmup(w)} title="Edit">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg" onClick={() => duplicateWarmup(w)} title="Duplicate">
                        <Layers className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400/70 hover:text-red-300 hover:bg-red-500/10 rounded-lg" onClick={() => deleteWarmup(w.id)} title="Delete">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
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
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Shield className="h-3 w-3" /> {usingCount} {usingCount === 1 ? "account" : "accounts"} using this
                      <span className="ml-auto text-orange-400/70">Click to view</span>
                    </p>
                  </div>
                </div>
              </motion.div>
              )
            })}

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

          <Dialog open={showWarmupForm} onOpenChange={(o) => { if (!o) closeWarmupDialog(); else setShowWarmupForm(true) }}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingWarmupId ? "Edit Warmup Sequence" : "Create Warmup Sequence"}</DialogTitle></DialogHeader>
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

                <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">Quick Fill</Label>
                      <button
                        type="button"
                        onClick={() => setShowQuickFillHelp(v => !v)}
                        className={cn(
                          "h-4 w-4 rounded-full border flex items-center justify-center transition-colors",
                          showQuickFillHelp
                            ? "border-orange-500/60 bg-orange-500/20 text-orange-300"
                            : "border-muted-foreground/40 text-muted-foreground hover:border-orange-500/50 hover:text-orange-400"
                        )}
                        aria-label="How Quick Fill works"
                        title="How Quick Fill works"
                      >
                        <Info className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Auto-generates ramp — customize after</span>
                  </div>

                  {showQuickFillHelp && (
                    <div className="rounded-lg bg-orange-500/5 border border-orange-500/30 p-2.5 text-[11px] text-foreground/80 leading-relaxed space-y-1">
                      <p className="font-medium text-orange-300">How it works</p>
                      <p>Starts at <span className="font-semibold text-foreground">Start</span>, goes up by <span className="font-semibold text-foreground">Increase</span> each step, stops at <span className="font-semibold text-foreground">Max</span>. Each step lasts <span className="font-semibold text-foreground">Days per step</span> days.</p>
                      <p className="text-muted-foreground pt-0.5">
                        Example: Start 5 · Increase +1 · Max 30 · 3 days each →
                        <span className="font-mono text-orange-300"> 5 → 6 → 7 → ... → 30</span>
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                    <div>
                      <Label className="text-[10px]">Days per step</Label>
                      <NumberField value={quickFill.days} fallback={1} min={1}
                        onChange={(n) => setQuickFill(q => ({ ...q, days: n }))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Start limit</Label>
                      <NumberField value={quickFill.start} fallback={1} min={1}
                        onChange={(n) => setQuickFill(q => ({ ...q, start: n }))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Increase by</Label>
                      <NumberField value={quickFill.inc} fallback={1} min={1}
                        onChange={(n) => setQuickFill(q => ({ ...q, inc: n }))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Max limit</Label>
                      <NumberField value={quickFill.max} fallback={1} min={1}
                        onChange={(n) => setQuickFill(q => ({ ...q, max: n }))} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 2, 3, 5, 7].map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => applyQuickFill(d, quickFill.start, quickFill.inc, quickFill.max)}
                        className="text-[11px] px-2 py-1 rounded-md bg-background border border-border/50 text-muted-foreground hover:text-foreground hover:border-orange-500/50 transition-colors"
                      >{d}-day blocks</button>
                    ))}
                    <button
                      type="button"
                      onClick={() => applyQuickFill(quickFill.days, quickFill.start, quickFill.inc, quickFill.max)}
                      className="text-[11px] px-2 py-1 rounded-md bg-orange-500/20 text-orange-300 border border-orange-500/40 hover:bg-orange-500/30 transition-colors font-medium ml-auto"
                    >Apply</button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label>Steps <span className="text-[10px] text-muted-foreground font-normal">({warmupForm.steps.length})</span></Label>
                    {warmupForm.steps.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setWarmupForm(f => ({ ...f, steps: [] }))}
                        className="text-[11px] text-muted-foreground hover:text-red-400 transition-colors"
                      >Clear all</button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {warmupForm.steps.map((step, i) => {
                      const prev = i > 0 ? warmupForm.steps[i - 1] : null
                      const overlap = prev && step.day_start <= prev.day_end
                      const gap = prev && step.day_start > prev.day_end + 1
                      const invalid = step.day_end !== 999 && step.day_end < step.day_start
                      return (
                        <div key={i} className="space-y-1">
                          <div className="grid grid-cols-4 gap-2 items-end">
                            <div><Label className="text-[10px]">Day Start</Label><NumberField value={step.day_start} fallback={1} min={1} onChange={(n) => { const s = [...warmupForm.steps]; s[i] = { ...s[i], day_start: n }; setWarmupForm(f => ({ ...f, steps: s })) }} /></div>
                            <div><Label className="text-[10px]">Day End</Label><NumberField value={step.day_end} fallback={999} min={1} onChange={(n) => { const s = [...warmupForm.steps]; s[i] = { ...s[i], day_end: n }; setWarmupForm(f => ({ ...f, steps: s })) }} /></div>
                            <div><Label className="text-[10px]">Daily Limit</Label><NumberField value={step.daily_limit} fallback={5} min={1} onChange={(n) => { const s = [...warmupForm.steps]; s[i] = { ...s[i], daily_limit: n }; setWarmupForm(f => ({ ...f, steps: s })) }} /></div>
                            <Button variant="ghost" size="sm" className="h-8 text-red-400" onClick={() => { const s = warmupForm.steps.filter((_, j) => j !== i); setWarmupForm(f => ({ ...f, steps: s })) }}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                          {(overlap || gap || invalid) && (
                            <p className={cn("text-[10px] flex items-center gap-1", invalid || overlap ? "text-red-400" : "text-amber-400")}>
                              <AlertTriangle className="h-3 w-3" />
                              {invalid && `End day (${step.day_end}) is before start (${step.day_start})`}
                              {!invalid && overlap && `Overlaps previous step (ends day ${prev!.day_end})`}
                              {!invalid && gap && `Gap from day ${prev!.day_end + 1} to ${step.day_start - 1} — no limit defined`}
                            </p>
                          )}
                        </div>
                      )
                    })}
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setWarmupForm(f => ({ ...f, steps: [...f.steps, { day_start: (f.steps[f.steps.length - 1]?.day_end || 0) + 1, day_end: 999, daily_limit: 40 }] }))}>
                      <Plus className="h-3 w-3 mr-1" /> Add Step
                    </Button>
                  </div>
                </div>

                {warmupForm.steps.length > 0 && (
                  <>
                    <RampChart steps={warmupForm.steps} />

                    {/* Optional Shift & Scale tools */}
                    <div className="rounded-lg bg-muted/20 border border-border/30 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Optional Bulk Edits</Label>
                        <span className="text-[10px] text-muted-foreground">Click to apply</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-end gap-1">
                          <div className="flex-1">
                            <Label className="text-[10px]">Shift all by (days)</Label>
                            <Input type="number" value={shiftDays} onChange={e => setShiftDays(e.target.value)} className="h-8" />
                          </div>
                          <Button type="button" size="sm" variant="outline" className="h-8 text-xs rounded-lg" onClick={() => { applyShift(parseInt(shiftDays) || 0); setShiftDays("0") }}>Shift</Button>
                        </div>
                        <div className="flex items-end gap-1">
                          <div className="flex-1">
                            <Label className="text-[10px]">Scale limits by (%)</Label>
                            <Input type="number" value={scalePct} onChange={e => setScalePct(e.target.value)} className="h-8" />
                          </div>
                          <Button type="button" size="sm" variant="outline" className="h-8 text-xs rounded-lg" onClick={() => { applyScale(parseInt(scalePct) || 0); setScalePct("0") }}>Scale</Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <Button onClick={createWarmup} className="w-full bg-gradient-to-r from-orange-600 to-amber-600 rounded-xl">{editingWarmupId ? "Save Changes" : "Create Sequence"}</Button>
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

      <AccountDetailDialog
        open={Boolean(detailAccountId)}
        accountId={detailAccountId}
        onClose={() => setDetailAccountId(null)}
        onChanged={fetchAll}
        onLoginClick={(account) => {
          if (!account.proxy_group_id) {
            toast.error("Assign a proxy group to this account first — VNC login needs a proxy to route through.")
            return
          }
          const proxy = proxies.find(p => p.id === account.proxy_group_id)
          setVncProxyGroupId(account.proxy_group_id)
          setVncProxyIp(proxy?.ip || "")
          setVncProxyLocation(proxy?.location_city || "")
          setVncExistingAccount({
            account_id: account.account_id,
            platform: account.platform,
            username: account.username || account.display_name || "",
          })
          setDetailAccountId(null)
          setVncFlowOpen(true)
        }}
      />

      <BulkImportDialog
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onImported={fetchAll}
        proxies={proxies.map(p => ({ id: p.id, ip: p.ip, location_city: p.location_city || "" }))}
      />

      {/* Floating bulk-action bar */}
      <AnimatePresence>
        {selectedAccounts.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-card/95 backdrop-blur-xl border border-border shadow-2xl">
              <div className="flex items-center gap-2 pr-2 border-r border-border/50">
                <div className="h-6 w-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Check className="h-3 w-3 text-emerald-400" />
                </div>
                <span className="text-sm font-medium">
                  {selectedAccounts.size} selected
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl text-xs"
                onClick={() => bulkPauseAccounts(true)}
              >
                Pause Warmup
              </Button>
              <Button
                size="sm"
                className="rounded-xl text-xs bg-gradient-to-r from-emerald-600 to-teal-600"
                onClick={() => bulkPauseAccounts(false)}
              >
                Resume Warmup
              </Button>
              <button
                onClick={() => setSelectedAccounts(new Set())}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
                title="Clear selection"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={Boolean(warmupAccountsFor)} onOpenChange={(o) => { if (!o) setWarmupAccountsFor(null) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-orange-400" />
              {warmupAccountsFor?.name}
              {warmupAccountsFor?.platform && (
                <Badge variant="outline" className="text-[10px] capitalize ml-1">{warmupAccountsFor.platform}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {warmupAccountsFor && (() => {
            const using = accounts.filter(a => a.warmup_sequence_id === warmupAccountsFor.id)
            return (
              <div className="space-y-4">
                <RampChart steps={warmupAccountsFor.steps || []} />

                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {using.length === 0 ? "No accounts assigned yet" : `${using.length} account${using.length === 1 ? "" : "s"} assigned`}
                  </p>
                </div>

                {using.length > 0 && (
                  <div className="space-y-2">
                    {using.map(a => {
                      const Icon = platformIcons[a.platform] || Shield
                      const proxy = proxies.find(p => p.id === a.proxy_group_id)
                      const day = a.warmup_day || 0
                      const currentLimit = getWarmupLimit(warmupAccountsFor, day)
                      return (
                        <div key={a.account_id} className={cn("rounded-lg border border-border/40 p-2.5 bg-card/40 flex items-center gap-2", platformBorders[a.platform] || "border-l-muted", "border-l-4")}>
                          <Icon className={cn("h-4 w-4", platformColors[a.platform])} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">@{a.username || a.display_name || a.account_id}</p>
                            <p className="text-[10px] text-muted-foreground">
                              Day {day} · {currentLimit}/d · {proxy?.location_city || "no proxy"}
                            </p>
                          </div>
                          <Badge className={cn("text-[10px]", statusColors[effectiveStatus(a)] || "bg-muted/30")}>{statusLabel(effectiveStatus(a))}</Badge>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-border/30">
                  <Button size="sm" variant="outline" className="flex-1 rounded-lg" onClick={() => { const w = warmupAccountsFor; setWarmupAccountsFor(null); if (w) startEditWarmup(w) }}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit Sequence
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 rounded-lg" onClick={() => { const w = warmupAccountsFor; setWarmupAccountsFor(null); if (w) duplicateWarmup(w) }}>
                    <Layers className="h-3 w-3 mr-1" /> Duplicate
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
