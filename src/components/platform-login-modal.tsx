"use client"

/**
 * PlatformLoginModal
 *
 * Guided "Log in to X" flow. Replaces the old behavior of popping open a raw
 * noVNC window — users were dumped on a password prompt with no context.
 *
 * Design mirrors the automations RecordingModal: split layout with a
 * step-by-step instructions side panel on the left and the embedded VNC view
 * on the right. A platform toolbar at the top navigates the single VPS Chrome
 * between Instagram / Facebook / LinkedIn / etc. using `/api/platforms/goto`,
 * so we reuse ONE persistent browser (no new VNC session per platform).
 *
 * On "I'm Logged In", the modal:
 *   1. Refreshes `/api/platforms/login-status` to re-probe the platforms
 *   2. Reports which are now green / still needing login via toast
 *   3. If more platforms remain, hints the user to the next one
 *   4. Closes + calls onComplete so the parent page refetches its health data
 *
 * The cookies snapshot call is a no-op until the VPS exposes a "dump cookies"
 * endpoint (documented separately for Dylan in the repo notes). When that
 * lands this component will automatically POST the snapshot to Supabase.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import {
  Monitor, Loader2, CheckCircle2, ArrowRight, Shield,
  ChevronRight, Instagram, Facebook, Linkedin, Globe,
  RefreshCw, LogIn, ExternalLink, XCircle,
} from "lucide-react"

// Public VNC iframe URL + plaintext password (Vercel env). The URL itself is
// public and auth still requires the noVNC password + Tailscale reachability.
const VNC_URL = process.env.NEXT_PUBLIC_VNC_URL || "https://srv1197943.taild42583.ts.net/vnc.html"
const VNC_PASSWORD = process.env.NEXT_PUBLIC_VNC_PASSWORD || ""
const VNC_EMBED_URL = VNC_PASSWORD
  ? `${VNC_URL}${VNC_URL.includes("?") ? "&" : "?"}autoconnect=true&resize=scale&password=${encodeURIComponent(VNC_PASSWORD)}`
  : ""

// Canonical login URL per platform. /api/platforms/goto forwards this to the
// VPS's single Chrome instance so the user lands on the right login page
// without having to type a URL inside the noVNC session.
const PLATFORM_LOGIN_URLS: Record<string, string> = {
  instagram: "https://www.instagram.com/accounts/login/",
  facebook: "https://www.facebook.com/login",
  linkedin: "https://www.linkedin.com/login",
  tiktok: "https://www.tiktok.com/login",
  twitter: "https://twitter.com/login",
  x: "https://x.com/login",
  youtube: "https://accounts.google.com/signin",
  google: "https://accounts.google.com/signin",
  pinterest: "https://www.pinterest.com/login/",
  snapchat: "https://accounts.snapchat.com/accounts/login",
}

// Per-platform step list + quick tips. Same tone as the recording flow guide
// so users hit a consistent instructional pattern across the app.
const PLATFORM_INSTRUCTIONS: Record<string, { label: string; steps: string[]; tips: string[] }> = {
  instagram: {
    label: "Instagram",
    steps: [
      "Type your username or email in the first field",
      "Type your password",
      "Click Log In",
      "If Instagram asks for a 2FA code, grab it from your authenticator app",
      "Dismiss any 'Save login info' or 'Turn on notifications' popups with 'Not Now'",
      "Wait for your home feed to appear",
      "Click 'I'm Logged In' below when you see your feed",
    ],
    tips: [
      "Use the real account you want to run — don't create a new one here",
      "If Instagram blocks the login, retry in a few minutes on the same proxy",
    ],
  },
  facebook: {
    label: "Facebook",
    steps: [
      "Enter your email or phone",
      "Enter your password",
      "Click Log In",
      "Enter your 2FA code if Facebook prompts for one",
      "Dismiss 'Save login' and cookie banners",
      "Wait for your News Feed to load",
      "Click 'I'm Logged In' below when the feed is visible",
    ],
    tips: [
      "A personal account with some activity works best — brand-new accounts get flagged",
      "Accept the cookie banner if one shows up",
    ],
  },
  linkedin: {
    label: "LinkedIn",
    steps: [
      "Enter your email",
      "Enter your password",
      "Click Sign in",
      "Finish any security verification LinkedIn asks for",
      "Wait for your LinkedIn home feed to load",
      "Click 'I'm Logged In' below when the feed is visible",
    ],
    tips: [
      "LinkedIn is strict — log in from the same proxy/location each time",
    ],
  },
  tiktok: {
    label: "TikTok",
    steps: [
      "Pick your usual login method (email / phone / Google / etc.)",
      "Enter your credentials",
      "Solve any captcha TikTok shows",
      "Wait for the For You page to load",
      "Click 'I'm Logged In' below",
    ],
    tips: ["TikTok loves captchas — be patient with them"],
  },
  twitter: {
    label: "X (Twitter)",
    steps: [
      "Type your username, email, or phone and hit Next",
      "Enter your password",
      "Finish any challenge X shows (phone verify, email code, etc.)",
      "Wait for the timeline to load",
      "Click 'I'm Logged In' below",
    ],
    tips: ["X may ask for phone verification on new devices"],
  },
  x: {
    label: "X (Twitter)",
    steps: [
      "Type your username, email, or phone and hit Next",
      "Enter your password",
      "Finish any challenge X shows",
      "Wait for the timeline to load",
      "Click 'I'm Logged In' below",
    ],
    tips: ["X may ask for phone verification on new devices"],
  },
  youtube: {
    label: "YouTube (Google)",
    steps: [
      "Enter your Google email, click Next",
      "Enter your password, click Next",
      "Finish 2FA if prompted",
      "Wait for YouTube's home page to load",
      "Click 'I'm Logged In' below",
    ],
    tips: ["This signs you into all Google services on this browser"],
  },
  pinterest: {
    label: "Pinterest",
    steps: [
      "Enter your email",
      "Enter your password",
      "Click Log in",
      "Wait for the home feed to load",
      "Click 'I'm Logged In' below",
    ],
    tips: ["Pinterest rarely blocks clean accounts — this one is usually easy"],
  },
  snapchat: {
    label: "Snapchat",
    steps: [
      "Enter your username or email",
      "Enter your password",
      "Complete any verification",
      "Wait for the Snapchat web interface to load",
      "Click 'I'm Logged In' below",
    ],
    tips: ["Snapchat on web is limited — some features won't be available"],
  },
}

function instructionsFor(platform: string) {
  return PLATFORM_INSTRUCTIONS[platform.toLowerCase()] ||
    // Generic fallback for anything we haven't tuned yet
    {
      label: platform.charAt(0).toUpperCase() + platform.slice(1),
      steps: [
        "Enter your credentials",
        "Complete any 2FA / captcha / verification step",
        "Wait for the home feed or dashboard to load",
        "Click 'I'm Logged In' below",
      ],
      tips: ["Use the real account you want to run — brand-new accounts are flagged faster"],
    }
}

const VNC_LOAD_TIMEOUT_MS = 6000

interface PlatformLoginModalProps {
  open: boolean
  onClose: () => void
  /**
   * Platform slug to start on (e.g. "instagram"). The modal auto-navigates the
   * shared VPS Chrome to this platform's login URL when it opens.
   */
  initialPlatform: string
  /**
   * Remaining platforms the parent still wants the user to log into after the
   * initial one (e.g. ["facebook", "linkedin"]). After each successful "I'm
   * Logged In" the modal offers a one-click "Next: log into X" button so the
   * user never has to close + re-open the dialog for additional platforms.
   */
  remainingPlatforms?: string[]
  /**
   * Called after any successful login-status refresh (whether or not every
   * platform is green). Lets the parent refetch its health data so the red
   * banner / counters disappear.
   */
  onComplete?: (state: { stillLoggedOut: string[] }) => void
  /**
   * Optional account_id — when provided, a future VPS "dump cookies" endpoint
   * will use it to associate captured cookies with the right Supabase row. If
   * the endpoint isn't available, we silently skip the snapshot write.
   */
  accountId?: string
}

export default function PlatformLoginModal({
  open, onClose, initialPlatform, remainingPlatforms = [],
  onComplete, accountId,
}: PlatformLoginModalProps) {
  const [currentPlatform, setCurrentPlatform] = useState(initialPlatform)
  const [navigating, setNavigating] = useState<string | null>(null)
  const [vncLoaded, setVncLoaded] = useState(false)
  const [vncTimedOut, setVncTimedOut] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [remaining, setRemaining] = useState<string[]>(remainingPlatforms)
  const [lastResult, setLastResult] = useState<"ok" | "still_logged_out" | null>(null)
  const hasNavigatedRef = useRef(false)
  const popoutOpenedRef = useRef(false)

  const info = useMemo(() => instructionsFor(currentPlatform), [currentPlatform])

  // Reset on open / new initial platform. We want a fresh slate every time
  // the modal is shown so the "step 1" guidance isn't stale from a prior
  // close.
  useEffect(() => {
    if (!open) return
    setCurrentPlatform(initialPlatform)
    setRemaining(remainingPlatforms)
    setVncLoaded(false)
    setVncTimedOut(false)
    setLastResult(null)
    hasNavigatedRef.current = false
    popoutOpenedRef.current = false
  }, [open, initialPlatform, remainingPlatforms])

  // Navigate VPS Chrome to the platform's login URL on first open. We
  // fire-and-forget — if the /goto endpoint is momentarily down the user can
  // still type the URL themselves inside the VNC window.
  const navigateTo = useCallback(async (platform: string) => {
    const url = PLATFORM_LOGIN_URLS[platform.toLowerCase()]
    if (!url) {
      toast.error(`No login URL configured for ${platform}`)
      return
    }
    setNavigating(platform)
    try {
      const res = await fetch("/api/platforms/goto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `goto failed (${res.status})`)
      }
      setCurrentPlatform(platform)
      toast.success(`Opened ${info.label} login`)
    } catch (e: any) {
      // Non-fatal — the iframe is still showing the VPS Chrome. Surface the
      // error so Dylan knows what happened but don't block the flow.
      toast.error(`Couldn't auto-open ${platform} — use the platform buttons or type the URL: ${e?.message || "unknown error"}`)
    } finally {
      setNavigating(null)
    }
  }, [info.label])

  // Auto-navigate once on open so the user lands on the right login page
  // without having to click anything first.
  useEffect(() => {
    if (!open || hasNavigatedRef.current) return
    hasNavigatedRef.current = true
    navigateTo(initialPlatform).catch(() => {})
  }, [open, initialPlatform, navigateTo])

  // VNC iframe load timeout — same pattern as RecordingModal. If the iframe
  // doesn't fire onLoad within 6s (x-frame-options: DENY silently kills
  // onLoad), fall back to the "Pop Out Browser" button so the user can still
  // complete the login.
  useEffect(() => {
    if (!open) return
    if (vncLoaded || vncTimedOut) return
    if (!VNC_EMBED_URL) {
      // No password env — skip straight to pop-out fallback.
      setVncTimedOut(true)
      return
    }
    const t = setTimeout(() => {
      if (!vncLoaded) setVncTimedOut(true)
    }, VNC_LOAD_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [open, vncLoaded, vncTimedOut])

  async function confirmLogin() {
    setVerifying(true)
    setLastResult(null)
    try {
      // Re-probe login status across the common platforms so the dashboard
      // banners flip from red to green without a manual refresh.
      const probe = await fetch(
        `/api/platforms/login-status?refresh=1&platforms=${encodeURIComponent(
          ["instagram", "facebook", "linkedin", "tiktok"].join(",")
        )}`
      )
      const data = await probe.json().catch(() => ({} as any))
      const results: Array<{ platform: string; loggedIn: boolean }> = Array.isArray(data?.results)
        ? data.results
        : []
      const thisPlatform = results.find(r => r.platform === currentPlatform.toLowerCase())
      const stillLoggedOut = results.filter(r => r.loggedIn === false).map(r => r.platform)

      // Optional: attempt to persist cookies for this account. The VPS doesn't
      // expose a cookie-dump endpoint yet, so this silently no-ops on 404 —
      // we'll flip it on the instant Dylan ships the /cookies/dump route.
      if (accountId) {
        try {
          const dump = await fetch(`/api/platforms/cookies-dump?platform=${encodeURIComponent(currentPlatform)}`)
          if (dump.ok) {
            const dumpBody = await dump.json()
            const cookies = dumpBody?.cookies
            if (Array.isArray(cookies) && cookies.length > 0) {
              await fetch(`/api/accounts/${encodeURIComponent(accountId)}/cookies/snapshot`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  cookies,
                  local_storage: dumpBody?.localStorage || null,
                  captured_by: "platform_login_modal",
                }),
              }).catch(() => {})
            }
          }
        } catch {
          // VPS cookie-dump endpoint not deployed yet — ignore silently.
        }
      }

      if (thisPlatform?.loggedIn) {
        setLastResult("ok")
        toast.success(`${info.label} is now logged in!`)
      } else {
        setLastResult("still_logged_out")
        toast.error(
          `${info.label} still looks logged out. If you're actually logged in, wait a few seconds and click 'Recheck'.`
        )
      }

      onComplete?.({ stillLoggedOut })

      // Advance to the next platform the caller queued up, if any. We prefer
      // platforms that are still logged out per the fresh probe.
      const nextFromRemaining = remaining.find(p => p.toLowerCase() !== currentPlatform.toLowerCase())
      const nextFromProbe = stillLoggedOut.find(
        p => p.toLowerCase() !== currentPlatform.toLowerCase()
      )
      const next = nextFromRemaining || nextFromProbe
      if (thisPlatform?.loggedIn && next) {
        // Jump to the next one without closing the modal.
        setRemaining(r => r.filter(p => p.toLowerCase() !== next.toLowerCase()))
        navigateTo(next).catch(() => {})
      } else if (thisPlatform?.loggedIn) {
        // All done — close after a short victory moment.
        setTimeout(() => onClose(), 900)
      }
    } catch (e: any) {
      toast.error(e?.message || "Couldn't verify login status")
    } finally {
      setVerifying(false)
    }
  }

  function handleClose() {
    setVncLoaded(false)
    setVncTimedOut(false)
    setLastResult(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-6xl h-[88vh] p-0 overflow-hidden bg-card/95 backdrop-blur-xl">
        {/* Screen-reader title + description — visually hidden because the
            left-side header already shows the same info in the main layout.
            Without these Radix warns and some assistive tech skips the modal. */}
        <DialogTitle className="sr-only">Log into {info.label}</DialogTitle>
        <DialogDescription className="sr-only">
          Guided login flow for {info.label}. Follow the numbered steps on the
          left. The shared browser opens on the right — sign in there, then
          click &quot;I&apos;m Logged In&quot; when your feed shows.
        </DialogDescription>
        <div className="flex h-full">
          {/* ───────────── Left: instructions side panel ───────────── */}
          <div className="w-[340px] shrink-0 border-r border-border/30 bg-gradient-to-b from-card to-muted/20 flex flex-col">
            <div className="p-5 border-b border-border/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                  <LogIn className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <h2 className="font-bold text-lg">Log into {info.label}</h2>
                  <p className="text-xs text-muted-foreground">
                    Shared browser — logins stick across every platform
                  </p>
                </div>
              </div>
              <Badge className="capitalize text-sm px-3 py-1">
                {info.label}
              </Badge>
              {(() => {
                const others = remaining.filter(
                  p => p.toLowerCase() !== currentPlatform.toLowerCase()
                )
                return others.length > 0 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    After this: {others.join(", ")}
                  </p>
                ) : null
              })()}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentPlatform}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-5"
                >
                  <div>
                    <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-emerald-400" />
                      Login Steps
                    </h3>
                    <ol className="space-y-2.5">
                      {info.steps.map((s, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-xs">
                          <span className="h-5 w-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-muted-foreground leading-relaxed">{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {info.tips.length > 0 && (
                    <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3">
                      <h4 className="text-xs font-semibold text-blue-400 mb-2">Tips</h4>
                      <ul className="space-y-1">
                        {info.tips.map((t, i) => (
                          <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                            <ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-blue-400" />
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              <div className="space-y-2 pt-2 border-t border-border/30">
                <Button
                  onClick={confirmLogin}
                  disabled={verifying || !!navigating}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl shadow-lg"
                >
                  {verifying ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Checking...</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 mr-2" /> I&apos;m Logged In</>
                  )}
                </Button>
                {lastResult === "still_logged_out" && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-[11px] text-amber-200 flex items-start gap-2">
                    <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      Still showing logged out. Sometimes {info.label} needs a
                      second — finish any popups then click again.
                    </span>
                  </div>
                )}
                {lastResult === "ok" && remaining.length === 0 && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-[11px] text-emerald-300 flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>All set — closing this window in a moment.</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ───────────── Right: VNC iframe ───────────── */}
          <div className="flex-1 relative bg-black/90 flex flex-col">
            {/* Platform switcher — jumps the shared VPS Chrome between socials
                without killing the session. Hitting any of these navigates the
                SAME browser, so cookies from one platform carry over to the
                next (e.g. staying logged into Google across IG/FB/LI). */}
            <div className="shrink-0 border-b border-border/40 bg-card/70 backdrop-blur px-3 py-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground mr-1">Jump to:</span>
              <button
                onClick={() => navigateTo("instagram")}
                disabled={!!navigating || verifying}
                title="Navigate this browser to Instagram login"
                className={cn(
                  "p-1.5 rounded-md transition-all disabled:opacity-40",
                  currentPlatform === "instagram" ? "bg-pink-500/20 ring-1 ring-pink-500/40" : "hover:bg-pink-500/20"
                )}
              >
                <Instagram className="h-4 w-4 text-pink-400" />
              </button>
              <button
                onClick={() => navigateTo("facebook")}
                disabled={!!navigating || verifying}
                title="Navigate this browser to Facebook login"
                className={cn(
                  "p-1.5 rounded-md transition-all disabled:opacity-40",
                  currentPlatform === "facebook" ? "bg-blue-500/20 ring-1 ring-blue-500/40" : "hover:bg-blue-500/20"
                )}
              >
                <Facebook className="h-4 w-4 text-blue-400" />
              </button>
              <button
                onClick={() => navigateTo("linkedin")}
                disabled={!!navigating || verifying}
                title="Navigate this browser to LinkedIn login"
                className={cn(
                  "p-1.5 rounded-md transition-all disabled:opacity-40",
                  currentPlatform === "linkedin" ? "bg-sky-500/20 ring-1 ring-sky-500/40" : "hover:bg-sky-500/20"
                )}
              >
                <Linkedin className="h-4 w-4 text-sky-400" />
              </button>
              <button
                onClick={() => navigateTo("tiktok")}
                disabled={!!navigating || verifying}
                title="Navigate this browser to TikTok login"
                className="p-1.5 rounded-md hover:bg-muted/40 transition-all disabled:opacity-40"
              >
                <Globe className="h-4 w-4 text-muted-foreground" />
              </button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigateTo(currentPlatform)}
                disabled={!!navigating || verifying}
                className="ml-2 rounded-lg h-7 text-xs"
              >
                <RefreshCw className={cn("h-3 w-3 mr-1", navigating && "animate-spin")} />
                Reload login page
              </Button>
              <a
                href={VNC_EMBED_URL || VNC_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                title="Open the browser in a separate window — helpful on slow connections"
              >
                <ExternalLink className="h-3 w-3" /> Pop Out
              </a>
            </div>

            <div className="relative flex-1">
              {VNC_EMBED_URL && !vncTimedOut ? (
                <>
                  {!vncLoaded && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
                      <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
                      <p className="text-sm text-muted-foreground">Loading browser view...</p>
                      <p className="text-[11px] text-muted-foreground/80 max-w-sm text-center">
                        Waiting for {info.label} to load. If this hangs for more
                        than a few seconds, click Pop Out Browser.
                      </p>
                    </div>
                  )}
                  <iframe
                    src={VNC_EMBED_URL}
                    className="w-full h-full border-0"
                    onLoad={() => setVncLoaded(true)}
                    allow="clipboard-read; clipboard-write"
                  />
                </>
              ) : (
                (() => {
                  // Iframe blocked or no password env — auto-pop-out on first render
                  // so the user doesn't have to click through to see anything.
                  if (typeof window !== "undefined" && !popoutOpenedRef.current && VNC_EMBED_URL) {
                    popoutOpenedRef.current = true
                    try {
                      window.open(VNC_EMBED_URL, "outreach-vnc-login", "width=1400,height=900")
                    } catch {}
                  }
                  return (
                    <div className="h-full flex items-center justify-center p-8">
                      <div className="text-center space-y-4 max-w-sm">
                        <Monitor className="h-12 w-12 text-muted-foreground mx-auto" />
                        <h3 className="text-lg font-semibold">Your browser is in a new window</h3>
                        <p className="text-sm text-muted-foreground">
                          Finish the {info.label} login there, then come back
                          here and click &quot;I&apos;m Logged In&quot;.
                        </p>
                        <motion.a
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          href={VNC_EMBED_URL || VNC_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-semibold transition-colors"
                        >
                          <ExternalLink className="h-5 w-5" />
                          Open Browser Window
                        </motion.a>
                        <p className="text-xs text-muted-foreground">
                          Then come back to this screen and use the steps on the left <ArrowRight className="inline h-3 w-3" />
                        </p>
                      </div>
                    </div>
                  )
                })()
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
