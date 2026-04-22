"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import {
  Monitor, Loader2, CheckCircle2, XCircle, ArrowRight,
  Globe, Shield, Eye, Cookie, Save, LogOut, RefreshCw,
  ChevronRight, AlertTriangle, Instagram, Facebook, Linkedin,
} from "lucide-react"
import { SOCIAL_PLATFORMS } from "@/lib/platforms"

// Login URLs the toolbar uses to force-navigate the VNC tab to the right
// platform. If the VNC Manager opens the wrong page on first launch (e.g. the
// reported "Login Instagram → sketchy LinkedIn" bug), the user has a one-click
// escape hatch.
const PLATFORM_URLS: Record<string, string> = {
  instagram: "https://www.instagram.com/accounts/login/",
  facebook: "https://www.facebook.com/login",
  linkedin: "https://www.linkedin.com/login",
  tiktok: "https://www.tiktok.com/login",
  twitter: "https://twitter.com/login",
  x: "https://x.com/login",
  youtube: "https://accounts.google.com/signin",
  pinterest: "https://www.pinterest.com/login/",
  snapchat: "https://accounts.snapchat.com/accounts/login",
}

const VNC_WS_HOST = process.env.NEXT_PUBLIC_VNC_WS_HOST || "srv1197943.taild42583.ts.net"
const VNC_API_BASE = `https://${VNC_WS_HOST}`
const VNC_API_KEY = "vnc-mgr-2026-dylan"

const PLATFORM_LOGIN_INSTRUCTIONS: Record<string, { steps: string[]; tips: string[] }> = {
  instagram: {
    steps: [
      "Enter your username or email",
      "Enter your password",
      "If 2FA is enabled, enter the code from your authenticator app",
      "Click 'Log In'",
      "If prompted, click 'Not Now' on any save login popups",
      "Wait for the home feed to load",
      "Click 'Save & Confirm' below when you see the feed",
    ],
    tips: [
      "Use a real account you own",
      "Don't use a brand new account, they get flagged",
      "Make sure the proxy matches the account's usual location",
    ],
  },
  facebook: {
    steps: [
      "Enter your email or phone number",
      "Enter your password",
      "If prompted for 2FA, enter the code",
      "Click 'Log In'",
      "Dismiss any popups ('Not Now')",
      "Wait for the News Feed to load",
      "Click 'Save & Confirm' below",
    ],
    tips: [
      "Use a personal account or page admin account",
      "Accept cookie banners if they appear",
    ],
  },
  linkedin: {
    steps: [
      "Enter your email address",
      "Enter your password",
      "Complete any security verification",
      "Click 'Sign in'",
      "Wait for the LinkedIn feed to load",
      "Click 'Save & Confirm' below",
    ],
    tips: [
      "LinkedIn is strict about automation, use carefully",
      "Don't log in from unusual locations too often",
    ],
  },
  tiktok: {
    steps: [
      "Choose your login method (email, phone, or social)",
      "Enter your credentials",
      "Complete any CAPTCHA if shown",
      "Wait for the For You page to load",
      "Click 'Save & Confirm' below",
    ],
    tips: ["TikTok has aggressive bot detection, be patient with CAPTCHAs"],
  },
  youtube: {
    steps: [
      "Sign in with your Google account",
      "Enter your email and click Next",
      "Enter your password and click Next",
      "Complete 2FA if required",
      "Wait for YouTube to load",
      "Click 'Save & Confirm' below",
    ],
    tips: ["This signs you into all Google services on this browser"],
  },
  x: {
    steps: [
      "Enter your username, email, or phone",
      "Click Next",
      "Enter your password",
      "Complete any verification challenges",
      "Wait for the timeline to load",
      "Click 'Save & Confirm' below",
    ],
    tips: ["X may ask for phone verification on new logins"],
  },
  snapchat: {
    steps: [
      "Enter your username or email",
      "Enter your password",
      "Complete any verification",
      "Wait for the web interface to load",
      "Click 'Save & Confirm' below",
    ],
    tips: ["Snapchat web has limited functionality"],
  },
  pinterest: {
    steps: [
      "Enter your email address",
      "Enter your password",
      "Click 'Log in'",
      "Wait for the home feed to load",
      "Click 'Save & Confirm' below",
    ],
    tips: ["Pinterest is less strict about automation"],
  },
}

interface VncLoginFlowProps {
  open: boolean
  onClose: () => void
  onComplete: (data: { account_id: string; platform: string; username: string }) => void
  proxyGroupId: string
  proxyIp?: string
  proxyLocation?: string
  existingAccount?: { account_id: string; platform: string; username: string } | null
  initialPlatform?: string
}

type FlowStep = "platform" | "connecting" | "login" | "capturing" | "done" | "error"

const VNC_CONNECT_TIMEOUT_MS = 15000

async function probeVncReachable(): Promise<{ ok: boolean; reason?: string }> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(`${VNC_API_BASE}/health`, { signal: ctrl.signal, mode: "cors" })
    clearTimeout(t)
    if (!res.ok) return { ok: false, reason: `VNC server returned HTTP ${res.status}` }
    return { ok: true }
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, reason: "VNC server didn't respond within 6s." }
    return { ok: false, reason: `Can't reach the VNC server (${e?.message || "network error"}).` }
  }
}

export default function VncLoginFlow({
  open, onClose, onComplete, proxyGroupId, proxyIp, proxyLocation,
  existingAccount, initialPlatform,
}: VncLoginFlowProps) {
  const [step, setStep] = useState<FlowStep>(existingAccount ? "connecting" : "platform")
  const [platform, setPlatform] = useState(initialPlatform || existingAccount?.platform || "")
  const [sessionId, setSessionId] = useState("")
  const [vncPassword, setVncPassword] = useState("")
  const [vncUrl, setVncUrl] = useState("")
  const [vncLoaded, setVncLoaded] = useState(false)
  const [vncTimedOut, setVncTimedOut] = useState(false)
  const [username, setUsername] = useState(existingAccount?.username || "")
  const [displayName, setDisplayName] = useState("")
  const [error, setError] = useState("")
  const [capturing, setCapturing] = useState(false)
  const [currentTabUrl, setCurrentTabUrl] = useState<string>("")
  const [navigating, setNavigating] = useState<string | null>(null)

  const vncFetch = useCallback(async (path: string, options?: RequestInit) => {
    const res = await fetch(`${VNC_API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": VNC_API_KEY,
        ...options?.headers,
      },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "VNC Manager unreachable" }))
      throw new Error(err.error || `VNC request failed (${res.status})`)
    }
    return res.json()
  }, [])

  // Force the VNC tab onto a given URL. Hits the direct VNC Manager and, as a
  // second channel, the dashboard proxy at /api/vnc/session/:id/navigate — so
  // if the VPS manager drops the request the dashboard still logs the intent.
  const navigateTab = useCallback(async (targetUrl: string, label?: string) => {
    if (!sessionId) {
      toast.error("No active session yet")
      return
    }
    setNavigating(label || targetUrl)
    try {
      // Primary: direct VNC Manager
      await vncFetch(`/api/sessions/${sessionId}/navigate`, {
        method: "POST",
        body: JSON.stringify({ url: targetUrl }),
      }).catch(() => {})
      // Secondary/ observability: dashboard proxy endpoint
      await fetch(`/api/vnc/session/${sessionId}/navigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      }).catch(() => {})
      setCurrentTabUrl(targetUrl)
      toast.success(`Opened ${label || "link"}`)
    } catch (e: any) {
      toast.error(e?.message || "Navigate failed")
    } finally {
      setNavigating(null)
    }
  }, [sessionId, vncFetch])

  const startSession = useCallback(async (selectedPlatform: string) => {
    setStep("connecting")
    setError("")

    const reach = await probeVncReachable()
    if (!reach.ok) {
      setError(reach.reason || "VNC server not reachable")
      setStep("error")
      return
    }

    try {
      const data = await vncFetch("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          proxy_group_id: proxyGroupId,
          platform: selectedPlatform,
          // When reopening an existing account, hand the account_id over so
          // the VNC Manager hydrates THIS account's cookies from Supabase on
          // top of the disk profile. Without it, the browser launches with
          // only whatever Chrome had on disk — which on fresh boxes or after
          // a crashed shutdown is often empty or stale.
          account_id: existingAccount?.account_id,
          use_chrome_profile: true,
        }),
      })

      setSessionId(data.data.id)
      setVncPassword(data.data.vncPassword || "")
      const pwd = data.data.vncPassword ? `&password=${encodeURIComponent(data.data.vncPassword)}` : ""
      setVncUrl(`${VNC_API_BASE}/novnc/vnc_lite.html?path=websockify/${data.data.id}&autoconnect=true&resize=scale${pwd}`)
      setStep("login")

      // Track what we *expected* the tab to be on. The toolbar can compare and
      // log a warning if the manager opens something else (e.g. the reported
      // "Login Instagram → LinkedIn" bug).
      const expected = PLATFORM_URLS[selectedPlatform]
      const initialTabUrl: string = data?.data?.initial_url || data?.data?.url || ""
      setCurrentTabUrl(initialTabUrl || expected || "")
      if (initialTabUrl && expected && !initialTabUrl.includes(new URL(expected).hostname)) {
        console.warn(
          "[VNC] Initial tab URL does not match requested platform",
          { requested: selectedPlatform, expected, got: initialTabUrl }
        )
        // Fire-and-forget observability POST — dashboard-side record only, the
        // ai-agent scan cron reads these for pattern analysis.
        fetch("/api/ai-agent/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "vnc_platform_mismatch",
            requested_platform: selectedPlatform,
            expected_url: expected,
            actual_url: initialTabUrl,
            session_id: data.data.id,
            account_id: existingAccount?.account_id || null,
            at: new Date().toISOString(),
          }),
        }).catch(() => {})
      }

      // Also proactively fire a navigate to the correct platform URL — belt
      // and suspenders. If the manager already got it right this is a no-op.
      if (expected) {
        // Don't await — we don't want to block entering the login step on this
        setTimeout(() => {
          fetch(`/api/vnc/session/${data.data.id}/navigate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: expected }),
          }).catch(() => {})
        }, 800)
      }
    } catch (e: any) {
      setError(e.message)
      setStep("error")
    }
  }, [proxyGroupId, vncFetch, existingAccount])

  useEffect(() => {
    if (open && existingAccount) {
      startSession(existingAccount.platform)
    }
  }, [open, existingAccount, startSession])

  useEffect(() => {
    if (!vncUrl || vncLoaded) return
    const t = setTimeout(() => setVncTimedOut(true), VNC_CONNECT_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [vncUrl, vncLoaded])

  function selectPlatform(p: string) {
    setPlatform(p)
    startSession(p)
  }

  async function captureAndSave() {
    if (!username.trim()) {
      toast.error("Enter the username you logged in with")
      return
    }

    setCapturing(true)
    setStep("capturing")

    try {
      const captureData = await vncFetch(`/api/sessions/${sessionId}/capture`, {
        method: "POST",
        body: JSON.stringify({
          account_id: existingAccount?.account_id || null,
          platform,
          username: username.replace(/^@/, ""),
          display_name: displayName || username.replace(/^@/, ""),
        }),
      })

      await vncFetch(`/api/sessions/${sessionId}`, { method: "DELETE" }).catch(() => {})

      setStep("done")
      toast.success(`${platform} account saved with ${captureData.data.cookies_count} cookies`)

      setTimeout(() => {
        onComplete({
          account_id: captureData.data.account_id,
          platform,
          username: username.replace(/^@/, ""),
        })
      }, 1500)
    } catch (e: any) {
      setError(e.message)
      setStep("error")
    } finally {
      setCapturing(false)
    }
  }

  async function handleLogoutFirst() {
    if (!sessionId) return
    toast.info("Logging out of current account...")
    try {
      await vncFetch(`/api/sessions/${sessionId}/navigate`, {
        method: "POST",
        body: JSON.stringify({ url: getLogoutUrl(platform) }),
      })
      toast.success("Logged out. Now log in with the new account.")
    } catch {
      toast.error("Could not auto-logout. Please log out manually in the browser.")
    }
  }

  function handleClose() {
    if (sessionId) {
      vncFetch(`/api/sessions/${sessionId}`, { method: "DELETE" }).catch(() => {})
    }
    setStep("platform")
    setPlatform("")
    setSessionId("")
    setVncUrl("")
    setVncLoaded(false)
    setVncTimedOut(false)
    setUsername("")
    setDisplayName("")
    setError("")
    onClose()
  }

  const instructions = PLATFORM_LOGIN_INSTRUCTIONS[platform] || PLATFORM_LOGIN_INSTRUCTIONS.instagram

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-6xl h-[85vh] p-0 overflow-hidden bg-card/95 backdrop-blur-xl">
        <div className="flex h-full">
          {/* Left Panel — Instructions */}
          <div className="w-[340px] shrink-0 border-r border-border/30 bg-gradient-to-b from-card to-muted/20 flex flex-col">
            <div className="p-5 border-b border-border/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                  <Monitor className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <h2 className="font-bold text-lg">
                    {existingAccount ? "Swap Account" : "Add Account"}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {proxyIp && `Via ${proxyIp}`}
                    {proxyLocation && ` · ${proxyLocation}`}
                  </p>
                </div>
              </div>

              {platform && (
                <Badge className="capitalize text-sm px-3 py-1">
                  {SOCIAL_PLATFORMS.find(p => p.id === platform)?.label || platform}
                </Badge>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <AnimatePresence mode="wait">
                {step === "platform" && (
                  <motion.div
                    key="platform"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    <h3 className="font-semibold text-sm text-foreground">Choose Platform</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {SOCIAL_PLATFORMS.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => selectPlatform(p.id)}
                          className={cn(
                            "rounded-xl border border-border/40 p-3 text-left transition-all",
                            "hover:border-violet-500/50 hover:bg-violet-500/5 hover:shadow-md",
                            "flex flex-col items-center gap-2 text-center"
                          )}
                        >
                          <Globe className="h-6 w-6 text-muted-foreground" />
                          <span className="text-xs font-medium">{p.label}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {step === "connecting" && (
                  <motion.div
                    key="connecting"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-12 gap-4"
                  >
                    <Loader2 className="h-10 w-10 text-violet-400 animate-spin" />
                    <p className="text-sm text-muted-foreground">Starting Chrome browser...</p>
                    <p className="text-xs text-muted-foreground">Opening {platform} login page</p>
                  </motion.div>
                )}

                {step === "login" && (
                  <motion.div
                    key="login"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-5"
                  >
                    {existingAccount && (
                      <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 space-y-2">
                        <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
                          <AlertTriangle className="h-4 w-4" />
                          Swapping Account
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Currently: @{existingAccount.username}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleLogoutFirst}
                          className="text-xs rounded-xl"
                        >
                          <LogOut className="h-3 w-3 mr-1" /> Log Out First
                        </Button>
                      </div>
                    )}

                    <div>
                      <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
                        <Shield className="h-4 w-4 text-emerald-400" />
                        Login Steps
                      </h3>
                      <ol className="space-y-2.5">
                        {instructions.steps.map((s, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-xs">
                            <span className="h-5 w-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">
                              {i + 1}
                            </span>
                            <span className="text-muted-foreground leading-relaxed">{s}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {instructions.tips.length > 0 && (
                      <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3">
                        <h4 className="text-xs font-semibold text-blue-400 mb-2">Tips</h4>
                        <ul className="space-y-1">
                          {instructions.tips.map((t, i) => (
                            <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                              <ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-blue-400" />
                              {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="space-y-3 pt-2 border-t border-border/30">
                      <div>
                        <Label className="text-xs">Username (after login)</Label>
                        <Input
                          placeholder="@yourusername"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Display Name (optional)</Label>
                        <Input
                          placeholder="John Doe"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={captureAndSave}
                      disabled={capturing || !username.trim()}
                      className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl shadow-lg"
                    >
                      {capturing ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Capturing...</>
                      ) : (
                        <><Save className="h-4 w-4 mr-2" /> Save & Confirm</>
                      )}
                    </Button>
                  </motion.div>
                )}

                {step === "capturing" && (
                  <motion.div
                    key="capturing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-12 gap-4"
                  >
                    <div className="relative">
                      <Loader2 className="h-10 w-10 text-emerald-400 animate-spin" />
                      <Cookie className="h-4 w-4 text-amber-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Capturing session data...</p>
                    <div className="space-y-1 text-center">
                      <p className="text-xs text-muted-foreground">Saving cookies</p>
                      <p className="text-xs text-muted-foreground">Saving localStorage</p>
                      <p className="text-xs text-muted-foreground">Saving session tokens</p>
                    </div>
                  </motion.div>
                )}

                {step === "done" && (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center py-12 gap-4"
                  >
                    <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                    </div>
                    <h3 className="font-bold text-lg text-foreground">Account Saved</h3>
                    <p className="text-sm text-muted-foreground text-center">
                      @{username.replace(/^@/, "")} on {platform} is now active and ready for campaigns
                    </p>
                  </motion.div>
                )}

                {step === "error" && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-12 gap-4"
                  >
                    <div className="h-16 w-16 rounded-full bg-red-500/20 flex items-center justify-center">
                      <XCircle className="h-8 w-8 text-red-400" />
                    </div>
                    <h3 className="font-bold text-lg text-foreground">Something went wrong</h3>
                    <p className="text-sm text-red-400 text-center max-w-xs">{error}</p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => { setStep("platform"); setError("") }}
                        className="rounded-xl"
                      >
                        <RefreshCw className="h-4 w-4 mr-1" /> Try Again
                      </Button>
                      <Button variant="ghost" onClick={handleClose} className="rounded-xl">
                        Cancel
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right Panel — VNC Iframe */}
          <div className="flex-1 relative bg-black/90 flex flex-col">
            {/* Navigation toolbar — force-opens the right platform login page if
                the VNC Manager opened something else (the reported "Login IG
                → LinkedIn" bug has a one-click fix here). */}
            {(step === "login" || step === "capturing") && sessionId && (
              <div className="shrink-0 border-b border-border/40 bg-card/70 backdrop-blur px-3 py-2 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => navigateTab(PLATFORM_URLS.instagram, "Instagram")}
                  disabled={!!navigating}
                  className="rounded-lg bg-gradient-to-r from-pink-600 to-fuchsia-600 h-7 text-xs"
                >
                  <Globe className="h-3 w-3 mr-1" />
                  Open Instagram Login
                </Button>
                <div className="flex items-center gap-1 border-l border-border/40 pl-2">
                  <button
                    onClick={() => navigateTab(PLATFORM_URLS.instagram, "Instagram")}
                    disabled={!!navigating}
                    title="Go to Instagram"
                    className="p-1.5 rounded-md hover:bg-pink-500/20 disabled:opacity-40"
                  >
                    <Instagram className="h-4 w-4 text-pink-400" />
                  </button>
                  <button
                    onClick={() => navigateTab(PLATFORM_URLS.facebook, "Facebook")}
                    disabled={!!navigating}
                    title="Go to Facebook"
                    className="p-1.5 rounded-md hover:bg-blue-500/20 disabled:opacity-40"
                  >
                    <Facebook className="h-4 w-4 text-blue-400" />
                  </button>
                  <button
                    onClick={() => navigateTab(PLATFORM_URLS.linkedin, "LinkedIn")}
                    disabled={!!navigating}
                    title="Go to LinkedIn"
                    className="p-1.5 rounded-md hover:bg-sky-500/20 disabled:opacity-40"
                  >
                    <Linkedin className="h-4 w-4 text-sky-400" />
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigateTab(currentTabUrl || PLATFORM_URLS[platform] || "about:blank", "Refresh")}
                  disabled={!!navigating}
                  className="rounded-lg h-7 text-xs"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh Tab
                </Button>
                <div className="ml-auto text-[10px] text-muted-foreground truncate max-w-[260px]">
                  Tab is on:{" "}
                  <span className="font-mono text-foreground">
                    {currentTabUrl || "—"}
                  </span>
                </div>
              </div>
            )}
            <div className="relative flex-1">
            {(step === "login" || step === "capturing") && vncUrl ? (
              <>
                {!vncLoaded && !vncTimedOut && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
                    <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading browser view...</p>
                    <p className="text-[11px] text-muted-foreground/80 max-w-sm text-center">
                      If this hangs longer than a few seconds, your device probably isn't on Tailscale — the VNC server lives on the private network.
                    </p>
                  </div>
                )}
                {vncTimedOut && !vncLoaded && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 p-8 text-center bg-black/70">
                    <div className="h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center">
                      <XCircle className="h-6 w-6 text-red-400" />
                    </div>
                    <h4 className="font-semibold text-sm text-foreground">VNC browser didn't load</h4>
                    <p className="text-xs text-muted-foreground max-w-md">
                      The iframe couldn't reach <span className="font-mono">{VNC_WS_HOST}</span>. Confirm you can open {VNC_API_BASE}/health in a new tab, then retry.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setVncTimedOut(false); setVncLoaded(false); setVncUrl("")
                        const pwd = vncPassword ? `&password=${encodeURIComponent(vncPassword)}` : ""
                        setTimeout(() => setVncUrl(`${VNC_API_BASE}/novnc/vnc_lite.html?path=websockify/${sessionId}&autoconnect=true&resize=scale${pwd}`), 50)
                      }}
                      className="rounded-xl text-xs"
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
                    </Button>
                  </div>
                )}
                <iframe
                  src={vncUrl}
                  className="w-full h-full border-0"
                  onLoad={() => setVncLoaded(true)}
                  allow="clipboard-read; clipboard-write"
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                <Monitor className="h-16 w-16 opacity-20" />
                <p className="text-sm">
                  {step === "platform"
                    ? "Select a platform to start"
                    : step === "connecting"
                    ? "Starting browser..."
                    : "Browser view"}
                </p>
              </div>
            )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function getLogoutUrl(platform: string): string {
  const urls: Record<string, string> = {
    instagram: "https://www.instagram.com/accounts/logout/",
    facebook: "https://www.facebook.com/logout.php",
    linkedin: "https://www.linkedin.com/m/logout/",
    tiktok: "https://www.tiktok.com/logout",
    youtube: "https://accounts.google.com/Logout",
    x: "https://twitter.com/logout",
    snapchat: "https://accounts.snapchat.com/accounts/logout",
    pinterest: "https://www.pinterest.com/logout/",
  }
  return urls[platform] || "about:blank"
}
