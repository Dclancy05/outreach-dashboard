"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import useSWR from "swr"
import { dashboardApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  LogOut,
  User,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Keyboard,
  X,
} from "lucide-react"

interface OutreachAccount {
  account_id: string
  username: string
  password: string
  email: string
  email_password: string
  status: string
  daily_limit: number
  sends_today: number
  warmup_day: number
}

interface QueueLead {
  lead_id: string
  name: string
  instagram_url: string
  city: string
  state: string
  business_type: string
  _raw_scrape_data: string
  total_score: number
}

const STATUS_COLORS: Record<string, { dot: string; bg: string; label: string }> = {
  active: { dot: "bg-green-500", bg: "bg-green-500/10 border-green-500/30", label: "Active" },
  warming: { dot: "bg-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/30", label: "Warming" },
  paused: { dot: "bg-red-500", bg: "bg-red-500/10 border-red-500/30", label: "Paused" },
  cooldown: { dot: "bg-orange-500", bg: "bg-orange-500/10 border-orange-500/30", label: "Cooldown" },
  logged_out: { dot: "bg-gray-500", bg: "bg-gray-500/10 border-gray-500/30", label: "Logged Out" },
  banned: { dot: "bg-red-800", bg: "bg-red-800/10 border-red-800/30", label: "Banned" },
}

const PROBLEMS = ["Profile not found", "Already messaged", "Business closed", "Account flagged"]
const RESPONSE_CATEGORIES = ["Interested", "Not Interested", "Asked Question", "Wrong Person", "Already Has Service"]

function extractIGUsername(url: string): string {
  if (!url) return ""
  if (!url.includes("/")) return url.replace(/^@/, "")
  try {
    return new URL(url).pathname.replace(/\/$/, "").split("/").filter(Boolean).pop() || url
  } catch {
    return url.replace(/.*instagram\.com\//, "").replace(/[\/?].*/, "") || url
  }
}

function getIGData(lead: QueueLead) {
  try {
    const raw = JSON.parse(lead._raw_scrape_data || "{}")
    const ig = raw.instagram || raw
    return { followers: ig.ig_followers || ig.followers || null, bio: ig.ig_bio || ig.biography || null }
  } catch { return { followers: null, bio: null } }
}

function getStatusInfo(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.active
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`
}

export default function VAWorkspacePage() {
  const [currentLeadIndex, setCurrentLeadIndex] = useState(0)
  const [currentAccountIndex, setCurrentAccountIndex] = useState(0)
  const [messageCopied, setMessageCopied] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [loggedOutModal, setLoggedOutModal] = useState(false)
  const [responseModal, setResponseModal] = useState(false)
  const [problemModal, setProblemModal] = useState(false)
  const [responseCategory, setResponseCategory] = useState("")
  const [responseNotes, setResponseNotes] = useState("")
  const [processing, setProcessing] = useState(false)
  const [vaSession, setVaSession] = useState<{ session_id: string; va_name: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [sessionStart] = useState(Date.now())
  const [sessionTimer, setSessionTimer] = useState(0)
  const [sessionSent, setSessionSent] = useState(0)
  const [sessionSkipped, setSessionSkipped] = useState(0)
  const [sessionResponses, setSessionResponses] = useState(0)
  const [showLogoutSummary, setShowLogoutSummary] = useState(false)

  // Session timer
  useEffect(() => {
    const interval = setInterval(() => setSessionTimer(Math.floor((Date.now() - sessionStart) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [sessionStart])

  useEffect(() => {
    const stored = localStorage.getItem("va_session")
    if (stored) setVaSession(JSON.parse(stored))
  }, [])

  const { data: accounts, mutate: mutateAccounts } = useSWR<OutreachAccount[]>("oa_va", () => dashboardApi("get_outreach_accounts"), { refreshInterval: 30000 })
  const { data: leads, mutate: mutateLeads } = useSWR<QueueLead[]>("vq_leads", () => dashboardApi("get_va_queue", { limit: 100 }), { refreshInterval: 60000 })
  const { data: stats, mutate: mutateStats } = useSWR("vq_stats", () => dashboardApi("get_va_stats"), { refreshInterval: 15000 })
  const { data: settings } = useSWR("vq_settings", () => dashboardApi("get_settings"))

  const allAccounts = accounts || []
  const activeAccounts = useMemo(() => allAccounts.filter(a => a.status === "active" && a.sends_today < a.daily_limit), [allAccounts])

  const allAccountsMaxed = useMemo(() => {
    return allAccounts.length > 0 && allAccounts.filter(a => a.status === "active").every(a => a.sends_today >= a.daily_limit)
  }, [allAccounts])

  const currentAccount = activeAccounts[currentAccountIndex % Math.max(activeAccounts.length, 1)]
  const currentLead = (leads || [])[currentLeadIndex]
  const igUsername = currentLead ? extractIGUsername(currentLead.instagram_url) : ""
  const igData = currentLead ? getIGData(currentLead) : { followers: null, bio: null }

  const messageTemplate = settings?.va_message_template || settings?.default_dm_template || "Hey {name}! I came across your page and love what you're doing. Would love to connect!"
  const message = currentLead ? messageTemplate.replace(/\{name\}/g, currentLead.name?.split(" ")[0] || "there").replace(/\{business\}/g, currentLead.name || "").replace(/\{city\}/g, currentLead.city || "") : ""

  const totalSent = stats?.total_sent || 0
  const totalLimit = stats?.total_limit || 0
  const progressPct = totalLimit > 0 ? Math.round((totalSent / totalLimit) * 100) : 0
  const goalHit = totalSent >= totalLimit && totalLimit > 0

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const copyToClipboard = useCallback(async (text: string, field: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    if (field === "message" || field === "ig-message") setMessageCopied(true)
    setTimeout(() => setCopiedField(null), 2000)
  }, [])

  const rotateToNextAccount = useCallback(() => {
    if (activeAccounts.length === 0) return
    let nextIdx = (currentAccountIndex + 1) % activeAccounts.length
    let checked = 0
    while (checked < activeAccounts.length) {
      const acct = activeAccounts[nextIdx]
      if (acct && acct.sends_today < acct.daily_limit) break
      nextIdx = (nextIdx + 1) % activeAccounts.length
      checked++
    }
    setCurrentAccountIndex(nextIdx)
  }, [activeAccounts, currentAccountIndex])

  const moveToNextLead = useCallback(() => {
    setCurrentLeadIndex(prev => prev + 1)
    setMessageCopied(false)
    setCopiedField(null)
    rotateToNextAccount()
  }, [rotateToNextAccount])

  const selectAccount = useCallback((idx: number) => {
    const acc = allAccounts[idx]
    if (!acc) return
    const activeIdx = activeAccounts.findIndex(a => a.account_id === acc.account_id)
    if (activeIdx >= 0) setCurrentAccountIndex(activeIdx)
  }, [allAccounts, activeAccounts])

  // Atomic: Mark Sent = log + rotate + advance
  const handleSent = useCallback(async () => {
    if (!currentLead || !currentAccount || processing || !messageCopied) return
    setProcessing(true)
    try {
      await dashboardApi("log_va_send", {
        lead_id: currentLead.lead_id,
        account_id: currentAccount.account_id,
        va_session_id: vaSession?.session_id || "",
        va_name: vaSession?.va_name || "",
        status: "sent",
      })
      setSessionSent(prev => prev + 1)
      showToast(`✓ Sent via @${currentAccount.username}`)
      mutateStats()
      mutateAccounts()
      moveToNextLead()
    } finally {
      setProcessing(false)
    }
  }, [currentLead, currentAccount, vaSession, processing, messageCopied, mutateStats, mutateAccounts, moveToNextLead, showToast])

  const handleSkip = useCallback(async () => {
    if (!currentLead || processing) return
    setProcessing(true)
    try {
      await dashboardApi("log_va_send", {
        lead_id: currentLead.lead_id,
        account_id: currentAccount?.account_id || "",
        va_session_id: vaSession?.session_id || "",
        status: "skipped",
      })
      setSessionSkipped(prev => prev + 1)
      moveToNextLead()
    } finally {
      setProcessing(false)
    }
  }, [currentLead, currentAccount, vaSession, processing, moveToNextLead])

  const handleProblem = useCallback(async (problem: string) => {
    if (!currentLead || processing) return
    setProcessing(true)
    try {
      await dashboardApi("log_va_problem", {
        lead_id: currentLead.lead_id,
        account_id: currentAccount?.account_id || "",
        va_session_id: vaSession?.session_id || "",
        va_name: vaSession?.va_name || "",
        problem,
      })
      setProblemModal(false)
      showToast(`Reported: ${problem}`)
      moveToNextLead()
    } finally {
      setProcessing(false)
    }
  }, [currentLead, currentAccount, vaSession, processing, moveToNextLead, showToast])

  const handleResponseCategory = useCallback(async (category: string) => {
    if (!currentLead || !currentAccount || processing) return
    setProcessing(true)
    try {
      await dashboardApi("log_va_response_category", {
        lead_id: currentLead.lead_id,
        account_id: currentAccount.account_id,
        va_session_id: vaSession?.session_id || "",
        va_name: vaSession?.va_name || "",
        category,
        notes: responseNotes,
      })
      setSessionResponses(prev => prev + 1)
      setResponseModal(false)
      setResponseCategory("")
      setResponseNotes("")
      showToast(`Response: ${category}`)
      moveToNextLead()
    } finally {
      setProcessing(false)
    }
  }, [currentLead, currentAccount, vaSession, responseNotes, processing, moveToNextLead, showToast])

  const handleWarning = useCallback(async () => {
    if (!currentAccount || processing) return
    setProcessing(true)
    try {
      await dashboardApi("report_warning", {
        account_id: currentAccount.account_id,
        lead_id: currentLead?.lead_id || "",
        va_session_id: vaSession?.session_id || "",
      })
      mutateAccounts()
      setMessageCopied(false)
      rotateToNextAccount()
    } finally {
      setProcessing(false)
    }
  }, [currentAccount, currentLead, vaSession, processing, mutateAccounts, rotateToNextAccount])

  const handleLoggedOut = useCallback(async () => {
    if (!currentAccount || processing) return
    setProcessing(true)
    try {
      await dashboardApi("report_logged_out", {
        account_id: currentAccount.account_id,
        lead_id: currentLead?.lead_id || "",
        va_session_id: vaSession?.session_id || "",
      })
      setLoggedOutModal(true)
      mutateAccounts()
    } finally {
      setProcessing(false)
    }
  }, [currentAccount, currentLead, vaSession, processing, mutateAccounts])

  const handleResumeAccount = useCallback(async () => {
    if (!currentAccount) return
    await dashboardApi("update_outreach_account", { account_id: currentAccount.account_id, status: "active" })
    setLoggedOutModal(false)
    mutateAccounts()
    rotateToNextAccount()
  }, [currentAccount, mutateAccounts, rotateToNextAccount])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (responseModal || loggedOutModal || problemModal || showLogoutSummary) return

      switch (e.key.toLowerCase()) {
        case "s":
        case "enter":
          e.preventDefault()
          handleSent()
          break
        case "k":
          e.preventDefault()
          handleSkip()
          break
        case "r":
          e.preventDefault()
          setResponseModal(true)
          break
        case "c":
          e.preventDefault()
          if (message) copyToClipboard(message, "message")
          break
        case "n":
          e.preventDefault()
          moveToNextLead()
          break
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [handleSent, handleSkip, message, copyToClipboard, moveToNextLead, responseModal, loggedOutModal, problemModal, showLogoutSummary])

  const handleLogout = () => {
    setShowLogoutSummary(true)
  }

  const confirmLogout = () => {
    localStorage.removeItem("va_session")
    window.location.href = "/va-login"
  }

  // Empty states
  if (allAccountsMaxed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <div className="text-4xl mb-4">🛑</div>
          <h2 className="text-xl font-bold mb-2">All Accounts at Limit — Done for Today!</h2>
          <p className="text-muted-foreground">All active accounts have reached their daily limit. Great work! 🎉</p>
          <div className="mt-4 p-3 bg-secondary/50 rounded-lg text-sm space-y-1">
            <p className="font-medium">Session Summary</p>
            <p>⏱ Time: {formatTimer(sessionTimer)}</p>
            <p>📤 {sessionSent} sent · ⏭ {sessionSkipped} skipped · 💬 {sessionResponses} responses</p>
          </div>
          <Button className="mt-4" onClick={() => mutateAccounts()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Check Again
          </Button>
        </Card>
      </div>
    )
  }

  if (!currentLead || activeAccounts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <div className="text-4xl mb-4">{!currentLead ? "🎉" : "⚠️"}</div>
          <h2 className="text-xl font-bold mb-2">{!currentLead ? "Queue Complete!" : "No Active Accounts"}</h2>
          <p className="text-muted-foreground">{!currentLead ? "You've sent all available leads. Great work!" : "All accounts are paused or at limit. Contact Dylan."}</p>
          <div className="mt-4 p-3 bg-secondary/50 rounded-lg text-sm space-y-1">
            <p>⏱ {formatTimer(sessionTimer)} · 📤 {sessionSent} sent · ⏭ {sessionSkipped} skipped</p>
          </div>
          <Button className="mt-4" onClick={() => { mutateLeads(); mutateAccounts() }}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {/* ===== TOP BAR ===== */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold">👋 {vaSession?.va_name || "VA"}</h1>
              <Badge variant="outline" className="text-xs">{totalSent}/{totalLimit} sent</Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> {formatTimer(sessionTimer)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { mutateLeads(); mutateAccounts(); mutateStats() }}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-secondary rounded-full h-1.5 mb-2">
            <div className={`h-1.5 rounded-full transition-all ${goalHit ? "bg-green-500" : "bg-gradient-to-r from-purple-500 to-pink-500"}`} style={{ width: `${Math.min(progressPct, 100)}%` }} />
          </div>
          {goalHit && <p className="text-xs text-green-400 text-center mb-1">🎊 Daily goal reached!</p>}

          {/* Account pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {allAccounts.map((acc, i) => {
              const info = getStatusInfo(acc.status)
              const isActive = currentAccount?.account_id === acc.account_id
              const atLimit = acc.sends_today >= acc.daily_limit
              const nearLimit = acc.sends_today >= acc.daily_limit * 0.8 && !atLimit
              return (
                <button
                  key={acc.account_id}
                  onClick={() => selectAccount(i)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-all shrink-0 ${
                    isActive
                      ? "bg-purple-500/20 border-purple-500/50 text-purple-300 ring-1 ring-purple-500/30"
                      : `${info.bg} text-muted-foreground hover:text-foreground`
                  } ${(acc.status !== "active" || atLimit) ? "opacity-50" : ""}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${info.dot}`} />
                  @{acc.username}
                  <span className="text-[10px] opacity-70">({acc.sends_today}/{acc.daily_limit})</span>
                  {nearLimit && <span className="text-yellow-400">⚠️</span>}
                  {atLimit && <span className="text-[10px] opacity-50">MAX</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full">
        {/* LEFT PANEL */}
        <div className="flex-1 p-3 lg:p-4 space-y-3 lg:max-w-xl lg:border-r border-border/30">
          {/* Lead Card */}
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-bold text-lg">{currentLead.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {currentLead.business_type}{currentLead.city ? ` · ${currentLead.city}` : ""}
                    {currentLead.state ? `, ${currentLead.state}` : ""}
                  </p>
                  {igData.followers && <p className="text-xs text-muted-foreground mt-0.5">{Number(igData.followers).toLocaleString()} followers</p>}
                </div>
                <div className="flex items-center gap-1">
                  {currentLead.total_score && <Badge variant="outline" className="text-[10px]">⭐{currentLead.total_score}</Badge>}
                  <Badge variant="outline" className="text-xs">#{currentLeadIndex + 1}</Badge>
                </div>
              </div>
              {igData.bio && <p className="text-xs text-muted-foreground mt-2 italic line-clamp-2">&quot;{igData.bio}&quot;</p>}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-pink-400 font-bold text-lg">@{igUsername}</span>
                <button
                  onClick={() => copyToClipboard(igUsername, "username")}
                  className={`p-1.5 rounded-md transition-colors ${copiedField === "username" ? "bg-green-500/20 text-green-400" : "bg-secondary hover:bg-secondary/80 text-muted-foreground"}`}
                >
                  {copiedField === "username" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Message Preview Card */}
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium flex items-center gap-2">
                  💬 Message
                  {messageCopied && <span className="text-green-400 text-xs">✓ Copied</span>}
                </span>
                <span className="text-xs text-muted-foreground">[C]</span>
              </div>
              <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/5 to-pink-500/5 border border-border/30">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message}</p>
              </div>
              <button
                onClick={() => copyToClipboard(message, "message")}
                className={`w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                  messageCopied
                    ? "bg-green-500/20 border-green-500/50 text-green-400"
                    : "bg-secondary border-border/50 hover:border-purple-500/30"
                }`}
              >
                {messageCopied ? <><Check className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy Message</>}
              </button>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              className={`h-14 text-base font-bold ${messageCopied ? "bg-green-600 hover:bg-green-700 text-white" : "bg-green-600/30 text-green-300 cursor-not-allowed"}`}
              onClick={handleSent}
              disabled={processing || !messageCopied}
            >
              ✅ SENT <span className="text-[10px] ml-1 opacity-60">[S]</span>
            </Button>
            <Button variant="outline" className="h-14 text-base font-bold" onClick={handleSkip} disabled={processing}>
              ⏭️ SKIP <span className="text-[10px] ml-1 opacity-60">[K]</span>
            </Button>
            <Button variant="outline" className="h-14 text-orange-400 border-orange-500/30" onClick={() => setProblemModal(true)} disabled={processing}>
              ❗ PROBLEM
            </Button>
            <Button variant="outline" className="h-14 text-blue-400 border-blue-500/30" onClick={() => setResponseModal(true)} disabled={processing}>
              💬 RESPONSE <span className="text-[10px] ml-1 opacity-60">[R]</span>
            </Button>
            <Button variant="outline" className="h-14 text-yellow-400 border-yellow-500/30" onClick={handleWarning} disabled={processing}>
              ⚠️ WARNING
            </Button>
            <Button variant="outline" className="h-14 text-gray-400 border-gray-500/30" onClick={handleLoggedOut} disabled={processing}>
              🔄 LOGGED OUT
            </Button>
          </div>

          {/* Shortcut hints */}
          <div className="text-center text-[10px] text-muted-foreground">
            S=Sent · K=Skip · R=Response · C=Copy · N=Next · Session: {sessionSent} sent, {sessionSkipped} skipped
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="lg:flex-1 p-3 lg:p-4 space-y-3 border-t lg:border-t-0 border-border/30">
          {/* Current Account Card */}
          {currentAccount && (
            <Card className="border-purple-500/30 bg-purple-500/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${getStatusInfo(currentAccount.status).dot}`} />
                    <h3 className="font-bold text-lg">@{currentAccount.username}</h3>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {currentAccount.sends_today}/{currentAccount.daily_limit} today
                  </Badge>
                </div>
                <div className="w-full bg-secondary rounded-full h-2 mb-3">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      currentAccount.sends_today >= currentAccount.daily_limit * 0.8
                        ? "bg-yellow-500"
                        : "bg-purple-500"
                    }`}
                    style={{ width: `${Math.min((currentAccount.sends_today / currentAccount.daily_limit) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Account {(currentAccountIndex % activeAccounts.length) + 1} of {activeAccounts.length} · Day {currentAccount.warmup_day}</span>
                  <span className="ml-auto flex gap-1">
                    <button onClick={() => setCurrentAccountIndex(prev => Math.max(prev - 1, 0))} className="p-0.5 hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /></button>
                    <button onClick={rotateToNextAccount} className="p-0.5 hover:text-foreground"><ChevronRight className="h-3.5 w-3.5" /></button>
                  </span>
                </div>

                {currentAccount.status === "logged_out" && (
                  <div className="space-y-1.5 bg-secondary/50 rounded-lg p-3 text-sm mt-3 border border-yellow-500/20">
                    <p className="text-yellow-400 text-xs font-semibold mb-2">⚠️ Account needs re-login</p>
                    {[
                      ["Username", currentAccount.username],
                      ["Password", currentAccount.password],
                      ["Email", currentAccount.email],
                      ["Email Pass", currentAccount.email_password],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between items-center">
                        <span className="text-muted-foreground text-xs">{label}</span>
                        <button onClick={() => copyToClipboard(val, `cred-${label}`)} className="font-mono text-xs flex items-center gap-1 hover:text-foreground">
                          {val} {copiedField === `cred-${label}` ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Instagram Quick Actions */}
          {igUsername && (
            <Card className="border-border/50">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Instagram Actions</h3>
                <button
                  onClick={() => copyToClipboard(igUsername, "ig-copy")}
                  className={`w-full flex items-center justify-center gap-3 px-4 py-4 rounded-xl text-lg font-bold transition-all ${
                    copiedField === "ig-copy"
                      ? "bg-green-500/20 border-2 border-green-500/50 text-green-400"
                      : "bg-secondary border-2 border-border/50 hover:border-pink-500/30 hover:bg-secondary/80 text-pink-400"
                  }`}
                >
                  {copiedField === "ig-copy" ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                  {copiedField === "ig-copy" ? "Copied!" : `Copy @${igUsername}`}
                </button>
                <a href={`https://www.instagram.com/${igUsername}/`} target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl text-base font-bold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white transition-all">
                  <User className="h-5 w-5" /> Open Profile <ExternalLink className="h-4 w-4 opacity-60" />
                </a>
                <a href={`https://ig.me/m/${igUsername}`} target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl text-base font-bold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white transition-all">
                  <MessageCircle className="h-5 w-5" /> Open DM <ExternalLink className="h-4 w-4 opacity-60" />
                </a>
                <button
                  onClick={() => copyToClipboard(message, "ig-message")}
                  className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
                    copiedField === "ig-message"
                      ? "bg-green-500/20 border-green-500/50 text-green-400"
                      : "bg-secondary/50 border-border/50 hover:border-purple-500/30 text-foreground"
                  }`}
                >
                  {copiedField === "ig-message" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedField === "ig-message" ? "Message Copied!" : "Copy Message"}
                </button>
              </CardContent>
            </Card>
          )}

          <Card className="border-border/50 bg-secondary/30">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">
                💡 <strong>Tip:</strong> Open Profile → like a post → Open DM → paste message → come back → hit SENT.
                Copy message first to enable the SENT button.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== MODALS ===== */}
      {/* Problem Modal */}
      {problemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-center">❗ Report Problem</h2>
            <div className="grid grid-cols-1 gap-2">
              {PROBLEMS.map(p => (
                <Button key={p} variant="outline" className="h-12 justify-start" onClick={() => handleProblem(p)} disabled={processing}>{p}</Button>
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setProblemModal(false)}>Cancel</Button>
          </Card>
        </div>
      )}

      {/* Response Modal */}
      {responseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-center">💬 Response Received</h2>
            <div className="grid grid-cols-1 gap-2">
              {RESPONSE_CATEGORIES.map(cat => (
                <Button
                  key={cat}
                  variant={responseCategory === cat ? "default" : "outline"}
                  className={`h-10 justify-start ${cat === "Interested" ? "border-green-500/30" : ""}`}
                  onClick={() => setResponseCategory(cat)}
                >
                  {cat === "Interested" && "🟢 "}{cat === "Not Interested" && "🔴 "}{cat === "Asked Question" && "❓ "}{cat === "Wrong Person" && "👤 "}{cat === "Already Has Service" && "✋ "}{cat}
                </Button>
              ))}
            </div>
            <textarea className="w-full h-20 rounded-lg bg-secondary border p-3 text-sm" value={responseNotes} onChange={e => setResponseNotes(e.target.value)} placeholder="Notes (optional)" />
            <Button className="w-full h-12" onClick={() => handleResponseCategory(responseCategory)} disabled={!responseCategory || processing}>Log & Next</Button>
            <Button variant="outline" className="w-full" onClick={() => { setResponseModal(false); setResponseCategory("") }}>Cancel</Button>
          </Card>
        </div>
      )}

      {/* Logged Out Modal */}
      {loggedOutModal && currentAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-center">🔄 Logged Out</h2>
            <div className="space-y-2 bg-secondary/50 rounded-lg p-3 text-sm">
              {[
                ["Username", currentAccount.username],
                ["Password", currentAccount.password],
                ["Email", currentAccount.email],
                ["Email Pass", currentAccount.email_password],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-muted-foreground">{label}</span>
                  <button onClick={() => copyToClipboard(val, `modal-${label}`)} className="font-mono flex items-center gap-1 text-sm">
                    {val} {copiedField === `modal-${label}` ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              ))}
            </div>
            <Button className="w-full h-12" onClick={handleResumeAccount}>✅ Logged Back In</Button>
            <Button variant="outline" className="w-full" onClick={() => { setLoggedOutModal(false); rotateToNextAccount() }}>Skip Account</Button>
          </Card>
        </div>
      )}

      {/* Logout Summary Modal */}
      {showLogoutSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-center">📊 Shift Summary</h2>
            <div className="space-y-3 bg-secondary/50 rounded-lg p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Time Worked</span><span className="font-medium">{formatTimer(sessionTimer)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">DMs Sent</span><span className="font-medium text-green-400">{sessionSent}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Skipped</span><span className="font-medium">{sessionSkipped}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Responses</span><span className="font-medium text-blue-400">{sessionResponses}</span></div>
              <div className="flex justify-between border-t border-border/30 pt-2"><span className="text-muted-foreground">Total Actions</span><span className="font-bold">{sessionSent + sessionSkipped + sessionResponses}</span></div>
            </div>
            <Button className="w-full h-12" onClick={confirmLogout}>
              <LogOut className="h-4 w-4 mr-2" /> Confirm Logout
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setShowLogoutSummary(false)}>Continue Working</Button>
          </Card>
        </div>
      )}
    </div>
  )
}
