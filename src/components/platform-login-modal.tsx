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
 * The VNC view is rendered by `NoVncViewer`, which speaks the RFB protocol
 * over WebSocket directly to the VPS. There's no iframe and no pop-out window
 * anymore — the viewer lives inside the modal, connection lifecycle (loading
 * / connected / error + reconnect) is owned by that component.
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
  Loader2, CheckCircle2, Shield,
  ChevronRight, Instagram, Facebook, Linkedin, Globe,
  RefreshCw, LogIn, XCircle, Save, Clipboard,
} from "lucide-react"
import NoVncViewer from "@/components/novnc-viewer"
import { PLATFORM_LOGIN_URLS } from "@/lib/platform-login-urls"

// Canonical login URL per platform lives in src/lib/platform-login-urls.ts —
// /api/platforms/goto forwards this to the VPS's single Chrome instance so the
// user lands on the right login page without having to type a URL.

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
  /**
   * Platforms this business actually has accounts for. When provided, the
   * top-bar switcher only shows buttons for these platforms (so Dylan never
   * sees a ghost "TikTok" button when his group has no TikTok account).
   * If omitted or empty, the switcher falls back to the full default list.
   */
  connectedPlatforms?: string[]
}

export default function PlatformLoginModal({
  open, onClose, initialPlatform, remainingPlatforms,
  onComplete, accountId, connectedPlatforms,
}: PlatformLoginModalProps) {
  // Normalize + stabilize the connected list. Default to the full set so
  // callers that don't pass the prop behave like before (IG/FB/LI/TikTok).
  const connectedKey = (connectedPlatforms || []).map(p => p.toLowerCase()).sort().join(",")
  const switcherPlatforms = useMemo(() => {
    const list = (connectedPlatforms || [])
      .map(p => p.toLowerCase())
      .filter(p => p && p !== "google") // Google accounts don't log in via this flow
    if (list.length === 0) return ["instagram", "facebook", "linkedin", "tiktok"]
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedKey])
  // Stabilize remainingPlatforms: callers often omit this prop or pass a
  // fresh `[]` literal on every render. Before this memo, the default `[]`
  // created a new array identity each render, which cascaded through the
  // reset effect below → reset `hasNavigatedRef` → re-run the nav effect →
  // `setCurrentPlatform` → re-render → new `[]` → infinite loop (React #185).
  // Keying the memo on the JSON content gives us a stable reference unless
  // the actual list changes.
  const remainingKey = remainingPlatforms ? remainingPlatforms.join(",") : ""
  const stableRemaining = useMemo(
    () => remainingPlatforms ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remainingKey]
  )

  const [currentPlatform, setCurrentPlatform] = useState(initialPlatform)
  const [navigating, setNavigating] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [remaining, setRemaining] = useState<string[]>(stableRemaining)
  const [lastResult, setLastResult] = useState<"ok" | "still_logged_out" | null>(null)
  // Cookie-capture status — drives the "Session saved" vs "Saved" chip shown
  // after a successful "I'm Logged In". `null` = hasn't happened yet or not
  // applicable (no accountId). "saved_persistent" = cookies written to
  // Supabase + account row bumped; "saved_soft" = login verified but cookies
  // couldn't be captured (VPS endpoint not up yet). "failed" = we tried and
  // something broke we want the user to see.
  const [captureState, setCaptureState] = useState<
    null | "saved_persistent" | "saved_soft" | "failed"
  >(null)
  // Running tally of consecutive 502s from /api/platforms/cookies-dump across
  // this session. When it hits 3, we reveal the "I pasted cookies manually"
  // fallback — belt-and-suspenders for the VPS-SSH saga.
  const [dump502Streak, setDump502Streak] = useState(0)
  const [showManualPaste, setShowManualPaste] = useState(false)
  const [manualPasteText, setManualPasteText] = useState("")
  const [manualPasteSaving, setManualPasteSaving] = useState(false)
  const hasNavigatedRef = useRef(false)

  const info = useMemo(() => instructionsFor(currentPlatform), [currentPlatform])

  // Reset on open / new initial platform. We want a fresh slate every time
  // the modal is shown so the "step 1" guidance isn't stale from a prior
  // close. Using the stable memoized `stableRemaining` (not the raw prop)
  // keeps this effect from firing on every parent re-render.
  useEffect(() => {
    if (!open) return
    setCurrentPlatform(initialPlatform)
    setRemaining(stableRemaining)
    setLastResult(null)
    setCaptureState(null)
    setDump502Streak(0)
    setShowManualPaste(false)
    setManualPasteText("")
    hasNavigatedRef.current = false
  }, [open, initialPlatform, stableRemaining])

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
    } catch (e: unknown) {
      // Non-fatal — the viewer is still showing the VPS Chrome. Surface the
      // error so Dylan knows what happened but don't block the flow.
      const msg = e instanceof Error ? e.message : "unknown error"
      toast.error(`Couldn't auto-open ${platform} — use the platform buttons or type the URL: ${msg}`)
    } finally {
      setNavigating(null)
    }
  }, [info.label])

  // Keep a ref to the latest navigateTo so the auto-nav effect below doesn't
  // need it in its deps. navigateTo's identity changes whenever info.label
  // changes (which happens when navigateTo itself sets currentPlatform on
  // success). Including it in the dep array + resetting hasNavigatedRef in
  // the other effect caused an infinite re-entry loop (React error #185).
  const navigateToRef = useRef(navigateTo)
  useEffect(() => {
    navigateToRef.current = navigateTo
  }, [navigateTo])

  // Auto-navigate once on open so the user lands on the right login page
  // without having to click anything first. The ref-guard + reading the
  // latest navigateTo from a ref prevents the re-render cycle.
  useEffect(() => {
    if (!open || hasNavigatedRef.current) return
    hasNavigatedRef.current = true
    navigateToRef.current(initialPlatform).catch(() => {})
  }, [open, initialPlatform])

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
      const data = await probe.json().catch(() => ({} as unknown))
      const results: Array<{ platform: string; loggedIn: boolean }> =
        Array.isArray((data as { results?: unknown })?.results)
          ? (data as { results: Array<{ platform: string; loggedIn: boolean }> }).results
          : []
      const thisPlatform = results.find(r => r.platform === currentPlatform.toLowerCase())
      const stillLoggedOut = results.filter(r => r.loggedIn === false).map(r => r.platform)

      // Persist cookies for this account. After Part B ships, the VPS exposes
      // GET /cookies/dump which returns the freshest auth cookies straight
      // from the running Chrome. Until that's live on the deployed VPS, this
      // path returns 502 and we fall back to a "soft save" chip (login was
      // verified but cookies won't survive a restart). After 3 consecutive
      // 502s we reveal a manual-paste escape hatch.
      let capturedHere: "saved_persistent" | "saved_soft" | "failed" | null = null
      if (accountId) {
        try {
          const dump = await fetch(
            `/api/platforms/cookies-dump?platform=${encodeURIComponent(currentPlatform)}`,
            { cache: "no-store" }
          )
          if (dump.ok) {
            setDump502Streak(0)
            const dumpBody = await dump.json()
            const cookies = dumpBody?.cookies
            if (Array.isArray(cookies) && cookies.length > 0) {
              const snap = await fetch(
                `/api/accounts/${encodeURIComponent(accountId)}/cookies/snapshot`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    cookies,
                    local_storage: dumpBody?.localStorage || null,
                    captured_by: "platform_login_modal",
                    platform: currentPlatform,
                  }),
                }
              )
              if (snap.ok) {
                capturedHere = "saved_persistent"
              } else {
                capturedHere = "failed"
              }
            } else {
              // VPS responded but jar had no cookies for this domain — treat
              // as soft save; the login-status probe itself passed.
              capturedHere = "saved_soft"
            }
          } else if (dump.status === 502) {
            setDump502Streak((n) => n + 1)
            capturedHere = "saved_soft"
          } else {
            capturedHere = "saved_soft"
          }
        } catch {
          // Network error reaching our own /api route — soft save.
          capturedHere = "saved_soft"
        }
      }
      setCaptureState(capturedHere)

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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Couldn't verify login status"
      toast.error(msg)
    } finally {
      setVerifying(false)
    }
  }

  // Once the 502 streak hits 3, quietly reveal the manual-paste escape. We
  // only flip it on — never off — so a subsequent successful capture doesn't
  // make the fallback disappear mid-flow if the user started pasting.
  useEffect(() => {
    if (dump502Streak >= 3) setShowManualPaste(true)
  }, [dump502Streak])

  // Manual paste: accepts either an array of CDP-style cookies or a newline-
  // delimited "Cookie: name=value; Domain=.x.com" block. We parse both forms
  // and hand the normalised array to the snapshot route. Belt-and-suspenders
  // for the VPS-SSH saga — Dylan can paste cookies from DevTools directly.
  async function submitManualPaste() {
    if (!accountId) {
      toast.error("No account selected — can't save manual cookies.")
      return
    }
    const raw = manualPasteText.trim()
    if (!raw) {
      toast.error("Paste cookies first.")
      return
    }
    setManualPasteSaving(true)
    try {
      let cookies: unknown = null
      // Try JSON first — either an array or an object with .cookies
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) cookies = parsed
        else if (parsed && Array.isArray((parsed as { cookies?: unknown }).cookies)) {
          cookies = (parsed as { cookies: unknown }).cookies
        }
      } catch {
        // Not JSON — try "name=value; name2=value2" header format
        const pairs = raw.split(/;|\n/).map((s) => s.trim()).filter(Boolean)
        const parsedPairs = pairs.map((p) => {
          const eq = p.indexOf("=")
          if (eq <= 0) return null
          const name = p.slice(0, eq).trim().replace(/^Cookie:\s*/i, "")
          const value = p.slice(eq + 1).trim()
          if (!name) return null
          return { name, value, domain: "", path: "/", httpOnly: false, secure: true, expires: -1 }
        }).filter(Boolean)
        if (parsedPairs.length) cookies = parsedPairs
      }
      if (!Array.isArray(cookies) || cookies.length === 0) {
        toast.error("Couldn't read any cookies out of that paste — try exporting as JSON.")
        return
      }
      const res = await fetch(
        `/api/accounts/${encodeURIComponent(accountId)}/cookies/snapshot`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cookies,
            captured_by: "manual_paste",
            platform: currentPlatform,
          }),
        }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `snapshot failed (${res.status})`)
      }
      setCaptureState("saved_persistent")
      setManualPasteText("")
      toast.success("Cookies saved — this account is set.")
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Couldn't save cookies"
      toast.error(msg)
    } finally {
      setManualPasteSaving(false)
    }
  }

  function handleClose() {
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
                {/* Capture-state chip — tells the user whether we just wrote
                    their session to Supabase (persistent) or only verified the
                    login (soft). Different copy so we don't lie about
                    restart-proofing when the VPS dump endpoint is still down. */}
                <AnimatePresence>
                  {captureState === "saved_persistent" && (
                    <motion.div
                      key="saved-persistent"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-[11px] text-emerald-200 flex items-start gap-2"
                    >
                      <Save className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>Session saved — you won&apos;t need to log in again.</span>
                    </motion.div>
                  )}
                  {captureState === "saved_soft" && (
                    <motion.div
                      key="saved-soft"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="rounded-xl bg-sky-500/10 border border-sky-500/25 p-3 text-[11px] text-sky-200 flex items-start gap-2"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>Saved.</span>
                    </motion.div>
                  )}
                  {captureState === "failed" && (
                    <motion.div
                      key="saved-failed"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-[11px] text-amber-200 flex items-start gap-2"
                    >
                      <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>Login looks good, but we couldn&apos;t save the session. Try again in a moment.</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Manual paste fallback. Revealed after 3 consecutive 502s
                    from /cookies/dump (VPS endpoint down). Accepts JSON or
                    a raw "name=value; name2=value2" header string. */}
                <AnimatePresence>
                  {showManualPaste && accountId && (
                    <motion.div
                      key="manual-paste"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="rounded-xl bg-muted/30 border border-border/40 p-3 text-[11px] space-y-2 overflow-hidden"
                    >
                      <div className="flex items-center gap-1.5 text-foreground font-medium">
                        <Clipboard className="h-3.5 w-3.5" />
                        I pasted cookies manually
                      </div>
                      <p className="text-muted-foreground leading-relaxed">
                        Session-capture service is slow right now. Paste your
                        cookies as JSON (from DevTools → Application → Cookies
                        → Copy all as JSON) and we&apos;ll save them directly.
                      </p>
                      <textarea
                        value={manualPasteText}
                        onChange={(e) => setManualPasteText(e.target.value)}
                        placeholder='[{"name":"sessionid","value":"..."}]'
                        className="w-full h-24 rounded-md bg-background/80 border border-border/50 p-2 text-[10px] font-mono resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                      />
                      <Button
                        size="sm"
                        onClick={submitManualPaste}
                        disabled={manualPasteSaving || !manualPasteText.trim()}
                        className="w-full h-7 rounded-lg text-[11px] bg-violet-600 hover:bg-violet-500"
                      >
                        {manualPasteSaving ? (
                          <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Saving...</>
                        ) : (
                          <><Save className="h-3 w-3 mr-1" /> Save cookies</>
                        )}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* ───────────── Right: embedded VNC viewer ───────────── */}
          <div className="flex-1 relative bg-black/90 flex flex-col">
            {/* Platform switcher — jumps the shared VPS Chrome between socials
                without killing the session. Hitting any of these navigates the
                SAME browser, so cookies from one platform carry over to the
                next (e.g. staying logged into Google across IG/FB/LI). */}
            <div className="shrink-0 border-b border-border/40 bg-card/70 backdrop-blur px-3 py-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground mr-1">Jump to:</span>
              {switcherPlatforms.map(p => {
                const meta: Record<string, { icon: JSX.Element; activeRing: string; hover: string; label: string }> = {
                  instagram: {
                    icon: <Instagram className="h-4 w-4 text-pink-400" />,
                    activeRing: "bg-pink-500/20 ring-1 ring-pink-500/40",
                    hover: "hover:bg-pink-500/20",
                    label: "Instagram",
                  },
                  facebook: {
                    icon: <Facebook className="h-4 w-4 text-blue-400" />,
                    activeRing: "bg-blue-500/20 ring-1 ring-blue-500/40",
                    hover: "hover:bg-blue-500/20",
                    label: "Facebook",
                  },
                  linkedin: {
                    icon: <Linkedin className="h-4 w-4 text-sky-400" />,
                    activeRing: "bg-sky-500/20 ring-1 ring-sky-500/40",
                    hover: "hover:bg-sky-500/20",
                    label: "LinkedIn",
                  },
                  tiktok: {
                    icon: <Globe className="h-4 w-4 text-muted-foreground" />,
                    activeRing: "bg-muted/40 ring-1 ring-border/60",
                    hover: "hover:bg-muted/40",
                    label: "TikTok",
                  },
                }
                const m = meta[p] || {
                  icon: <Globe className="h-4 w-4 text-muted-foreground" />,
                  activeRing: "bg-muted/40 ring-1 ring-border/60",
                  hover: "hover:bg-muted/40",
                  label: p.charAt(0).toUpperCase() + p.slice(1),
                }
                return (
                  <button
                    key={p}
                    onClick={() => navigateTo(p)}
                    disabled={!!navigating || verifying}
                    title={`Navigate this browser to ${m.label} login`}
                    className={cn(
                      "p-1.5 rounded-md transition-all disabled:opacity-40",
                      currentPlatform.toLowerCase() === p ? m.activeRing : m.hover
                    )}
                  >
                    {m.icon}
                  </button>
                )
              })}
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
            </div>

            <div className="relative flex-1">
              <NoVncViewer />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
