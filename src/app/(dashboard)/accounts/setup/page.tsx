"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import {
  Monitor, Loader2, CheckCircle2, XCircle, ArrowRight, ArrowLeft,
  Globe, Shield, Chrome, Cookie, Save, ChevronRight, Sparkles,
  Server, Wifi, Plus, Layers, Instagram, Facebook, Linkedin, Zap, MapPin,
} from "lucide-react"
import { SOCIAL_PLATFORMS, getPlatform } from "@/lib/platforms"
import { PLATFORM_LOGIN_URLS } from "@/lib/platform-login-urls"

const VNC_WS_HOST = process.env.NEXT_PUBLIC_VNC_WS_HOST || "srv1197943.taild42583.ts.net"
const VNC_API_BASE = `https://${VNC_WS_HOST}`

const platformIcons: Record<string, typeof Instagram> = {
  instagram: Instagram, facebook: Facebook, linkedin: Linkedin,
  tiktok: Zap, twitter: Globe, youtube: Monitor, pinterest: MapPin,
  snapchat: Zap, reddit: Globe, threads: Layers,
}

// URLs come from the shared dict in @/lib/platform-login-urls so we never
// have two copies drifting apart. Steps + success indicators stay inline
// because they're wizard-specific copy, not URL config.
const PLATFORM_LOGIN_GUIDES: Record<string, { url: string; steps: string[]; successIndicator: string }> = {
  instagram: {
    url: PLATFORM_LOGIN_URLS.instagram,
    steps: ["Enter your username or email", "Enter your password", "Complete 2FA if prompted", "Click 'Log In'", "Dismiss any popups ('Not Now')", "Wait for the home feed to load"],
    successIndicator: "You should see your Instagram feed",
  },
  facebook: {
    url: PLATFORM_LOGIN_URLS.facebook,
    steps: ["Enter your email or phone", "Enter your password", "Complete 2FA if prompted", "Click 'Log In'", "Dismiss any popups"],
    successIndicator: "You should see your News Feed",
  },
  linkedin: {
    url: PLATFORM_LOGIN_URLS.linkedin,
    steps: ["Enter your email", "Enter your password", "Complete security verification if shown", "Click 'Sign in'"],
    successIndicator: "You should see your LinkedIn feed",
  },
  tiktok: {
    url: PLATFORM_LOGIN_URLS.tiktok,
    steps: ["Choose login method (email/phone/social)", "Enter your credentials", "Complete CAPTCHA if shown", "Wait for the For You page"],
    successIndicator: "You should see the For You feed",
  },
  youtube: {
    url: PLATFORM_LOGIN_URLS.youtube,
    steps: ["Enter your Google email", "Click Next", "Enter your password", "Complete 2FA if required", "Wait for YouTube to load"],
    successIndicator: "You should see YouTube homepage",
  },
  twitter: {
    url: PLATFORM_LOGIN_URLS.twitter,
    steps: ["Enter your username, email, or phone", "Click Next", "Enter your password", "Complete verification if prompted"],
    successIndicator: "You should see your timeline",
  },
  snapchat: {
    url: PLATFORM_LOGIN_URLS.snapchat,
    steps: ["Enter your username or email", "Enter your password", "Complete verification if prompted"],
    successIndicator: "You should see the Snapchat web interface",
  },
  pinterest: {
    url: PLATFORM_LOGIN_URLS.pinterest,
    steps: ["Enter your email", "Enter your password", "Click 'Log in'"],
    successIndicator: "You should see your Pinterest home feed",
  },
  reddit: {
    url: PLATFORM_LOGIN_URLS.reddit,
    steps: ["Enter your username", "Enter your password", "Click 'Log In'"],
    successIndicator: "You should see your Reddit feed",
  },
  threads: {
    url: PLATFORM_LOGIN_URLS.threads,
    steps: ["Log in with your Instagram account", "Enter credentials", "Wait for Threads feed"],
    successIndicator: "You should see the Threads feed",
  },
}

const MAIN_PLATFORMS = ["instagram", "facebook", "linkedin"]

interface ProxyGroup {
  id: string; provider: string; ip: string; port: string; username: string; password: string;
  location_city: string; location_state: string; monthly_cost: number; status: string;
  name?: string;
}

interface AccountRow {
  account_id: string; platform: string; username: string; display_name: string;
  status: string; proxy_group_id: string; session_cookie?: unknown;
}

interface WarmupSeq {
  id: string; name: string; platform: string;
}

type WizardStep = "proxy" | "platforms" | "setup" | "done"

export default function SetupWizardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const existingProxyId = searchParams.get("proxy")

  const [wizardStep, setWizardStep] = useState<WizardStep>("proxy")
  const [proxies, setProxies] = useState<ProxyGroup[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)

  // Step 1: Proxy
  const [selectedProxy, setSelectedProxy] = useState(existingProxyId || "")
  const [showNewProxy, setShowNewProxy] = useState(false)
  const [newProxy, setNewProxy] = useState({ provider: "", ip: "", port: "", username: "", password: "", location_city: "", location_state: "", location_country: "US", monthly_cost: "" })

  // Step 2: Platforms + per-platform account pick
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [accountByPlatform, setAccountByPlatform] = useState<Record<string, string>>({})
  const [useChromeProfile, setUseChromeProfile] = useState(true)
  const [warmupSeqs, setWarmupSeqs] = useState<WarmupSeq[]>([])
  const [selectedWarmupId, setSelectedWarmupId] = useState<string>("")

  // Step 3: VNC login
  const [vncSessionId, setVncSessionId] = useState("")
  const [vncUrl, setVncUrl] = useState("")
  const [vncLoaded, setVncLoaded] = useState(false)
  const [currentLoginIndex, setCurrentLoginIndex] = useState(0)
  const [loginUsernames, setLoginUsernames] = useState<Record<string, string>>({})
  const [completedLogins, setCompletedLogins] = useState<Set<string>>(new Set())
  const [chromeProfileDone, setChromeProfileDone] = useState(false)
  const [captureError, setCaptureError] = useState("")
  const [capturing, setCapturing] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const currentPlatform = selectedPlatforms[currentLoginIndex] || ""
  const allLoginsComplete = completedLogins.size === selectedPlatforms.length && selectedPlatforms.length > 0

  // Route all VNC Manager calls through the dashboard's server-side proxy so
  // the API key stays on the server. /api/vnc/... mirrors the manager one-
  // for-one (session create, capture, navigate, delete). Middleware gates
  // these behind the admin/va session cookie.
  const vncFetch = useCallback(async (path: string, options?: RequestInit) => {
    const proxied = path
      .replace(/^\/api\/sessions$/, "/api/vnc/session")
      .replace(/^\/api\/sessions\//, "/api/vnc/session/")
    const res = await fetch(proxied, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "VNC Manager unreachable" }))
      throw new Error(err.error || `Request failed (${res.status})`)
    }
    return res.json()
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [proxyRes, accountRes, warmupRes] = await Promise.all([
          fetch("/api/proxy-groups").then(r => r.json()),
          fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_accounts", limit: 1000 }) }).then(r => r.json()),
          fetch("/api/warmup").then(r => r.json()).catch(() => ({ data: [] })),
        ])
        setProxies(proxyRes.data || [])
        setAccounts(accountRes.data || [])
        setWarmupSeqs(warmupRes.data || [])

        // P3.A — restore wizard-resume-state if we just bounced over to
        // /accounts to make a new warmup sequence and came back. Pulls the
        // saved selections out of sessionStorage (set by the "Make new
        // sequence" shortcut below) and rehydrates so the user lands back
        // exactly where they were.
        try {
          const raw = typeof window !== "undefined" ? window.sessionStorage.getItem("wizard-resume-state") : null
          if (raw) {
            const saved = JSON.parse(raw) as {
              selectedProxy?: string; selectedPlatforms?: string[];
              accountByPlatform?: Record<string, string>; useChromeProfile?: boolean;
              selectedWarmupId?: string; wizardStep?: WizardStep;
            }
            if (saved.selectedProxy) setSelectedProxy(saved.selectedProxy)
            if (Array.isArray(saved.selectedPlatforms)) setSelectedPlatforms(saved.selectedPlatforms)
            if (saved.accountByPlatform) setAccountByPlatform(saved.accountByPlatform)
            if (typeof saved.useChromeProfile === "boolean") setUseChromeProfile(saved.useChromeProfile)
            if (saved.selectedWarmupId) setSelectedWarmupId(saved.selectedWarmupId)
            if (saved.wizardStep) setWizardStep(saved.wizardStep)
            window.sessionStorage.removeItem("wizard-resume-state")
            return
          }
        } catch {
          // Non-fatal — just continue with fresh state if the saved blob is bad.
        }

        if (existingProxyId) {
          setSelectedProxy(existingProxyId)
          setWizardStep("platforms")
        }
      } catch {
        toast.error("Failed to load data")
      }
      setLoading(false)
    }
    load()
  }, [existingProxyId])

  function accountsForPicker(platformId: string): AccountRow[] {
    return accounts.filter(a =>
      a.platform === platformId
      && a.status !== "active"
      && (!a.proxy_group_id || a.proxy_group_id === selectedProxy)
    )
  }

  function togglePlatform(platformId: string) {
    setSelectedPlatforms(prev => {
      const next = prev.includes(platformId) ? prev.filter(p => p !== platformId) : [...prev, platformId]
      if (!next.includes(platformId)) {
        setAccountByPlatform(cur => {
          const { [platformId]: _drop, ...rest } = cur
          return rest
        })
      }
      return next
    })
  }

  async function createProxy() {
    if (!newProxy.ip || !newProxy.port) {
      toast.error("Enter at least an IP and port")
      return
    }
    try {
      const res = await fetch("/api/proxy-groups", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...newProxy, monthly_cost: parseFloat(newProxy.monthly_cost) || 0 }),
      })
      const data = await res.json()
      if (res.ok && data.data) {
        toast.success("Proxy added")
        setSelectedProxy(data.data.id)
        setProxies(prev => [data.data, ...prev])
        setShowNewProxy(false)
        setNewProxy({ provider: "", ip: "", port: "", username: "", password: "", location_city: "", location_state: "", location_country: "US", monthly_cost: "" })
      } else {
        toast.error(data.error || "Failed to add proxy")
      }
    } catch { toast.error("Failed to add proxy") }
  }

  async function startSetup() {
    if (!selectedProxy || selectedPlatforms.length === 0) {
      toast.error("Select a proxy and at least one platform")
      return
    }
    const missing = selectedPlatforms.filter(p => !accountByPlatform[p])
    if (missing.length) {
      toast.error(`Pick which account to log in for: ${missing.join(", ")}`)
      return
    }
    // Prefill the "username you logged in with" field from the picked account
    const prefill: Record<string, string> = {}
    for (const p of selectedPlatforms) {
      const acc = accounts.find(a => a.account_id === accountByPlatform[p])
      if (acc) prefill[p] = acc.username || acc.display_name || ""
    }
    setLoginUsernames(prev => ({ ...prefill, ...prev }))

    setWizardStep("setup")
    setCaptureError("")

    try {
      const proxy = proxies.find(p => p.id === selectedProxy)
      let proxyConfig: string | undefined
      if (proxy?.username && proxy?.password) {
        proxyConfig = `http://${proxy.username}:${proxy.password}@${proxy.ip}:${proxy.port}`
      } else if (proxy) {
        proxyConfig = `http://${proxy.ip}:${proxy.port}`
      }

      const firstPlatform = selectedPlatforms[0]
      // Pass account_id so the VNC Manager can hydrate THIS account's cookies
      // from Supabase first (preferred-account ordering in the cookie merge).
      // Without this the resume flow falls back to proxy-group-wide hydration,
      // which still works — but passing the ID wins when the same proxy hosts
      // multiple accounts on the same platform.
      const firstAccountId = accountByPlatform[firstPlatform]
      const data = await vncFetch("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          proxy_group_id: selectedProxy,
          platform: firstPlatform,
          proxy_config: proxyConfig,
          use_chrome_profile: useChromeProfile,
          account_id: firstAccountId || undefined,
        }),
      })

      setVncSessionId(data.data.id)
      const pwd = data.data.vncPassword ? `&password=${encodeURIComponent(data.data.vncPassword)}` : ""
      setVncUrl(`${VNC_API_BASE}/novnc/vnc_lite.html?path=websockify/${data.data.id}&autoconnect=true&resize=scale${pwd}`)
      setCurrentLoginIndex(0)
    } catch (e: any) {
      toast.error(`Failed to start browser: ${e.message}`)
      setCaptureError(e.message)
    }
  }

  async function navigateToUrl(url: string) {
    if (!vncSessionId) return
    try {
      await vncFetch(`/api/sessions/${vncSessionId}/navigate`, {
        method: "POST",
        body: JSON.stringify({ url }),
      })
    } catch {
      toast.error("Could not navigate. Please navigate manually in the browser.")
    }
  }

  async function confirmLogin() {
    const platform = currentPlatform
    const username = loginUsernames[platform]
    if (!username?.trim()) {
      toast.error("Enter the username you logged in with")
      return
    }
    const pickedAccountId = accountByPlatform[platform]
    if (!pickedAccountId) {
      toast.error("No account selected for this platform")
      return
    }

    setCapturing(true)
    try {
      await vncFetch(`/api/sessions/${vncSessionId}/capture`, {
        method: "POST",
        body: JSON.stringify({
          account_id: pickedAccountId,
          platform,
          username: username.replace(/^@/, ""),
          display_name: username.replace(/^@/, ""),
        }),
      })

      await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_account",
          account_id: pickedAccountId,
          platform,
          username: username.replace(/^@/, ""),
          display_name: username.replace(/^@/, ""),
          proxy_group_id: selectedProxy,
          status: "active",
          connection_type: "chrome_direct",
          business_id: "default",
          // If the user picked a warmup sequence in step 2, attach it now
          // so day-1 ramping starts immediately — same shape the Add Account
          // dialog uses on the main accounts page.
          ...(selectedWarmupId
            ? { warmup_sequence_id: selectedWarmupId, warmup_day: 1 }
            : {}),
        }),
      })

      setCompletedLogins(prev => new Set([...prev, platform]))
      toast.success(`${getPlatform(platform)?.label} login saved!`)

      if (currentLoginIndex < selectedPlatforms.length - 1) {
        const nextIndex = currentLoginIndex + 1
        setCurrentLoginIndex(nextIndex)
        const nextPlatform = selectedPlatforms[nextIndex]
        const guide = PLATFORM_LOGIN_GUIDES[nextPlatform]
        if (guide) {
          setTimeout(() => navigateToUrl(guide.url), 800)
        }
      }
    } catch (e: any) {
      toast.error(`Capture failed: ${e.message}`)
      setCaptureError(e.message)
    } finally {
      setCapturing(false)
    }
  }

  async function finishSetup() {
    setFinishing(true)
    try {
      // Mark the proxy group "active" now that at least one platform has
      // signed in successfully. Best-effort — if the PATCH fails the wizard
      // still completes; the groups list will catch up on next page load.
      if (selectedProxy) {
        try {
          await fetch("/api/proxy-groups", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: selectedProxy, status: "active" }),
          })
        } catch (err) {
          console.warn("[setup] proxy-groups PATCH active failed (non-fatal)", err)
        }
      }
      await vncFetch(`/api/sessions/${vncSessionId}`, { method: "DELETE" }).catch(() => {})
      setWizardStep("done")
      toast.success("All accounts set up and ready!")
    } finally {
      setFinishing(false)
    }
  }

  function handleCancel() {
    if (vncSessionId) {
      vncFetch(`/api/sessions/${vncSessionId}`, { method: "DELETE" }).catch(() => {})
    }
    router.push("/accounts")
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-violet-500/20 border-t-violet-500" />
          <Layers className="h-5 w-5 text-violet-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
      </div>
    )
  }

  const stepLabels = ["Pick Proxy", "Pick Platforms", "Log In", "Done"]
  const stepMap: WizardStep[] = ["proxy", "platforms", "setup", "done"]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={handleCancel} className="rounded-xl">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="h-10 w-10 rounded-xl bg-violet-500/20 border border-violet-500/20 flex items-center justify-center">
          <Layers className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Set Up Account Group</h1>
          <p className="text-sm text-muted-foreground">
            {wizardStep === "proxy" && "Choose the proxy for this group"}
            {wizardStep === "platforms" && "Pick which platforms you want to set up"}
            {wizardStep === "setup" && "Log into each platform in the browser"}
            {wizardStep === "done" && "All accounts are set up and ready"}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-8">
        {stepLabels.map((label, i) => {
          const currentIdx = stepMap.indexOf(wizardStep)
          const isActive = i === currentIdx
          const isComplete = i < currentIdx
          return (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                isComplete ? "bg-emerald-500 text-white" :
                isActive ? "bg-violet-500 text-white" :
                "bg-muted/30 text-muted-foreground"
              )}>
                {isComplete ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn("text-sm font-medium hidden sm:inline", isActive ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              {i < stepLabels.length - 1 && <div className={cn("flex-1 h-0.5 rounded-full", isComplete ? "bg-emerald-500" : "bg-muted/30")} />}
            </div>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* ═══ STEP 1: PICK PROXY ═══ */}
        {wizardStep === "proxy" && (
          <motion.div key="proxy" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6 max-w-2xl mx-auto">
            <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Server className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="font-bold text-lg">Choose Your Proxy</h2>
                  <p className="text-xs text-muted-foreground">Each group uses one proxy. All accounts in this group will use it.</p>
                </div>
              </div>

              {proxies.length > 0 && !showNewProxy && (
                <div className="space-y-2">
                  {proxies.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProxy(p.id)}
                      className={cn(
                        "w-full rounded-xl border p-4 text-left transition-all flex items-center gap-4",
                        selectedProxy === p.id
                          ? "border-violet-500 bg-violet-500/10 shadow-md"
                          : "border-border/40 bg-card/40 hover:border-violet-500/30 hover:bg-violet-500/5"
                      )}
                    >
                      <div className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                        selectedProxy === p.id ? "bg-violet-500/20" : "bg-muted/30"
                      )}>
                        <Wifi className={cn("h-5 w-5", selectedProxy === p.id ? "text-violet-400" : "text-muted-foreground")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">{p.ip}:{p.port}</span>
                          <Badge variant="outline" className="text-[10px]">{p.provider || "Proxy"}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.location_city}{p.location_state ? `, ${p.location_state}` : ""} · ${p.monthly_cost}/mo
                        </p>
                      </div>
                      {selectedProxy === p.id && <CheckCircle2 className="h-5 w-5 text-violet-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {!showNewProxy ? (
                <Button variant="outline" onClick={() => setShowNewProxy(true)} className="rounded-xl w-full">
                  <Plus className="h-4 w-4 mr-2" /> Add New Proxy
                </Button>
              ) : (
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Plus className="h-4 w-4 text-blue-400" /> New Proxy
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Provider</Label><Input placeholder="IPRoyal" value={newProxy.provider} onChange={e => setNewProxy(f => ({ ...f, provider: e.target.value }))} className="mt-1" /></div>
                    <div><Label className="text-xs">Monthly Cost ($)</Label><Input placeholder="7" value={newProxy.monthly_cost} onChange={e => setNewProxy(f => ({ ...f, monthly_cost: e.target.value }))} className="mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">IP Address</Label><Input placeholder="86.109.92.98" value={newProxy.ip} onChange={e => setNewProxy(f => ({ ...f, ip: e.target.value }))} className="mt-1" /></div>
                    <div><Label className="text-xs">Port</Label><Input placeholder="12324" value={newProxy.port} onChange={e => setNewProxy(f => ({ ...f, port: e.target.value }))} className="mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Username</Label><Input value={newProxy.username} onChange={e => setNewProxy(f => ({ ...f, username: e.target.value }))} className="mt-1" /></div>
                    <div><Label className="text-xs">Password</Label><Input type="password" value={newProxy.password} onChange={e => setNewProxy(f => ({ ...f, password: e.target.value }))} className="mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label className="text-xs">City</Label><Input placeholder="Charlotte" value={newProxy.location_city} onChange={e => setNewProxy(f => ({ ...f, location_city: e.target.value }))} className="mt-1" /></div>
                    <div><Label className="text-xs">State</Label><Input placeholder="NC" value={newProxy.location_state} onChange={e => setNewProxy(f => ({ ...f, location_state: e.target.value }))} className="mt-1" /></div>
                    <div><Label className="text-xs">Country</Label><Input placeholder="US" value={newProxy.location_country} onChange={e => setNewProxy(f => ({ ...f, location_country: e.target.value }))} className="mt-1" /></div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={createProxy} className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl">Save Proxy</Button>
                    <Button variant="ghost" onClick={() => setShowNewProxy(false)} className="rounded-xl">Cancel</Button>
                  </div>
                </div>
              )}
            </div>

            {selectedProxy && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Button
                  onClick={() => setWizardStep("platforms")}
                  size="lg"
                  className="w-full bg-gradient-to-r from-violet-600 to-blue-600 rounded-xl shadow-lg shadow-violet-500/20 h-14 text-base"
                >
                  Next: Pick Platforms <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ═══ STEP 2: PICK PLATFORMS ═══ */}
        {wizardStep === "platforms" && (
          <motion.div key="platforms" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6 max-w-2xl mx-auto">
            <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <Globe className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="font-bold text-lg">Pick Your Platforms</h2>
                  <p className="text-xs text-muted-foreground">Select which platforms you want to log into. You'll log into each one in the browser.</p>
                </div>
              </div>

              {/* Proxy info badge */}
              {(() => {
                const p = proxies.find(x => x.id === selectedProxy)
                return p ? (
                  <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3 flex items-center gap-3">
                    <Wifi className="h-4 w-4 text-blue-400 shrink-0" />
                    <span className="font-mono text-sm">{p.ip}:{p.port}</span>
                    <Badge variant="outline" className="text-xs">{p.location_city || p.provider}</Badge>
                    <button onClick={() => setWizardStep("proxy")} className="text-xs text-blue-400 hover:underline ml-auto">Change</button>
                  </div>
                ) : null
              })()}

              {/* Main platforms (recommended) */}
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Recommended</p>
                <div className="grid grid-cols-3 gap-3">
                  {SOCIAL_PLATFORMS.filter(p => MAIN_PLATFORMS.includes(p.id)).map(p => {
                    const Icon = platformIcons[p.id] || Globe
                    const isSelected = selectedPlatforms.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        onClick={() => togglePlatform(p.id)}
                        className={cn(
                          "rounded-2xl border p-5 flex flex-col items-center gap-3 transition-all",
                          isSelected
                            ? "border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/10"
                            : "border-border/40 bg-card/40 hover:border-violet-500/30 hover:bg-violet-500/5"
                        )}
                      >
                        <div className={cn(
                          "h-14 w-14 rounded-2xl flex items-center justify-center transition-all",
                          isSelected ? p.bgClass : "bg-muted/30"
                        )}>
                          <Icon className={cn("h-7 w-7", isSelected ? p.textClass : "text-muted-foreground")} />
                        </div>
                        <span className={cn("text-sm font-semibold", isSelected ? "text-foreground" : "text-muted-foreground")}>{p.label}</span>
                        {isSelected && (
                          <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30 text-[10px]">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Selected
                          </Badge>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Other platforms */}
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Other Platforms</p>
                <div className="grid grid-cols-4 gap-2">
                  {SOCIAL_PLATFORMS.filter(p => !MAIN_PLATFORMS.includes(p.id)).map(p => {
                    const Icon = platformIcons[p.id] || Globe
                    const isSelected = selectedPlatforms.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        onClick={() => togglePlatform(p.id)}
                        className={cn(
                          "rounded-xl border p-3 flex flex-col items-center gap-2 transition-all",
                          isSelected
                            ? "border-violet-500 bg-violet-500/10"
                            : "border-border/40 bg-card/40 hover:border-violet-500/30"
                        )}
                      >
                        <Icon className={cn("h-5 w-5", isSelected ? p.textClass : "text-muted-foreground")} />
                        <span className="text-[11px] font-medium">{p.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {selectedPlatforms.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                {/* Per-platform account picker */}
                <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-violet-500/20 flex items-center justify-center">
                      <Shield className="h-4 w-4 text-violet-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">Pick the account for each platform</h3>
                      <p className="text-[11px] text-muted-foreground">We'll log each one into Chrome on this proxy.</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {selectedPlatforms.map(platformId => {
                      const p = getPlatform(platformId)
                      const Icon = platformIcons[platformId] || Globe
                      const picks = accountsForPicker(platformId)
                      const pickedId = accountByPlatform[platformId] || ""
                      return (
                        <div
                          key={platformId}
                          className="rounded-xl border border-border/40 bg-card/40 p-3 flex items-center gap-3"
                        >
                          <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", p?.bgClass || "bg-muted/30")}>
                            <Icon className={cn("h-4 w-4", p?.textClass || "text-muted-foreground")} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-sm font-medium">{p?.label || platformId}</span>
                              {!pickedId && (
                                <span className="text-[10px] text-amber-400">Required</span>
                              )}
                            </div>
                            {picks.length === 0 ? (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] text-muted-foreground">No {p?.label || platformId} accounts yet.</span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-lg h-7 text-[11px]"
                                  onClick={() => router.push("/accounts?tab=accounts")}
                                >
                                  <Plus className="h-3 w-3 mr-1" /> Add Account
                                </Button>
                              </div>
                            ) : (
                              <Select
                                value={pickedId || undefined}
                                onValueChange={(v) => setAccountByPlatform(cur => ({ ...cur, [platformId]: v }))}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder={`Pick a ${p?.label || platformId} account`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {picks.map(a => {
                                    const proxy = proxies.find(pr => pr.id === a.proxy_group_id)
                                    const onThisProxy = a.proxy_group_id === selectedProxy
                                    return (
                                      <SelectItem key={a.account_id} value={a.account_id}>
                                        @{a.username || a.display_name || a.account_id}
                                        {a.status && a.status !== "pending_setup" ? ` · ${a.status}` : ""}
                                        {proxy && !onThisProxy ? ` · ${proxy.location_city || proxy.ip}` : ""}
                                      </SelectItem>
                                    )
                                  })}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Warmup sequence — applied to every account in this group */}
                <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-orange-500/20 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-orange-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">Warmup Sequence</h3>
                        <p className="text-[11px] text-muted-foreground">Optional. Ramps the daily send cap over time so fresh accounts don't get banned.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        // Persist current wizard state, then bounce to the
                        // Warmup tab where the "new sequence" form will be
                        // auto-opened (?new=1). When the user comes back,
                        // the load() effect rehydrates from sessionStorage.
                        try {
                          window.sessionStorage.setItem("wizard-resume-state", JSON.stringify({
                            selectedProxy,
                            selectedPlatforms,
                            accountByPlatform,
                            useChromeProfile,
                            selectedWarmupId,
                            wizardStep: "platforms",
                          }))
                        } catch { /* sessionStorage may be unavailable — proceed anyway */ }
                        router.push("/accounts?tab=warmup&new=1")
                      }}
                      className="flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Make new sequence
                    </button>
                  </div>
                  <Select
                    value={selectedWarmupId || "none"}
                    onValueChange={(v) => setSelectedWarmupId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={warmupSeqs.length === 0 ? "No sequences yet — click + above" : "Select a sequence (optional)"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None — use fixed daily limit</SelectItem>
                      {warmupSeqs
                        .filter(w => !w.platform || selectedPlatforms.includes(w.platform))
                        .map(w => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}{w.platform ? ` — ${w.platform}` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Stealth toggle — sign into Chrome profile first */}
                <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg p-5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useChromeProfile}
                      onChange={(e) => setUseChromeProfile(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded accent-violet-500 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Chrome className="h-4 w-4 text-violet-400" />
                        <span className="text-sm font-semibold">Sign into a Chrome profile first</span>
                        <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30 text-[10px]">Stealth</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Recommended. Sign into any Google account so Chrome looks like a real user's browser before you touch any social platform. Cuts down the "fresh browser" fingerprint that triggers bans.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="rounded-2xl bg-gradient-to-r from-violet-500/10 to-emerald-500/10 border border-violet-500/30 p-4 shadow-lg">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">Setting up:</span>
                    {useChromeProfile && (
                      <Badge variant="outline" className="gap-1.5 py-1 border-violet-500/30">
                        <Chrome className="h-3 w-3 text-violet-400" /> Chrome profile
                      </Badge>
                    )}
                    {selectedPlatforms.map(id => {
                      const p = getPlatform(id)
                      const Icon = platformIcons[id] || Globe
                      const acc = accounts.find(a => a.account_id === accountByPlatform[id])
                      return (
                        <Badge key={id} variant="outline" className="gap-1.5 py-1">
                          <Icon className={cn("h-3 w-3", p?.textClass)} /> {p?.label}
                          {acc ? <span className="text-[10px] text-muted-foreground">@{acc.username || acc.display_name}</span> : null}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
                <Button
                  onClick={startSetup}
                  size="lg"
                  disabled={selectedPlatforms.some(p => !accountByPlatform[p])}
                  className="w-full bg-gradient-to-r from-violet-600 to-emerald-600 rounded-xl shadow-lg shadow-violet-500/20 h-14 text-base disabled:opacity-50"
                >
                  Set Up ({selectedPlatforms.length} platform{selectedPlatforms.length > 1 ? "s" : ""}) <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ═══ STEP 3: VNC LOGIN FLOW ═══ */}
        {wizardStep === "setup" && (
          <motion.div key="setup" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            <div className="flex gap-5 h-[calc(100vh-280px)] min-h-[500px]">
              {/* Left panel - Login checklist */}
              <div className="w-[340px] shrink-0 flex flex-col rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg overflow-hidden">
                <div className="p-4 border-b border-border/30 bg-gradient-to-r from-violet-500/5 to-blue-500/5">
                  <h2 className="font-bold text-lg">Login Checklist</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Log into each platform. The browser will auto-navigate for you.
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {/* Browser ready indicator */}
                  <div className={cn(
                    "rounded-xl border p-3 transition-all",
                    vncUrl ? "border-emerald-500/30 bg-emerald-500/5" : "border-violet-500 bg-violet-500/10"
                  )}>
                    <div className="flex items-center gap-2.5">
                      {vncUrl
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        : <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />}
                      <span className="text-sm font-medium">
                        {vncUrl ? "Browser Ready" : "Starting Browser..."}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 pl-6.5">
                      Chrome with your proxy connected
                    </p>
                  </div>

                  {/* Chrome profile step (when stealth toggle is on) */}
                  {useChromeProfile && (
                    <div>
                      <div className={cn(
                        "w-full rounded-xl border p-3 text-left transition-all",
                        chromeProfileDone ? "border-emerald-500/30 bg-emerald-500/5" :
                        "border-violet-500 bg-violet-500/10 shadow-md"
                      )}>
                        <div className="flex items-center gap-2.5">
                          {chromeProfileDone
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            : <Chrome className="h-4 w-4 text-violet-400" />}
                          <span className="text-sm font-medium">Chrome profile</span>
                          {chromeProfileDone
                            ? <Badge className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Done</Badge>
                            : <Badge className="ml-auto text-[10px] bg-violet-500/20 text-violet-400 border-violet-500/30">Current</Badge>}
                        </div>
                      </div>
                      {!chromeProfileDone && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="mt-2 ml-2 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 space-y-3"
                        >
                          <ol className="space-y-1.5">
                            <li className="flex items-start gap-2 text-[11px] text-muted-foreground">
                              <span className="h-4 w-4 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0 text-[9px] font-bold mt-0.5">1</span>
                              Sign into any Google account on the Google Sign-in page
                            </li>
                            <li className="flex items-start gap-2 text-[11px] text-muted-foreground">
                              <span className="h-4 w-4 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0 text-[9px] font-bold mt-0.5">2</span>
                              Enter password and complete any 2FA
                            </li>
                            <li className="flex items-start gap-2 text-[11px] text-muted-foreground">
                              <span className="h-4 w-4 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0 text-[9px] font-bold mt-0.5">3</span>
                              Wait until you see the Google account dashboard
                            </li>
                          </ol>

                          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2">
                            <p className="text-[10px] text-emerald-400 font-medium">
                              Why: a signed-in Chrome profile makes the browser look real. Dramatically fewer Instagram/FB bans.
                            </p>
                          </div>

                          <Button
                            onClick={() => {
                              setChromeProfileDone(true)
                              const firstPlatform = selectedPlatforms[0]
                              const guide = firstPlatform ? PLATFORM_LOGIN_GUIDES[firstPlatform] : undefined
                              if (guide) navigateToUrl(guide.url)
                            }}
                            size="sm"
                            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl text-xs"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> I'm signed in — continue to platforms
                          </Button>
                        </motion.div>
                      )}
                    </div>
                  )}

                  {/* Platform steps */}
                  {selectedPlatforms.map((platformId, i) => {
                    const Icon = platformIcons[platformId] || Globe
                    const platInfo = getPlatform(platformId)
                    const isCompleted = completedLogins.has(platformId)
                    const isLocked = useChromeProfile && !chromeProfileDone
                    const isCurrent = !isLocked && currentLoginIndex === i && !isCompleted
                    const guide = PLATFORM_LOGIN_GUIDES[platformId]

                    return (
                      <div key={platformId}>
                        <button
                          disabled={isLocked}
                          onClick={() => {
                            if (isLocked) return
                            if (!isCompleted && i <= Math.max(currentLoginIndex, [...completedLogins].length)) {
                              setCurrentLoginIndex(i)
                              if (guide) navigateToUrl(guide.url)
                            }
                          }}
                          className={cn(
                            "w-full rounded-xl border p-3 text-left transition-all",
                            isCompleted ? "border-emerald-500/30 bg-emerald-500/5" :
                            isCurrent ? "border-violet-500 bg-violet-500/10 shadow-md" :
                            "border-border/40 bg-card/40 opacity-50"
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            {isCompleted
                              ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                              : <Icon className={cn("h-4 w-4", isCurrent ? (platInfo?.textClass || "text-violet-400") : "text-muted-foreground")} />}
                            <span className="text-sm font-medium">{platInfo?.label || platformId}</span>
                            {isCompleted && <Badge className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Done</Badge>}
                            {isCurrent && <Badge className="ml-auto text-[10px] bg-violet-500/20 text-violet-400 border-violet-500/30">Current</Badge>}
                          </div>
                          {isCompleted && loginUsernames[platformId] && (
                            <p className="text-[10px] text-emerald-400 mt-1 pl-6.5">@{loginUsernames[platformId]?.replace(/^@/, "")}</p>
                          )}
                        </button>

                        {/* Expanded instructions for current */}
                        {isCurrent && guide && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="mt-2 ml-2 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 space-y-3"
                          >
                            <ol className="space-y-1.5">
                              {guide.steps.map((step, si) => (
                                <li key={si} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                                  <span className="h-4 w-4 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0 text-[9px] font-bold mt-0.5">{si + 1}</span>
                                  {step}
                                </li>
                              ))}
                            </ol>

                            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2">
                              <p className="text-[10px] text-emerald-400 font-medium">{guide.successIndicator}</p>
                            </div>

                            <div className="space-y-2">
                              <div>
                                <Label className="text-[10px]">Username you logged in with</Label>
                                <Input
                                  placeholder="@yourusername"
                                  value={loginUsernames[platformId] || ""}
                                  onChange={e => setLoginUsernames(prev => ({ ...prev, [platformId]: e.target.value }))}
                                  className="h-8 text-xs mt-1"
                                />
                              </div>
                              <Button
                                onClick={confirmLogin}
                                disabled={capturing || !loginUsernames[platformId]?.trim()}
                                size="sm"
                                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl text-xs"
                              >
                                {capturing ? (
                                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Saving...</>
                                ) : (
                                  <><Save className="h-3 w-3 mr-1" /> Confirm {platInfo?.label} Login</>
                                )}
                              </Button>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Bottom action */}
                <div className="p-4 border-t border-border/30">
                  {allLoginsComplete ? (
                    <Button
                      onClick={finishSetup}
                      disabled={finishing}
                      className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl shadow-lg"
                    >
                      {finishing ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Finishing...</>
                      ) : (
                        <><CheckCircle2 className="h-4 w-4 mr-2" /> Finish Setup</>
                      )}
                    </Button>
                  ) : (
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">
                        {completedLogins.size}/{selectedPlatforms.length} platforms logged in
                      </p>
                      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden mt-2">
                        <div
                          className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 rounded-full transition-all"
                          style={{ width: `${(completedLogins.size / selectedPlatforms.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right panel - VNC iframe */}
              <div className="flex-1 rounded-2xl overflow-hidden bg-black/90 border border-border/50 shadow-lg relative">
                {vncUrl ? (
                  <>
                    {!vncLoaded && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
                        <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
                        <p className="text-sm text-muted-foreground">Loading browser view...</p>
                      </div>
                    )}
                    <iframe
                      src={vncUrl}
                      className="w-full h-full border-0"
                      onLoad={() => setVncLoaded(true)}
                      allow="clipboard-read; clipboard-write"
                    />
                  </>
                ) : captureError ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <XCircle className="h-12 w-12 text-red-400" />
                    <p className="text-sm text-red-400 text-center max-w-sm">{captureError}</p>
                    <Button variant="outline" onClick={handleCancel} className="rounded-xl">Go Back</Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                    <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
                    <p className="text-sm">Starting Chrome browser...</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══ STEP 4: DONE ═══ */}
        {wizardStep === "done" && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-xl mx-auto">
            <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-emerald-500/30 shadow-lg p-8 text-center space-y-6">
              <div className="mx-auto h-20 w-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground">Group Setup Complete</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  All accounts are logged in and saved. Sessions persist automatically.
                </p>
              </div>

              <div className="rounded-xl bg-muted/20 border border-border/30 p-4 text-left space-y-2">
                <h3 className="text-sm font-semibold text-foreground">What's been saved:</h3>
                <ul className="space-y-1.5">
                  {selectedPlatforms.map(platformId => {
                    const Icon = platformIcons[platformId] || Globe
                    const platInfo = getPlatform(platformId)
                    const username = loginUsernames[platformId]
                    return (
                      <li key={platformId} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        <Icon className={cn("h-3.5 w-3.5", platInfo?.textClass || "text-muted-foreground")} />
                        <span>{platInfo?.label}</span>
                        {username && <span className="text-muted-foreground">@{username.replace(/^@/, "")}</span>}
                      </li>
                    )
                  })}
                </ul>
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border/30">
                  <Cookie className="h-3.5 w-3.5" />
                  <span>Cookies, localStorage, and Chrome profile saved</span>
                </div>
              </div>

              <div className="flex gap-3 justify-center">
                <Button onClick={() => router.push("/accounts")} className="bg-gradient-to-r from-violet-600 to-blue-600 rounded-xl shadow-lg">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back to Accounts
                </Button>
                <Button variant="outline" onClick={() => {
                  setWizardStep("proxy")
                  setSelectedPlatforms([])
                  setCompletedLogins(new Set())
                  setCurrentLoginIndex(0)
                  setVncUrl("")
                  setVncSessionId("")
                  setLoginUsernames({})
                }} className="rounded-xl">
                  <Plus className="h-4 w-4 mr-1" /> Set Up Another Group
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
