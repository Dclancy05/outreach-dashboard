"use client"

/**
 * Onboarding Wizard — plain-English, big buttons, no jargon. The goal is to
 * take a non-technical user from "I made this dashboard and have no idea what
 * to do" to "I have one social account logged in and I know where to click
 * next." Six screens, one per step. Progress + Enter/Esc keyboard nav.
 */

import { useEffect, useMemo, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  ArrowRight, ArrowLeft, CheckCircle2, Globe, Users, Rocket,
  Loader2, Sparkles, MapPin, Shield,
  ListChecks, Mail, Send, BookOpen, Instagram, Facebook, Linkedin,
} from "lucide-react"

interface ProxyGroup {
  id: string
  provider?: string
  name?: string
  location_city?: string
  location_country?: string
  status?: string
  ip?: string
  health_check_at?: string | null
  is_dummy?: boolean
}

interface AccountSlot {
  account_id: string
  platform: string
  username?: string
  display_name?: string
  status?: string
  has_auth_cookie?: boolean
  has_saved_session?: boolean
}

const STEPS = ["Welcome", "Pick Location", "Pick Account", "Open Browser", "Confirm Login", "What's Next"] as const
const LS_KEY = "onboarding_completed_at"

export default function GetStartedPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [proxyGroups, setProxyGroups] = useState<ProxyGroup[]>([])
  const [accounts, setAccounts] = useState<AccountSlot[]>([])
  const [selectedProxy, setSelectedProxy] = useState<ProxyGroup | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<AccountSlot | null>(null)
  const [platformFilter, setPlatformFilter] = useState<string>("all")
  const [loading, setLoading] = useState(false)
  const [vncSession, setVncSession] = useState<{ id: string; url: string } | null>(null)
  const [savingSession, setSavingSession] = useState(false)
  const [checklist, setChecklist] = useState<Record<number, boolean>>({})

  const total = STEPS.length
  const pct = Math.round(((step + 1) / total) * 100)

  // Fetch proxies on mount
  useEffect(() => {
    fetch("/api/proxy-groups")
      .then((r) => r.json())
      .then((d) => {
        const list: ProxyGroup[] = (d?.data || d?.proxy_groups || d || []).filter(
          (p: ProxyGroup) => !p.is_dummy
        )
        setProxyGroups(list)
        // Auto-select healthiest as recommendation
        if (list.length && !selectedProxy) {
          const active = list.find((p) => p.status === "active") || list[0]
          setSelectedProxy(active)
        }
      })
      .catch(() => {})
  }, [])

  // Fetch accounts when step is 3 (Pick Account) or when proxy selected
  useEffect(() => {
    if (step < 2) return
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => {
        const list: AccountSlot[] = d?.data || d?.accounts || []
        setAccounts(list)
      })
      .catch(() => {})
  }, [step])

  const next = useCallback(() => setStep((s) => Math.min(s + 1, total - 1)), [total])
  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === "INPUT") return
      if (e.key === "Enter") next()
      if (e.key === "Escape") back()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [next, back])

  const filteredAccounts = useMemo(() => {
    if (platformFilter === "all") return accounts
    return accounts.filter((a) => a.platform === platformFilter)
  }, [accounts, platformFilter])

  async function launchBrowser() {
    if (!selectedProxy || !selectedAccount) {
      toast.error("Pick a location and an account first")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/vnc/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proxy_group_id: selectedProxy.id,
          platform: selectedAccount.platform,
          account_id: selectedAccount.account_id,
          use_chrome_profile: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Could not open the browser")

      const VNC_WS_HOST =
        process.env.NEXT_PUBLIC_VNC_WS_HOST || "srv1197943.taild42583.ts.net"
      const pwd = data?.data?.vncPassword
        ? `&password=${encodeURIComponent(data.data.vncPassword)}`
        : ""
      const url = `https://${VNC_WS_HOST}/novnc/vnc_lite.html?path=websockify/${data.data.id}&autoconnect=true&resize=scale${pwd}`
      setVncSession({ id: data.data.id, url })
    } catch (e: any) {
      toast.error(e?.message || "Failed")
    } finally {
      setLoading(false)
    }
  }

  async function confirmLoggedIn() {
    if (!vncSession || !selectedAccount) {
      toast.error("No session yet")
      return
    }
    setSavingSession(true)
    try {
      // Ask VNC manager for fresh cookies — via the dashboard's server-side
      // proxy so the API key stays on the server. Middleware enforces the
      // admin/va session cookie before forwarding to the VNC Manager.
      const capture = await fetch(
        `/api/vnc/session/${vncSession.id}/capture`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            account_id: selectedAccount.account_id,
            platform: selectedAccount.platform,
            username: selectedAccount.username || selectedAccount.account_id,
          }),
        }
      )
      const capData = await capture.json().catch(() => ({}))
      const cookies = capData?.data?.cookies || capData?.cookies || []

      if (!Array.isArray(cookies) || cookies.length === 0) {
        toast.error("No cookies captured. Make sure the feed is loaded in the browser before clicking confirm.")
        setSavingSession(false)
        return
      }

      // Write snapshot via the new dashboard API
      const snap = await fetch(
        `/api/accounts/${encodeURIComponent(selectedAccount.account_id)}/cookies/snapshot`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cookies,
            local_storage: capData?.data?.localStorage || null,
            session_id: vncSession.id,
            captured_by: "user_login",
            platform: selectedAccount.platform,
          }),
        }
      )
      const snapData = await snap.json()
      if (!snap.ok) throw new Error(snapData?.error || "Could not save")

      // Bust the recording-service login-status cache for THIS platform only —
      // single-platform on purpose (the multi-platform refresh was the 2026-05-02
      // Chrome-rotation incident). The probe is now cookie-based and silent, so
      // this is a sub-second cookie read, not a Chrome navigation.
      if (selectedAccount.platform) {
        await fetch(
          `/api/platforms/login-status?refresh=1&platforms=${encodeURIComponent(
            selectedAccount.platform
          )}`,
          { cache: "no-store" }
        ).catch(() => {})
      }

      // Mark onboarding complete locally + optionally in Supabase
      localStorage.setItem(LS_KEY, new Date().toISOString())
      fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: 5, completed: true }),
      }).catch(() => {})

      toast.success(`Session saved. ${cookies.length} cookies pinned.`)
      next()
    } catch (e: any) {
      toast.error(e?.message || "Failed")
    } finally {
      setSavingSession(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-3xl">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Step {step + 1} of {total}</span>
            <span>{STEPS[step]}</span>
          </div>
          <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl p-6 sm:p-10 shadow-2xl">
          {/* Step 0 — Welcome */}
          {step === 0 && (
            <div className="space-y-6 text-center">
              <div className="text-6xl">👋</div>
              <h1 className="text-3xl sm:text-4xl font-bold">Let&apos;s get you set up</h1>
              <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
                This takes about 5 minutes. We&apos;ll pick a location, open a safe browser,
                log you into one account, and then show you where to send messages.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-4 max-w-2xl mx-auto">
                <StepPill icon={MapPin} label="Pick a Location" />
                <StepPill icon={Globe} label="Open Browser" />
                <StepPill icon={Shield} label="Log In Once" />
                <StepPill icon={Rocket} label="Start Sending" />
              </div>
              <Button size="lg" onClick={next} className="mt-4 rounded-xl px-8">
                Let&apos;s go <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {/* Step 1 — Pick Location */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
                <MapPin className="h-7 w-7 text-purple-400" /> Pick a location
              </h2>
              <p className="text-sm text-muted-foreground">
                This is where your browser will look like it&apos;s coming from. Pick one close
                to where the account was made. We&apos;ve suggested the healthiest one.
              </p>
              {proxyGroups.length === 0 ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
                  No proxies added yet.{" "}
                  <Link href="/accounts" className="underline">Add one first.</Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
                  {proxyGroups.map((p) => {
                    const selected = selectedProxy?.id === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProxy(p)}
                        className={cn(
                          "rounded-xl border p-4 text-left transition-all hover:shadow-md",
                          selected
                            ? "border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/40"
                            : "border-border/40 bg-card/40 hover:border-purple-500/40"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold flex items-center gap-2">
                              <FlagEmoji country={p.location_country} />{" "}
                              {p.location_city || p.name || "Unknown"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {p.location_country || ""} · {p.provider || "Proxy"}
                            </div>
                          </div>
                          {selected && <CheckCircle2 className="h-5 w-5 text-purple-400" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              <WizardNav
                onBack={back}
                onNext={next}
                canNext={!!selectedProxy}
                nextLabel="Continue"
              />
            </div>
          )}

          {/* Step 2 — Pick Account */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
                <Users className="h-7 w-7 text-blue-400" /> Pick an account
              </h2>
              <p className="text-sm text-muted-foreground">
                This is the social account you want to log into. Don&apos;t worry about
                the others, you can add them later.
              </p>
              <div className="flex flex-wrap gap-2">
                {["all", "instagram", "facebook", "linkedin"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(p)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium border transition-all",
                      platformFilter === p
                        ? "border-purple-500 bg-purple-500/20 text-purple-200"
                        : "border-border/40 text-muted-foreground hover:border-purple-500/40"
                    )}
                  >
                    {p === "all" ? "All" : p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
              <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
                {filteredAccounts.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No accounts yet. Add one on the Accounts page.
                  </div>
                ) : (
                  filteredAccounts.map((a) => {
                    const selected = selectedAccount?.account_id === a.account_id
                    return (
                      <button
                        key={a.account_id}
                        onClick={() => setSelectedAccount(a)}
                        className={cn(
                          "w-full rounded-xl border p-3 text-left transition-all flex items-center gap-3",
                          selected
                            ? "border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/40"
                            : "border-border/40 bg-card/40 hover:border-blue-500/40"
                        )}
                      >
                        <PlatformIcon platform={a.platform} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">
                            @{a.username || a.display_name || a.account_id}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {a.platform} · {a.status || "ready"}
                          </div>
                        </div>
                        {selected && <CheckCircle2 className="h-5 w-5 text-blue-400" />}
                      </button>
                    )
                  })
                )}
              </div>
              <WizardNav onBack={back} onNext={next} canNext={!!selectedAccount} nextLabel="Continue" />
            </div>
          )}

          {/* Step 3 — Open Browser */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
                <Globe className="h-7 w-7 text-emerald-400" /> Open the browser
              </h2>
              <p className="text-sm text-muted-foreground">
                We&apos;ll open a safe browser that looks like a real person from{" "}
                <strong>{selectedProxy?.location_city || "your chosen location"}</strong>.
              </p>

              {!vncSession ? (
                <div className="text-center py-6">
                  <Button
                    size="lg"
                    onClick={launchBrowser}
                    disabled={loading}
                    className="rounded-xl px-8 bg-gradient-to-r from-emerald-600 to-teal-600"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Globe className="h-4 w-4 mr-2" />
                    )}
                    Open Secure Browser
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4">
                  <div className="rounded-xl border border-border/50 bg-black/90 overflow-hidden aspect-video">
                    <iframe
                      src={vncSession.url}
                      className="w-full h-full border-0"
                      allow="clipboard-read; clipboard-write"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Checklist</div>
                    {[
                      "Log in with your username and password",
                      "If asked for a code, check email or SMS and enter it",
                      "Wait until you see the home feed",
                      "Click \"I'm logged in\" below",
                    ].map((txt, i) => (
                      <label key={i} className="flex items-start gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!checklist[i]}
                          onChange={(e) => setChecklist({ ...checklist, [i]: e.target.checked })}
                          className="mt-0.5 accent-purple-500"
                        />
                        <span className={cn(checklist[i] && "line-through text-muted-foreground")}>
                          Step {i + 1}: {txt}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <WizardNav
                onBack={back}
                onNext={next}
                canNext={!!vncSession}
                nextLabel="I'm logged in"
              />
            </div>
          )}

          {/* Step 4 — Confirm Login (save session) */}
          {step === 4 && (
            <div className="space-y-5 text-center">
              <div className="text-5xl">🎉</div>
              <h2 className="text-2xl sm:text-3xl font-bold">Great work</h2>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                We&apos;re saving your session now. This means you won&apos;t have to log in
                again for a long time.
              </p>
              <div className="flex flex-col items-center gap-3 pt-3">
                {savingSession ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving session...
                  </div>
                ) : (
                  <Button
                    size="lg"
                    onClick={confirmLoggedIn}
                    className="rounded-xl px-8 bg-gradient-to-r from-purple-600 to-blue-600"
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Save my session
                  </Button>
                )}
              </div>
              <WizardNav onBack={back} onNext={next} canNext={false} hideNext />
            </div>
          )}

          {/* Step 5 — What's Next */}
          {step === 5 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="text-5xl">🚀</div>
                <h2 className="text-2xl sm:text-3xl font-bold">You&apos;re all set</h2>
                <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                  Pick your next move. You can always come back here from the sidebar.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <NextCard
                  icon={ListChecks}
                  title="Find leads"
                  desc="Scrape targeted leads from the web"
                  href="/leads"
                  color="from-blue-500 to-cyan-500"
                />
                <NextCard
                  icon={Mail}
                  title="Build a sequence"
                  desc="Write a message flow that sends itself"
                  href="/sequences"
                  color="from-purple-500 to-pink-500"
                />
                <NextCard
                  icon={Send}
                  title="Start sending"
                  desc="Send a batch now — manual or auto"
                  href="/pipeline"
                  color="from-emerald-500 to-teal-500"
                />
              </div>
              <div className="flex justify-center gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => router.push("/dashboard")}
                  className="rounded-xl"
                >
                  <BookOpen className="h-4 w-4 mr-1" /> Save for later
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// -------- tiny reusables --------

function StepPill({ icon: Icon, label }: { icon: typeof ArrowRight; label: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3 flex flex-col items-center gap-1.5">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <span className="text-[11px] font-medium text-muted-foreground text-center">{label}</span>
    </div>
  )
}

function WizardNav({
  onBack,
  onNext,
  canNext,
  nextLabel = "Continue",
  hideNext,
}: {
  onBack: () => void
  onNext: () => void
  canNext: boolean
  nextLabel?: string
  hideNext?: boolean
}) {
  return (
    <div className="flex justify-between pt-4">
      <Button variant="ghost" onClick={onBack} className="rounded-xl">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>
      {!hideNext && (
        <Button
          onClick={onNext}
          disabled={!canNext}
          className="rounded-xl bg-gradient-to-r from-purple-600 to-blue-600"
        >
          {nextLabel} <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      )}
    </div>
  )
}

function PlatformIcon({ platform }: { platform: string }) {
  const lower = platform.toLowerCase()
  if (lower === "instagram")
    return <Instagram className="h-5 w-5 text-pink-400 shrink-0" />
  if (lower === "facebook") return <Facebook className="h-5 w-5 text-blue-400 shrink-0" />
  if (lower === "linkedin")
    return <Linkedin className="h-5 w-5 text-sky-400 shrink-0" />
  return <Sparkles className="h-5 w-5 text-muted-foreground shrink-0" />
}

function FlagEmoji({ country }: { country?: string }) {
  const c = (country || "").toUpperCase()
  const map: Record<string, string> = {
    US: "🇺🇸",
    CA: "🇨🇦",
    GB: "🇬🇧",
    UK: "🇬🇧",
    AU: "🇦🇺",
    DE: "🇩🇪",
    FR: "🇫🇷",
  }
  return <span>{map[c] || "🌐"}</span>
}

function NextCard({
  icon: Icon,
  title,
  desc,
  href,
  color,
}: {
  icon: typeof ArrowRight
  title: string
  desc: string
  href: string
  color: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border/40 bg-card/40 p-5 flex flex-col gap-2 hover:shadow-lg hover:border-transparent transition-all relative overflow-hidden"
    >
      <div
        className={cn(
          "absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-gradient-to-br",
          color
        )}
      />
      <Icon className="h-6 w-6 text-muted-foreground group-hover:text-foreground" />
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </Link>
  )
}
