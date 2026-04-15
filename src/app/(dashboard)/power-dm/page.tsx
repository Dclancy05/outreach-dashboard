"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { SetupBanner } from "@/components/setup-banner"

// GoLogin profile ID mapping
const GOLOGIN_PROFILES: Record<string, string> = {
  "acct_ig_jo.neseric60": "69a4a3dd4172109758da71d1",
  "acct_ig_l.eegary43": "69a4a3f0e8ed6d21d1dab88f",
  "acct_ig_ramosrya.ne8": "69a4a3f2c7235af0af2fe4d4",
  "acct_ig_j.ohnsonsteven86": "69a4a3f37c294c30f827cced",
  "acct_ig_m.artindorothyg0": "69a4a3f4d5d68dd11e5ac885",
  "acct_ig_davisale.xander9": "69a4a3f582c5099a461fe193",
  "acct_ig_wilso.nkathleen01": "69a4a3f6efb0fd4a2fe9a91c",
  "acct_ig_alvarez.john9": "69a4a3f84172109758da9160",
  "acct_ig_bake.rlaura5": "69a4a3f94172109758da9422",
  "acct_ig_mil.lerlinda43": "69a4a3fad5d68dd11e5acb76",
  "acct_fb_MaryannGeorgia29": "69a4a3fb2c59fa363a4d1777",
  "acct_fb_WhitneyShelley18": "69a4a3fc82c5099a461fe7b6",
  "acct_fb_MargieCandice70": "69a4a3fe82c5099a461fe90e",
  "acct_fb_GwenPatsy47": "69a4a3ff3d9ce0afe7c2edeb",
  "acct_fb_AlbertaAngie48": "69a4a4003cf3ea5b9af1a206",
  "acct_fb_FayeInez76": "69a4a4012c59fa363a4d1bd8",
  "acct_fb_MaryannKayla54": "69a4a4024172109758da98ac",
  "acct_fb_BrandyBecky51": "69a4a404c7235af0af2ff50f",
  "acct_fb_MelindaCarole99": "69a4a40582c5099a461ff2aa",
  "acct_fb_MarianneSandy07": "69a4a4064172109758da9b67",
  "acct_li_leone-bautista-2942b53a9": "69a4a407a2495392a2acc16a",
  "acct_li_sherilyn-poulin-88b9973a8": "69a4a4082c59fa363a4d2379",
  "acct_li_averil-dodson-9b02ba3a9": "69a4a40a82c5099a461ff641",
  "acct_li_michelle-hidalgo-ba89903a8": "69a4a40b4172109758da9d52",
  "acct_li_gina-dougherty-36b0543a9": "69a4a40c2c59fa363a4d2895",
  "acct_li_viole-diaz-3960483a9": "69a4a40da998b00580d026f0",
  "acct_li_celina-cleary-a282b63a9": "69a4a40e2c59fa363a4d2b28",
  "acct_li_andee-kelly-2033033a9": "69a4a40f82c5099a461ffc0f",
  "acct_li_evita-pippin-69b9963a8": "69a4a4117c294c30f827f648",
  "acct_li_halley-lucas-92505b3a9": "69a4a4124172109758daa4b5",
}

const PLATFORM_URLS: Record<string, string> = {
  instagram: "https://www.instagram.com",
  facebook: "https://www.facebook.com",
  linkedin: "https://www.linkedin.com",
}

interface DMTask {
  id: string
  account_id: string
  instructions: string
  status: string
  parsed?: {
    platform: string
    lead_name: string
    lead_url: string
    message: string
    day: number
    warmup_batch?: boolean
    business_type?: string
    city?: string
  }
}

interface SessionState {
  currentIndex: number
  stats: { sent: number; skipped: number; failed: number }
  timer: number
  startedAt: number
  queueIds: string[]
}

const SESSION_KEY = "power_dm_session"

function saveSession(state: SessionState) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(state)) } catch {}
}

function loadSession(): SessionState | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SessionState
  } catch { return null }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY) } catch {}
}

function getPlatformFromAccountId(accountId: string): string {
  if (accountId.startsWith("acct_ig_")) return "instagram"
  if (accountId.startsWith("acct_fb_")) return "facebook"
  if (accountId.startsWith("acct_li_")) return "linkedin"
  return "unknown"
}

function formatAccountName(accountId: string): string {
  const platform = getPlatformFromAccountId(accountId)
  const label = platform === "instagram" ? "IG" : platform === "facebook" ? "FB" : platform === "linkedin" ? "LI" : "DM"
  // Strip prefix like acct_ig_, acct_fb_, acct_li_
  const name = accountId.replace(/^acct_(ig|fb|li)_/, "")
  return `${name} (${label})`
}

function getPlatformIcon(platform: string) {
  switch (platform) {
    case "instagram": return "📸"
    case "facebook": return "📘"
    case "linkedin": return "💼"
    default: return "💬"
  }
}

function getPlatformLabel(platform: string) {
  switch (platform) {
    case "instagram": return "IG"
    case "facebook": return "FB"
    case "linkedin": return "LI"
    default: return "DM"
  }
}

function getPlatformColor(platform: string) {
  switch (platform) {
    case "instagram": return "from-pink-500 to-purple-500"
    case "facebook": return "from-blue-500 to-blue-600"
    case "linkedin": return "from-blue-600 to-cyan-500"
    default: return "from-gray-500 to-gray-600"
  }
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function parseTextInstructions(text: string, accountId: string): DMTask["parsed"] {
  const platform = getPlatformFromAccountId(accountId)
  const nameMatch = text.match(/Send (?:DM|message) to ([^(on)\n]+?)(?:\s+on\s+\w+)?[:\n]/i)
  const urlMatch = text.match(/(https?:\/\/[^\s]+)/i)
  const msgMatch = text.match(/(?:Message|DM|Text)[:\s]*\n?([\s\S]+)/i)
  const message = msgMatch?.[1]?.trim() || (text.length > 0 && !nameMatch ? text : "")
  
  return {
    platform,
    lead_name: nameMatch?.[1]?.trim() || "Unknown Lead",
    lead_url: urlMatch?.[1] || "",
    message: message || text,
    day: 1,
  }
}

function isMessageEmpty(message: string | undefined): boolean {
  if (!message) return true
  const trimmed = message.trim()
  if (!trimmed || trimmed === "No message") return true
  return false
}

export default function PowerDMPage() {
  const [queue, setQueue] = useState<DMTask[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [mode, setMode] = useState<"overview" | "active" | "complete" | "resume">("overview")
  const [currentIndex, setCurrentIndex] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null)
  const [timer, setTimer] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [stats, setStats] = useState({ sent: 0, skipped: 0, failed: 0 })
  const [savedSession, setSavedSession] = useState<SessionState | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const fetchQueue = useCallback(async () => {
    setFetchError(null)
    try {
      const res = await fetch("/api/power-dm?action=get_queue")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const tasks = (json.data || []).map((t: DMTask) => {
        let parsed: DMTask["parsed"]
        try {
          const j = JSON.parse(t.instructions)
          if (j && (j.platform || j.lead_name || j.message)) {
            parsed = j
          } else {
            parsed = parseTextInstructions(t.instructions, t.account_id)
          }
        } catch {
          parsed = parseTextInstructions(t.instructions, t.account_id)
        }
        return { ...t, parsed }
      })
      setQueue(tasks)
      return tasks
    } catch (e) {
      console.error("Failed to fetch queue:", e)
      setFetchError("Failed to load DM queue. Check your connection and try again.")
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  // Load queue and check for saved session
  useEffect(() => {
    fetchQueue().then((tasks: DMTask[]) => {
      const session = loadSession()
      if (session && tasks.length > 0) {
        // Check if session is still valid (queue IDs overlap)
        const currentIds = new Set(tasks.map(t => t.id))
        const remaining = session.queueIds.filter(id => currentIds.has(id))
        const done = session.stats.sent + session.stats.skipped + session.stats.failed
        if (remaining.length > 0 && done > 0 && done < session.queueIds.length) {
          setSavedSession(session)
          setMode("resume")
        }
      }
    })
  }, [fetchQueue])

  useEffect(() => {
    if (mode === "active") {
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [mode])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2000)
      return () => clearTimeout(t)
    }
  }, [toast])

  const showToast = (msg: string) => setToast(msg)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    showToast("✅ Copied!")
  }

  const persistSession = useCallback((index: number, s: typeof stats, t: number) => {
    saveSession({
      currentIndex: index,
      stats: s,
      timer: t,
      startedAt: Date.now(),
      queueIds: queue.map(q => q.id),
    })
  }, [queue])

  const handleAction = async (action: "sent" | "skipped" | "failed" | "account_issue") => {
    const task = queue[currentIndex]
    if (!task) return

    const statusMap = { sent: "completed", skipped: "skipped", failed: "failed", account_issue: "account_issue" }

    await fetch("/api/power-dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_task", task_id: task.id, status: statusMap[action] }),
    })

    if (action === "sent") {
      await fetch("/api/power-dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "log_dm",
          lead_id: task.id,
          account_id: task.account_id,
          platform: task.parsed?.platform || getPlatformFromAccountId(task.account_id),
          message: task.parsed?.message || "",
          status: "sent",
        }),
      })
    }

    const newStats = {
      sent: action === "sent" ? stats.sent + 1 : stats.sent,
      skipped: action === "skipped" ? stats.skipped + 1 : stats.skipped,
      failed: (action === "failed" || action === "account_issue") ? stats.failed + 1 : stats.failed,
    }
    setStats(newStats)

    const nextIndex = currentIndex + 1
    if (nextIndex >= queue.length) {
      setMode("complete")
      clearSession()
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }

    // Persist session after every action
    persistSession(nextIndex, newStats, timer)

    const nextTask = queue[nextIndex]
    if (nextTask.account_id !== task.account_id) {
      setSwitchingAccount(nextTask.account_id)
      setTimeout(() => {
        setSwitchingAccount(null)
        setTransitioning(true)
        setTimeout(() => {
          setCurrentIndex(nextIndex)
          setTransitioning(false)
        }, 300)
      }, 1500)
    } else {
      setTransitioning(true)
      setTimeout(() => {
        setCurrentIndex(nextIndex)
        setTransitioning(false)
      }, 300)
    }
  }

  const startSession = () => {
    setMode("active")
    setCurrentIndex(0)
    setTimer(0)
    setStats({ sent: 0, skipped: 0, failed: 0 })
    clearSession()
    persistSession(0, { sent: 0, skipped: 0, failed: 0 }, 0)
  }

  const resumeSession = () => {
    if (!savedSession) return
    // The queue from DB already excludes completed tasks, so index 0 is the right start
    // But we restore stats and timer
    setStats(savedSession.stats)
    setTimer(savedSession.timer)
    setCurrentIndex(0) // Queue is already filtered to pending only
    setMode("active")
    setSavedSession(null)
  }

  const startFresh = () => {
    clearSession()
    setSavedSession(null)
    startSession()
  }

  // Group queue by platform for overview
  const platformGroups = queue.reduce((acc, task) => {
    const p = task.parsed?.platform || getPlatformFromAccountId(task.account_id)
    if (!acc[p]) acc[p] = { count: 0, accounts: new Set<string>() }
    acc[p].count++
    acc[p].accounts.add(task.account_id)
    return acc
  }, {} as Record<string, { count: number; accounts: Set<string> }>)

  const currentTask = queue[currentIndex]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent" />
      </div>
    )
  }

  // ---------- FETCH ERROR ----------
  if (fetchError) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-5xl">❌</div>
          <h2 className="text-xl font-semibold">Failed to Load Queue</h2>
          <p className="text-muted-foreground">{fetchError}</p>
          <button
            onClick={() => { setLoading(true); fetchQueue() }}
            className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
          >
            🔄 Retry
          </button>
        </div>
      </div>
    )
  }

  // ---------- RESUME SESSION PROMPT ----------
  if (mode === "resume" && savedSession) {
    const done = savedSession.stats.sent + savedSession.stats.skipped + savedSession.stats.failed
    const total = savedSession.queueIds.length
    return (
      <div className="max-w-lg mx-auto py-20 px-4 animate-[fadeIn_0.3s_ease-out]">
        <style jsx>{`
          @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
        <div className="bg-card border border-amber-500/30 rounded-2xl p-8 text-center space-y-6">
          <div className="text-5xl">⏸️</div>
          <h2 className="text-2xl font-bold">Resume Session?</h2>
          <p className="text-muted-foreground">
            You have an unfinished session ({done}/{total} DMs done).
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
              <div className="text-lg font-bold text-green-400">{savedSession.stats.sent}</div>
              <div className="text-xs text-muted-foreground">Sent</div>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <div className="text-lg font-bold text-yellow-400">{savedSession.stats.skipped}</div>
              <div className="text-xs text-muted-foreground">Skipped</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <div className="text-lg font-bold text-red-400">{savedSession.stats.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={resumeSession}
              className="flex-1 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
            >
              ▶️ Resume Session
            </button>
            <button
              onClick={startFresh}
              className="flex-1 px-6 py-3 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-medium transition-colors"
            >
              🔄 Start Fresh
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---------- COMPLETION SCREEN ----------
  if (mode === "complete") {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center space-y-6 animate-[fadeIn_0.5s_ease-out]">
          <div className="text-6xl">🎉</div>
          <h1 className="text-3xl font-bold">All DMs Complete!</h1>
          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <div className="text-2xl font-bold text-green-400">{stats.sent}</div>
              <div className="text-xs text-muted-foreground">Sent</div>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
              <div className="text-2xl font-bold text-yellow-400">{stats.skipped}</div>
              <div className="text-xs text-muted-foreground">Skipped</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <div className="text-2xl font-bold text-red-400">{stats.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </div>
          <div className="text-muted-foreground">Session time: {formatTime(timer)}</div>
          <button
            onClick={() => { setMode("overview"); fetchQueue() }}
            className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
          >
            Back to Overview
          </button>
        </div>
      </div>
    )
  }

  // ---------- OVERVIEW SCREEN ----------
  if (mode === "overview") {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 animate-[fadeIn_0.3s_ease-out]">
        <style jsx>{`
          @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.3); } 50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.6); } }
        `}</style>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">⚡ Power DM</h1>
          <p className="text-muted-foreground">Your DM queue for today</p>
        </div>

        {queue.length === 0 ? (
          <div className="space-y-6">
            <SetupBanner
              storageKey="power-dm"
              title="Power DM needs a few things to work"
              persistent
              steps={[
                { id: "campaign", label: "Create a campaign to generate DM tasks", complete: false, href: "/campaigns", linkLabel: "Go to Campaigns" },
                { id: "gologin", label: "Connect GoLogin profiles in Settings", complete: Object.keys(GOLOGIN_PROFILES).length > 0, href: "/settings", linkLabel: "Go to Settings" },
              ]}
            />
            <div className="text-center py-16">
              <div className="text-5xl mb-4">📭</div>
              <h2 className="text-xl font-semibold mb-2">Your DM Queue is Empty</h2>
              <p className="text-muted-foreground mb-4">Create a campaign first to generate DM tasks for your VAs.</p>
              <Link href="/campaigns">
                <button className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors">
                  Go to Campaigns →
                </button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Platform breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              {Object.entries(platformGroups).map(([platform, info]) => (
                <div key={platform} className="bg-card border rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{getPlatformIcon(platform)}</span>
                    <div>
                      <div className="font-semibold">{getPlatformLabel(platform)}</div>
                      <div className="text-xs text-muted-foreground">{info.count} DMs</div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {info.accounts.size} account{info.accounts.size !== 1 ? "s" : ""}
                  </div>
                </div>
              ))}
            </div>

            {/* Total count */}
            <div className="text-center mb-8">
              <span className="text-5xl font-bold bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
                {queue.length}
              </span>
              <p className="text-muted-foreground mt-1">DMs ready to send</p>
            </div>

            {/* Start button */}
            <div className="flex justify-center">
              <button
                onClick={startSession}
                className="px-10 py-5 rounded-2xl text-xl font-bold text-white bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 transition-all duration-300 transform hover:scale-105"
                style={{ animation: "pulse-glow 2s ease-in-out infinite" }}
              >
                ⚡ Start Power DM
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  // ---------- ACTIVE DM MODE ----------
  const platform = currentTask?.parsed?.platform || getPlatformFromAccountId(currentTask?.account_id || "")
  const profileId = GOLOGIN_PROFILES[currentTask?.account_id || ""]
  const progress = ((currentIndex + 1) / queue.length) * 100
  const messageEmpty = isMessageEmpty(currentTask?.parsed?.message)

  if (switchingAccount) {
    return (
      <div className="flex items-center justify-center h-[80vh] animate-[fadeIn_0.3s_ease-out]">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent mx-auto" />
          <div className="text-lg font-medium">Switching to</div>
          <div className="text-xl font-bold text-violet-400">{formatAccountName(switchingAccount)}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col animate-[fadeIn_0.3s_ease-out]">
      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(-40px); } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-card border rounded-lg px-4 py-2 shadow-lg animate-[fadeIn_0.2s_ease-out]">
          {toast}
        </div>
      )}

      {/* Control Bar */}
      <div className="shrink-0 border-b bg-card/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              DM <span className="text-white font-bold">{currentIndex + 1}</span> of {queue.length}
            </span>
            <span className="text-xs text-muted-foreground">
              ✅{stats.sent} ⏭️{stats.skipped} ❌{stats.failed}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${getPlatformColor(platform)} text-white`}>
              {getPlatformIcon(platform)} {formatAccountName(currentTask?.account_id || "")}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>⏱</span>
            <span className="font-mono">{formatTime(timer)}</span>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-0.5 bg-secondary">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div
          className="max-w-2xl mx-auto"
          style={{ animation: transitioning ? "slideOut 0.3s ease-out" : "slideIn 0.3s ease-out" }}
        >
          {/* Lead Card */}
          <div className="bg-card border rounded-2xl p-6 md:p-8 mb-6">
            {/* Lead info */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-1">{currentTask?.parsed?.lead_name || "Unknown Lead"}</h2>
              <p className="text-sm text-muted-foreground">
                {currentTask?.parsed?.business_type && <span>{currentTask.parsed.business_type}</span>}
                {currentTask?.parsed?.city && <span> · {currentTask.parsed.city}</span>}
                {currentTask?.parsed?.day && <span> · Day {currentTask.parsed.day}</span>}
              </p>
            </div>

            {/* Profile URL */}
            {currentTask?.parsed?.lead_url && (
              <div className="flex items-center gap-2 mb-6 p-3 rounded-lg bg-secondary/50">
                <span className="text-sm text-muted-foreground truncate flex-1">{currentTask.parsed.lead_url}</span>
                <button
                  onClick={() => copyToClipboard(currentTask.parsed?.lead_url || "")}
                  className="shrink-0 px-3 py-1 text-xs bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
                >
                  Copy
                </button>
              </div>
            )}

            {/* Message bubble OR empty message warning */}
            {messageEmpty ? (
              <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center space-y-3">
                <div className="text-3xl">⚠️</div>
                <p className="text-sm font-medium text-amber-300">No message generated for this lead yet</p>
                <p className="text-xs text-muted-foreground">This task doesn&apos;t have a message. Generate one from the Campaigns page first.</p>
                <Link href="/campaigns">
                  <button className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors">
                    Generate Message →
                  </button>
                </Link>
              </div>
            ) : (
              <div className="relative mb-6">
                <div className="bg-gradient-to-br from-violet-500/10 to-pink-500/10 border border-violet-500/20 rounded-2xl rounded-tl-sm p-5">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{currentTask?.parsed?.message}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(currentTask?.parsed?.message || "")}
                  className="absolute top-3 right-3 px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
                >
                  📋 Copy Message
                </button>
              </div>
            )}

            {/* Action buttons */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => handleAction("sent")}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-medium transition-all hover:scale-[1.02]"
              >
                ✅ Sent
              </button>
              <button
                onClick={() => handleAction("skipped")}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white font-medium transition-all hover:scale-[1.02]"
              >
                ⏭️ Skip
              </button>
              <button
                onClick={() => handleAction("failed")}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition-all hover:scale-[1.02]"
              >
                ❌ Can&apos;t Send
              </button>
              <button
                onClick={() => handleAction("account_issue")}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-medium transition-all hover:scale-[1.02]"
              >
                ⚠️ Acct Issue
              </button>
            </div>
          </div>

          {/* GoLogin section - prominent error when missing */}
          {profileId ? (
            <div className="bg-card/50 border border-dashed border-muted-foreground/20 rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">🌐</div>
              <p className="text-muted-foreground mb-4">Browser opens here via GoLogin</p>
              <a
                href={`https://app.gologin.com/browser/${profileId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-medium transition-all hover:scale-105"
              >
                🚀 Open {getPlatformLabel(platform)} in GoLogin
              </a>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 space-y-4">
              <div className="flex items-center justify-center gap-3">
                <span className="text-3xl">⚠️</span>
                <h3 className="text-lg font-semibold text-amber-300">This account isn&apos;t connected to GoLogin yet</h3>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                The account <span className="font-medium text-foreground">{formatAccountName(currentTask?.account_id || "")}</span> doesn&apos;t have a GoLogin profile mapped.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href="/account-setup">
                  <button className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors">
                    Set Up GoLogin →
                  </button>
                </Link>
                <span className="text-xs text-muted-foreground">or</span>
                <a
                  href={PLATFORM_URLS[platform] || "https://www.instagram.com"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-medium transition-colors text-sm"
                >
                  Open {platform.charAt(0).toUpperCase() + platform.slice(1)} manually ↗
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
