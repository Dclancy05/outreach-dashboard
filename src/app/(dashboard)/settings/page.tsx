"use client"

import { useState, useEffect, useCallback } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Settings as SettingsIcon, Save, Check, Calendar, Upload, Shield, Users, Wifi, Instagram, Facebook, Linkedin, AlertCircle, ChevronDown, ChevronUp, Globe, ExternalLink, CheckCircle, Mail, BellRing, RefreshCw, KeyRound, ArrowRight } from "lucide-react"
import Link from "next/link"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { PageInstructions } from "@/components/page-instructions"
import type { Settings } from "@/types"

const DAYS = [
  { key: "1", short: "Mon" }, { key: "2", short: "Tue" }, { key: "3", short: "Wed" },
  { key: "4", short: "Thu" }, { key: "5", short: "Fri" }, { key: "6", short: "Sat" }, { key: "0", short: "Sun" },
]

// ─── Types ──────────────────────────────────────────────────────────

interface OutreachAccount {
  id: number
  username: string
  password: string
  email: string
  email_password: string
  platform: string
  identity_group: number | null
  two_factor_secret: string
  cookie: string
  external_id: string
  profile_url: string
  status: string
  daily_limit: string
  sends_today: string
  warmup_start_date: string | null
  warmup_day: number | null
  proxy_host: string
  proxy_port: string
  proxy_username: string
  proxy_password: string
  notes: string
  last_used_at: string | null
}

interface ProxyIdentity {
  id: number
  group_number: number
  proxy_host: string
  proxy_port: string
  proxy_username: string
  proxy_password: string
  status: string
  notes: string
  created_at: string
}

// ─── Platform helpers ───────────────────────────────────────────────

const platformIcon = (p: string) => {
  switch (p) {
    case "instagram": return <Instagram className="h-4 w-4 text-pink-400" />
    case "facebook": return <Facebook className="h-4 w-4 text-blue-400" />
    case "linkedin": return <Linkedin className="h-4 w-4 text-sky-400" />
    default: return <Users className="h-4 w-4" />
  }
}

const platformColor = (p: string) => {
  switch (p) {
    case "instagram": return "text-pink-400"
    case "facebook": return "text-blue-400"
    case "linkedin": return "text-sky-400"
    default: return "text-muted-foreground"
  }
}

const statusBadge = (s: string) => {
  switch (s) {
    case "active": return <Badge variant="success">Active</Badge>
    case "warming": return <Badge variant="warning">Warming</Badge>
    case "paused": return <Badge variant="secondary">Paused</Badge>
    case "banned": return <Badge variant="destructive">Banned</Badge>
    default: return <Badge variant="outline">{s}</Badge>
  }
}

// ─── General Settings Tab ───────────────────────────────────────────

function GeneralSettingsTab() {
  const { data, isLoading, mutate } = useSWR<Settings>("get_settings", () => dashboardApi("get_settings"))
  const [v, setV] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (data) setV(data as Record<string, string>) }, [data])

  function set(key: string, value: string) { setV((p) => ({ ...p, [key]: value })); setDirty(true); setSaved(false) }
  function toggleDay(day: string) {
    const days = (v.send_days || "1,2,3,4,5").split(",").filter(Boolean)
    set("send_days", days.includes(day) ? days.filter((d) => d !== day).join(",") : [...days, day].join(","))
  }

  async function handleSave() {
    setSaving(true)
    try { await dashboardApi("update_settings", { settings: v }); setDirty(false); setSaved(true); toast.success("Settings saved"); mutate() }
    catch (e) { console.error(e); toast.error("Failed to save settings") } finally { setSaving(false) }
  }

  const g = (k: string, d: string) => v[k] ?? d

  if (isLoading) return <div className="text-center text-muted-foreground py-12">Loading settings…</div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex justify-end">
        <Button variant={saved ? "outline" : "neon"} className="gap-2" onClick={handleSave} disabled={!dirty || saving}>
          {saved ? <><Check className="h-4 w-4" /> Saved</> : saving ? "Saving…" : <><Save className="h-4 w-4" /> Save</>}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" /> Send Days</CardTitle>
          <p className="text-xs text-muted-foreground">Which days to show leads in your queue</p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map(({ key, short }) => {
              const active = (g("send_days", "1,2,3,4,5")).split(",").includes(key)
              return (
                <button key={key} onClick={() => toggleDay(key)}
                  className={`w-14 h-14 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center ${
                    active ? "bg-primary text-primary-foreground border-primary" : "border-input text-muted-foreground hover:text-foreground"
                  }`}>{short}</button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Target</CardTitle>
          <p className="text-xs text-muted-foreground">How many leads to show in your daily queue</p>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-1.5">
            <Label className="text-xs">Leads per Day</Label>
            <Input type="number" min={1} max={100} value={g("daily_queue_size", "20")} onChange={(e) => set("daily_queue_size", e.target.value)} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Account Card (within Identity) ─────────────────────────────────

function AccountSlot({ account, platform }: { account?: OutreachAccount; platform: string }) {
  if (!account) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-muted-foreground/20">
        {platformIcon(platform)}
        <span className="text-xs text-muted-foreground">No {platform} account</span>
      </div>
    )
  }

  const warmupProgress = account.warmup_day ? Math.min((account.warmup_day / 14) * 100, 100) : 0

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-muted-foreground/10 bg-muted/30">
      {platformIcon(platform)}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{account.username}</span>
          {statusBadge(account.status)}
        </div>
        {account.status === "warming" && (
          <div className="mt-1">
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-yellow-500 rounded-full transition-all" style={{ width: `${warmupProgress}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground">Day {account.warmup_day || 0}/14</span>
          </div>
        )}
      </div>
      <span className="text-xs text-muted-foreground">{account.sends_today}/{account.daily_limit}</span>
    </div>
  )
}

// ─── Identity Card ──────────────────────────────────────────────────

function IdentityCard({ group, proxy, accounts }: { group: number; proxy?: ProxyIdentity; accounts: OutreachAccount[] }) {
  const [expanded, setExpanded] = useState(false)
  const ig = accounts.find(a => a.platform === "instagram")
  const fb = accounts.find(a => a.platform === "facebook")
  const li = accounts.find(a => a.platform === "linkedin")

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Identity #{group}</CardTitle>
            {proxy && <Badge variant={proxy.status === "active" ? "success" : "secondary"}>{proxy.status}</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{accounts.length}/3 accounts</span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
        {proxy && (
          <div className="flex items-center gap-1 mt-1">
            <Wifi className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-mono">session-{group}</span>
          </div>
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2 pt-0">
          <AccountSlot account={ig} platform="instagram" />
          <AccountSlot account={fb} platform="facebook" />
          <AccountSlot account={li} platform="linkedin" />
        </CardContent>
      )}
    </Card>
  )
}

// ─── Bulk Import Modal ──────────────────────────────────────────────

function BulkImportModal({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [platform, setPlatform] = useState("instagram")
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<Record<string, string>[]>([])

  const parseAccounts = useCallback((raw: string, plat: string): Record<string, string>[] => {
    const lines = raw.trim().split("\n").filter(l => l.trim())
    return lines.map(line => {
      const parts = line.split(":")
      const acct: Record<string, string> = { platform: plat }
      if (plat === "facebook") {
        acct.username = parts[0] || ""; acct.password = parts[1] || ""; acct.two_factor_secret = parts[2] || ""; acct.email = parts[3] || ""; acct.email_password = parts[4] || ""
      } else if (plat === "instagram") {
        acct.email = parts[0] || ""; acct.password = parts[1] || ""; acct.two_factor_secret = parts[2] || ""; acct.username = parts[3] || ""; acct.external_id = parts[4] || ""
      } else {
        acct.email = parts[0] || ""; acct.password = parts[1] || ""; acct.two_factor_secret = parts[2] || ""; acct.username = (parts[0] || "").split("@")[0]; acct.profile_url = parts[3] || ""
      }
      return acct
    })
  }, [])

  useEffect(() => {
    if (text.trim()) {
      try { setPreview(parseAccounts(text, platform)) }
      catch { setPreview([]) }
    } else { setPreview([]) }
  }, [text, platform, parseAccounts])

  async function handleImport() {
    setImporting(true)
    try {
      const accounts = parseAccounts(text, platform)
      await dashboardApi("bulk_import_accounts", { accounts })
      toast.success(`${accounts.length} account(s) imported`)
      setOpen(false)
      setText("")
      onImported()
    } catch (e) { console.error(e); toast.error("Import failed") }
    finally { setImporting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2"><Upload className="h-4 w-4" /> Bulk Import</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Accounts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Platform</Label>
            <div className="flex gap-2 mt-1">
              {["instagram", "facebook", "linkedin"].map(p => (
                <button key={p} onClick={() => setPlatform(p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-all ${
                    platform === p ? "border-primary bg-primary/10" : "border-input hover:border-primary/50"
                  }`}>
                  {platformIcon(p)} {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Paste account data (one per line)</Label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
              className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground"
              placeholder={platform === "facebook" ? "username:password:2FA:email:email_pass:cookie:uuid" :
                platform === "instagram" ? "email:password:2FA_key:username:numeric_id" :
                "email:password:2FA_key:profile_url"} />
          </div>
          {preview.length > 0 && (
            <div>
              <Label className="text-xs">Preview ({preview.length} accounts)</Label>
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-input p-2 space-y-1">
                {preview.slice(0, 5).map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {platformIcon(platform)}
                    <span className="font-mono">{a.username || a.email}</span>
                    <span className="text-muted-foreground">{a.email}</span>
                  </div>
                ))}
                {preview.length > 5 && <div className="text-xs text-muted-foreground">...and {preview.length - 5} more</div>}
              </div>
            </div>
          )}
          <Button onClick={handleImport} disabled={!preview.length || importing} className="w-full gap-2">
            {importing ? "Importing..." : <><Upload className="h-4 w-4" /> Import {preview.length} Accounts</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Accounts & Proxies Tab ─────────────────────────────────────────

function AccountsProxiesTab() {
  const { data: accounts, mutate: mutateAccounts } = useSWR<OutreachAccount[]>("get_outreach_accounts", () => dashboardApi("get_outreach_accounts"))
  const { data: proxies } = useSWR<ProxyIdentity[]>("get_proxy_identities", () => dashboardApi("get_proxy_identities"))

  const assigned = (accounts || []).filter(a => a.identity_group != null)
  const unassigned = (accounts || []).filter(a => a.identity_group == null)
  const groups = [...new Set(assigned.map(a => a.identity_group!))].sort((a, b) => a - b)

  const totalAccounts = (accounts || []).length
  const totalProxies = (proxies || []).length
  const totalAssigned = assigned.length

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-primary" />
          <span className="font-semibold">{totalAccounts}</span>
          <span className="text-muted-foreground">accounts</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Wifi className="h-4 w-4 text-primary" />
          <span className="font-semibold">{totalProxies}</span>
          <span className="text-muted-foreground">proxies</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Shield className="h-4 w-4 text-primary" />
          <span className="font-semibold">{totalAssigned}</span>
          <span className="text-muted-foreground">assigned</span>
        </div>
        <div className="ml-auto">
          <BulkImportModal onImported={() => mutateAccounts()} />
        </div>
      </div>

      {/* Platform breakdown */}
      <div className="flex gap-3">
        {["instagram", "facebook", "linkedin"].map(p => {
          const count = (accounts || []).filter(a => a.platform === p).length
          return (
            <div key={p} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 text-sm">
              {platformIcon(p)}
              <span className="font-medium">{count}</span>
              <span className={`capitalize ${platformColor(p)}`}>{p}</span>
            </div>
          )
        })}
      </div>

      {/* Identity Cards Grid */}
      {groups.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4" /> Identity Groups
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {groups.map(g => {
              const groupAccounts = assigned.filter(a => a.identity_group === g)
              const proxy = (proxies || []).find(p => p.group_number === g)
              return <IdentityCard key={g} group={g} proxy={proxy} accounts={groupAccounts} />
            })}
          </div>
        </div>
      )}

      {/* Unassigned Accounts */}
      {unassigned.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground" /> Unassigned Accounts ({unassigned.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {unassigned.map(a => (
              <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg border border-muted-foreground/10 bg-muted/20">
                {platformIcon(a.platform)}
                <span className="text-sm truncate flex-1">{a.username}</span>
                {statusBadge(a.status)}
              </div>
            ))}
          </div>
        </div>
      )}

      {totalAccounts === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No accounts yet. Use Bulk Import to add accounts.</p>
        </div>
      )}
    </div>
  )
}

// ─── GoLogin Tab ────────────────────────────────────────────────────

function GoLoginTab() {
  const [apiToken, setApiToken] = useState("")
  const [status, setStatus] = useState<"idle" | "checking" | "connected" | "error">("idle")
  const [profileCount, setProfileCount] = useState(0)

  useEffect(() => {
    const saved = localStorage.getItem("gologin_api_token")
    if (saved) {
      setApiToken(saved)
      checkConnection(saved)
    }
  }, [])

  async function checkConnection(token: string) {
    if (!token.trim()) { setStatus("idle"); return }
    setStatus("checking")
    try {
      const res = await fetch("https://api.gologin.com/browser/v2", {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      })
      if (res.ok) {
        const data = await res.json()
        const profiles = data?.profiles || data || []
        setProfileCount(Array.isArray(profiles) ? profiles.length : 0)
        setStatus("connected")
      } else {
        setStatus("error")
      }
    } catch {
      setStatus("error")
    }
  }

  function handleSave() {
    localStorage.setItem("gologin_api_token", apiToken)
    checkConnection(apiToken)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" /> GoLogin Integration
          </CardTitle>
          <p className="text-xs text-muted-foreground">Connect GoLogin to manage browser profiles for your outreach accounts</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            {status === "connected" ? (
              <Badge variant="success" className="gap-1"><CheckCircle className="h-3 w-3" /> Connected ({profileCount} profiles)</Badge>
            ) : status === "error" ? (
              <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Invalid token</Badge>
            ) : status === "checking" ? (
              <Badge variant="secondary">Checking...</Badge>
            ) : (
              <Badge variant="outline">Not connected</Badge>
            )}
          </div>

          {/* API Token Input */}
          <div className="space-y-1.5">
            <Label className="text-xs">GoLogin API Token</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Paste your GoLogin API token..."
                className="flex-1"
              />
              <Button onClick={handleSave} variant="neon" className="gap-1.5">
                <Save className="h-4 w-4" /> Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Find your API token in GoLogin → Settings → API.{" "}
              <a href="https://app.gologin.com/personalArea/SignUp" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-0.5">
                Don&apos;t have an account? Sign up <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Each outreach account is mapped to a GoLogin browser profile</p>
          <p>• Profiles maintain separate cookies, fingerprints, and proxies per account</p>
          <p>• Power DM uses these profiles to open the right browser for each account</p>
          <p>• Map profiles in the <a href="/account-setup" className="text-blue-400 hover:underline">Account Setup</a> page</p>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Microsoft Email Tab ────────────────────────────────────────

function MicrosoftEmailTab() {
  const [clientId, setClientId] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const v = localStorage.getItem("microsoft_client_id") || ""
    setClientId(v)
  }, [])

  function handleSave() {
    localStorage.setItem("microsoft_client_id", clientId)
    setSaved(true)
    toast.success("Client ID saved locally")
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Microsoft Email OAuth
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Connect Microsoft/Outlook email accounts for inbox checking via OAuth2
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Microsoft Client ID</Label>
            <div className="flex gap-2">
              <Input
                value={clientId}
                onChange={(e) => { setClientId(e.target.value); setSaved(false) }}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="flex-1 font-mono text-sm"
              />
              <Button onClick={handleSave} variant="neon" className="gap-1.5">
                {saved ? <><Check className="h-4 w-4" /> Saved</> : <><Save className="h-4 w-4" /> Save</>}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Set <code className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">MICROSOFT_CLIENT_ID</code> in your Vercel environment variables for production use.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setup Guide</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>To set up Microsoft OAuth2 email checking:</p>
          <ol className="list-decimal list-inside space-y-1.5 ml-1">
            <li>Go to <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-0.5">Azure App Registrations <ExternalLink className="h-3 w-3" /></a></li>
            <li>Click &quot;New registration&quot; → name it &quot;Outreach Email&quot;</li>
            <li>Under &quot;Supported account types&quot; select &quot;Accounts in any organizational directory and personal Microsoft accounts&quot;</li>
            <li>Add a <strong>Web</strong> Redirect URI: <code className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">https://outreach-dashboard-five.vercel.app/api/email/oauth/callback</code></li>
            <li>Under &quot;Authentication&quot; → enable &quot;Allow public client flows&quot; → Yes</li>
            <li>Under &quot;API Permissions&quot; → Add: <code className="font-mono text-[10px]">IMAP.AccessAsUser.All</code>, <code className="font-mono text-[10px]">offline_access</code>, <code className="font-mono text-[10px]">openid</code>, <code className="font-mono text-[10px]">email</code></li>
            <li>Copy the Application (client) ID and paste it above, or set it as <code className="font-mono text-[10px]">MICROSOFT_CLIENT_ID</code> env var in Vercel</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Alerts & Monitoring Tab ────────────────────────────────────────

function AlertsMonitoringTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deadman, setDeadman] = useState({
    enabled: false,
    silence_hours: 6,
    alert_method: "in_app" as "in_app" | "telegram",
    telegram_chat_id: "",
    last_fired_at: null as string | null,
  })
  const [cooldown, setCooldown] = useState({
    enabled: true,
    error_threshold: 3,
    error_window_minutes: 10,
    cooldown_hours: 24,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/settings/system", { cache: "no-store" })
      const j = await res.json()
      if (j.byKey?.deadman_switch) setDeadman(prev => ({ ...prev, ...j.byKey.deadman_switch }))
      if (j.byKey?.auto_cooldown) setCooldown(prev => ({ ...prev, ...j.byKey.auto_cooldown }))
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveKey(key: string, value: any) {
    setSaving(true)
    try {
      const res = await fetch("/api/settings/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaved(true)
      toast.success("Saved")
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      toast.error("Save failed: " + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function testDeadman() {
    try {
      const res = await fetch("/api/cron/deadman-check", { cache: "no-store" })
      const j = await res.json()
      if (j.fired) toast.success("Alert fired! Check notifications.")
      else if (j.skipped) toast.info(`Skipped: ${j.reason}`)
      else toast.success(`OK — ${j.recent_sends} recent sends`)
    } catch (e: any) {
      toast.error("Test failed: " + e.message)
    }
  }

  if (loading) return <div className="text-center text-muted-foreground py-12">Loading…</div>

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Dead Man's Switch */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4 text-amber-400" />
            Dead Man&apos;s Switch
            {deadman.enabled && <Badge variant="success" className="ml-2">Active</Badge>}
            {!deadman.enabled && <Badge variant="outline" className="ml-2">Not configured</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            If no sends happen within the silence window, you&apos;ll get an alert. Catches silent failures before they cost you a day.
          </p>

          <div className="flex items-center justify-between">
            <Label htmlFor="deadman-enabled" className="text-sm font-medium">Enable dead man&apos;s switch</Label>
            <Switch
              id="deadman-enabled"
              checked={deadman.enabled}
              onCheckedChange={(v) => setDeadman(d => ({ ...d, enabled: v }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="silence-hours" className="text-sm">Silence window (hours)</Label>
              <Input
                id="silence-hours"
                type="number"
                min={1}
                max={72}
                value={deadman.silence_hours}
                onChange={(e) => setDeadman(d => ({ ...d, silence_hours: parseInt(e.target.value) || 6 }))}
                className="mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Alert fires if zero sends in this window</p>
            </div>
            <div>
              <Label htmlFor="alert-method" className="text-sm">Alert method</Label>
              <Select
                value={deadman.alert_method}
                onValueChange={(v) => setDeadman(d => ({ ...d, alert_method: v as any }))}
              >
                <SelectTrigger id="alert-method" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_app">In-app notification</SelectItem>
                  <SelectItem value="telegram">Telegram</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {deadman.alert_method === "telegram" && (
            <div>
              <Label htmlFor="telegram-chat-id" className="text-sm">Telegram chat ID</Label>
              <Input
                id="telegram-chat-id"
                type="text"
                value={deadman.telegram_chat_id}
                onChange={(e) => setDeadman(d => ({ ...d, telegram_chat_id: e.target.value }))}
                placeholder="e.g. 123456789"
                className="mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                TELEGRAM_BOT_TOKEN must be set in Vercel env. Chat with @userinfobot to get your ID.
              </p>
            </div>
          )}

          {deadman.last_fired_at && (
            <div className="text-xs text-muted-foreground border-l-2 border-amber-500/40 pl-2">
              Last fired: {new Date(deadman.last_fired_at).toLocaleString()}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={() => saveKey("deadman_switch", deadman)} disabled={saving} size="sm">
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saved ? <Check className="h-3.5 w-3.5 ml-1" /> : null}
              Save
            </Button>
            <Button onClick={testDeadman} variant="outline" size="sm">
              Test now
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Auto Cooldown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-blue-400" />
            Auto-Cooldown
            {cooldown.enabled && <Badge variant="success" className="ml-2">Enabled</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            When an account errors repeatedly, auto-pause it to avoid flags. Resumes after cooldown period.
          </p>

          <div className="flex items-center justify-between">
            <Label htmlFor="cooldown-enabled" className="text-sm font-medium">Enable auto-cooldown</Label>
            <Switch
              id="cooldown-enabled"
              checked={cooldown.enabled}
              onCheckedChange={(v) => setCooldown(c => ({ ...c, enabled: v }))}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-sm">Error threshold</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={cooldown.error_threshold}
                onChange={(e) => setCooldown(c => ({ ...c, error_threshold: parseInt(e.target.value) || 3 }))}
                className="mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Errors before cooldown</p>
            </div>
            <div>
              <Label className="text-sm">Window (min)</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={cooldown.error_window_minutes}
                onChange={(e) => setCooldown(c => ({ ...c, error_window_minutes: parseInt(e.target.value) || 10 }))}
                className="mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Rolling window</p>
            </div>
            <div>
              <Label className="text-sm">Cooldown (hours)</Label>
              <Input
                type="number"
                min={1}
                max={168}
                value={cooldown.cooldown_hours}
                onChange={(e) => setCooldown(c => ({ ...c, cooldown_hours: parseInt(e.target.value) || 24 }))}
                className="mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Pause duration</p>
            </div>
          </div>

          <Button onClick={() => saveKey("auto_cooldown", cooldown)} disabled={saving} size="sm">
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Main Settings Page ─────────────────────────────────────────────

export default function SettingsPage() {
  const search = useSearchParams()
  const tabParam = search?.get("tab")
  const initialTab =
    tabParam === "alerts" ||
    tabParam === "integrations" ||
    tabParam === "accounts" ||
    tabParam === "gologin" ||
    tabParam === "email"
      ? tabParam
      : "general"
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-muted-foreground" /> Settings
          <PageInstructions title="Settings" storageKey="instructions-settings" steps={[
            "Configure your outreach timing, batch sizes, and business hours.",
            "Manage your accounts and proxy identities in the Accounts & Proxies tab.",
            "Use Bulk Import to add accounts from text files.",
            "Identity groups link one account per platform to a shared proxy.",
          ]} />
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Outreach preferences &amp; account management</p>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="general" className="gap-1.5"><SettingsIcon className="h-3.5 w-3.5" /> General</TabsTrigger>
          <TabsTrigger value="accounts" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Accounts &amp; Proxies</TabsTrigger>
          <TabsTrigger value="gologin" className="gap-1.5"><Globe className="h-3.5 w-3.5" /> GoLogin</TabsTrigger>
          <TabsTrigger value="email" className="gap-1.5"><Mail className="h-3.5 w-3.5" /> Microsoft Email</TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5"><BellRing className="h-3.5 w-3.5" /> Alerts &amp; Monitoring</TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Integrations &amp; API Keys</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralSettingsTab />
        </TabsContent>
        <TabsContent value="accounts">
          <AccountsProxiesTab />
        </TabsContent>
        <TabsContent value="gologin">
          <GoLoginTab />
        </TabsContent>
        <TabsContent value="email">
          <MicrosoftEmailTab />
        </TabsContent>
        <TabsContent value="alerts">
          <AlertsMonitoringTab />
        </TabsContent>
        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-amber-400" />
                Integrations &amp; API Keys moved
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                API keys live on the Memory page now — one place for everything
                your AI needs access to. Add, edit, test, or set an expiration
                date there.
              </p>
              <Button asChild className="gap-1.5">
                <Link href="/agency/memory#api-keys">
                  Open API Keys <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
