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
  Image,
  Send,
  AlertTriangle,
  XCircle,
  Camera,
  CheckCircle2,
  ChevronRight,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────

interface OutreachAccount {
  account_id: string
  username: string
  password: string
  email: string
  email_password: string
  proxy_host: string
  proxy_port: string
  proxy_username: string
  proxy_password: string
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
  status: string
  total_score: number
  ranking_tier: string
  ai_message?: string
  preferred_account_id?: string
}

interface QueueState {
  va_id: string
  queue_type: "content" | "dm"
  current_step: "content" | "dm"
  current_account_idx: number
  current_lead_idx: number
}

interface ContentPostLog {
  account_id: string
  status: string
}

function extractIGUsername(url: string): string {
  if (!url) return ""
  if (!url.includes("/")) return url.replace(/^@/, "")
  try {
    return new URL(url).pathname.replace(/\/$/, "").split("/").filter(Boolean).pop() || url
  } catch {
    return url.replace(/.*instagram\.com\//, "").replace(/[\/?].*/, "") || url
  }
}

// ── Main Component ─────────────────────────────────────────────────

export default function VAUnifiedQueuePage() {
  const [vaSession, setVaSession] = useState<{ session_id: string; va_name: string } | null>(null)
  const [queueStep, setQueueStep] = useState<"content" | "dm">("content")
  const [contentAccountIdx, setContentAccountIdx] = useState(0)
  const [dmLeadIdx, setDmLeadIdx] = useState(0)
  const [dmAccountIdx, setDmAccountIdx] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  // Load VA session
  useEffect(() => {
    const stored = localStorage.getItem("va_session")
    if (stored) setVaSession(JSON.parse(stored))
  }, [])

  const vaId = vaSession?.session_id || ""

  // Fetch accounts
  const { data: accounts, mutate: mutateAccounts } = useSWR<OutreachAccount[]>(
    "queue_accounts",
    () => dashboardApi("get_outreach_accounts"),
    { refreshInterval: 30000 }
  )

  // Fetch DM queue leads (only those with AI messages)
  const { data: dmLeads, mutate: mutateLeads } = useSWR<QueueLead[]>(
    vaId ? ["dm_queue_leads", vaId] : null,
    () => dashboardApi("get_dm_queue_leads", { va_id: vaId, limit: 200 }),
    { refreshInterval: 60000 }
  )

  // Fetch queue state (persistence)
  const { data: savedState } = useSWR<QueueState | null>(
    vaId ? ["queue_state", vaId] : null,
    () => dashboardApi("get_queue_state", { va_id: vaId })
  )

  // Fetch today's content posts
  const { data: todayContentPosts, mutate: mutateContentPosts } = useSWR<ContentPostLog[]>(
    vaId ? ["today_content", vaId] : null,
    () => dashboardApi("get_today_content_posts", { va_id: vaId }),
    { refreshInterval: 30000 }
  )

  // Fetch today's DM stats
  const { data: dmStats, mutate: mutateDMStats } = useSWR<{ total: number; sent: number; failed: number }>(
    vaId ? ["today_dm_stats", vaId] : null,
    () => dashboardApi("get_today_dm_stats", { va_id: vaId }),
    { refreshInterval: 15000 }
  )

  // Active accounts for rotation
  const activeAccounts = useMemo(() => {
    return (accounts || []).filter(a => a.status === "active" && a.sends_today < a.daily_limit)
  }, [accounts])

  const allAccounts = accounts || []

  // Restore saved state on load
  useEffect(() => {
    if (savedState && !initialized) {
      setQueueStep(savedState.current_step as "content" | "dm")
      setContentAccountIdx(savedState.current_account_idx)
      setDmLeadIdx(savedState.current_lead_idx)
      setDmAccountIdx(savedState.current_account_idx)
      setInitialized(true)
    } else if (savedState === null && !initialized) {
      setInitialized(true)
    }
  }, [savedState, initialized])

  // Content posting: which accounts still need content posted today
  const contentPostedAccountIds = useMemo(() => {
    return new Set((todayContentPosts || []).filter(p => p.status === "posted").map(p => p.account_id))
  }, [todayContentPosts])

  const accountsNeedingContent = useMemo(() => {
    return allAccounts.filter(a => a.status === "active" && !contentPostedAccountIds.has(a.account_id))
  }, [allAccounts, contentPostedAccountIds])

  const currentContentAccount = accountsNeedingContent[contentAccountIdx] || null

  // DM queue: round-robin logic
  const leads = dmLeads || []
  const totalLeads = leads.length
  const totalActiveAccounts = activeAccounts.length

  // Current DM item
  const currentDMLeadGlobalIdx = dmLeadIdx
  const currentDMLead = leads[currentDMLeadGlobalIdx] || null

  // For DMs, determine which account to use
  const currentDMAccount = useMemo(() => {
    if (!currentDMLead || activeAccounts.length === 0) return null
    // If lead has a preferred account (follow-up), use that
    if (currentDMLead.preferred_account_id) {
      const preferred = activeAccounts.find(a => a.account_id === currentDMLead.preferred_account_id)
      if (preferred && preferred.sends_today < preferred.daily_limit) return preferred
    }
    // Otherwise round-robin
    return activeAccounts[dmAccountIdx % activeAccounts.length]
  }, [currentDMLead, activeAccounts, dmAccountIdx])

  const igUsername = currentDMLead ? extractIGUsername(currentDMLead.instagram_url) : ""

  // Persist state
  const persistState = useCallback(async (step: string, accountIdx: number, leadIdx: number) => {
    if (!vaId) return
    try {
      await dashboardApi("save_queue_state", {
        va_id: vaId,
        queue_type: step,
        current_step: step,
        current_account_idx: accountIdx,
        current_lead_idx: leadIdx,
      })
    } catch { /* silent */ }
  }, [vaId])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const copyText = useCallback(async (text: string, field: string) => {
    try { await navigator.clipboard.writeText(text) } catch {
      const ta = document.createElement("textarea")
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta)
    }
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }, [])

  // ── Content Posting Actions ────────────────────────────────────

  const handleContentPosted = useCallback(async () => {
    if (!currentContentAccount || processing) return
    setProcessing(true)
    try {
      await dashboardApi("log_content_post", {
        account_id: currentContentAccount.account_id,
        va_id: vaId,
        content_id: `content_${Date.now()}`,
        status: "posted",
      })
      mutateContentPosts()
      const nextIdx = contentAccountIdx + 1
      if (nextIdx >= accountsNeedingContent.length) {
        // All content posted — move to DM step
        setQueueStep("dm")
        await persistState("dm", 0, dmLeadIdx)
        showToast("✅ All content posted! Moving to DM queue...")
      } else {
        setContentAccountIdx(nextIdx)
        await persistState("content", nextIdx, 0)
        showToast(`✅ Posted on @${currentContentAccount.username}`)
      }
    } finally {
      setProcessing(false)
    }
  }, [currentContentAccount, processing, vaId, contentAccountIdx, accountsNeedingContent, dmLeadIdx, mutateContentPosts, persistState, showToast])

  const skipContentAccount = useCallback(async () => {
    if (!currentContentAccount || processing) return
    setProcessing(true)
    try {
      await dashboardApi("log_content_post", {
        account_id: currentContentAccount.account_id,
        va_id: vaId,
        content_id: `content_${Date.now()}`,
        status: "skipped",
      })
      mutateContentPosts()
      const nextIdx = contentAccountIdx + 1
      if (nextIdx >= accountsNeedingContent.length) {
        setQueueStep("dm")
        await persistState("dm", 0, dmLeadIdx)
      } else {
        setContentAccountIdx(nextIdx)
        await persistState("content", nextIdx, 0)
      }
    } finally {
      setProcessing(false)
    }
  }, [currentContentAccount, processing, vaId, contentAccountIdx, accountsNeedingContent, dmLeadIdx, mutateContentPosts, persistState])

  // ── DM Actions ─────────────────────────────────────────────────

  const advanceDM = useCallback(async () => {
    const nextLeadIdx = dmLeadIdx + 1
    const nextAccountIdx = (dmAccountIdx + 1) % Math.max(activeAccounts.length, 1)
    setDmLeadIdx(nextLeadIdx)
    setDmAccountIdx(nextAccountIdx)
    setCopied(null)
    await persistState("dm", nextAccountIdx, nextLeadIdx)
  }, [dmLeadIdx, dmAccountIdx, activeAccounts.length, persistState])

  const handleDMSent = useCallback(async () => {
    if (!currentDMLead || !currentDMAccount || processing) return
    setProcessing(true)
    try {
      await dashboardApi("log_dm_send", {
        lead_id: currentDMLead.lead_id,
        account_id: currentDMAccount.account_id,
        va_id: vaId,
        message_sent: currentDMLead.ai_message || "",
        status: "sent",
      })
      mutateDMStats()
      mutateAccounts()
      showToast(`✅ Sent via @${currentDMAccount.username}`)
      await advanceDM()
    } finally {
      setProcessing(false)
    }
  }, [currentDMLead, currentDMAccount, processing, vaId, mutateDMStats, mutateAccounts, showToast, advanceDM])

  const handleUserNotFound = useCallback(async () => {
    if (!currentDMLead || !currentDMAccount || processing) return
    setProcessing(true)
    try {
      await dashboardApi("log_dm_send", {
        lead_id: currentDMLead.lead_id,
        account_id: currentDMAccount.account_id,
        va_id: vaId,
        message_sent: "",
        status: "user_not_found",
      })
      mutateDMStats()
      showToast("❌ User not found — skipped")
      await advanceDM()
    } finally {
      setProcessing(false)
    }
  }, [currentDMLead, currentDMAccount, processing, vaId, mutateDMStats, showToast, advanceDM])

  const handleNotSent = useCallback(async () => {
    if (!currentDMLead || !currentDMAccount || processing) return
    setProcessing(true)
    try {
      await dashboardApi("log_dm_send", {
        lead_id: currentDMLead.lead_id,
        account_id: currentDMAccount.account_id,
        va_id: vaId,
        message_sent: currentDMLead.ai_message || "",
        status: "not_sent",
        notes: "Will retry later",
      })
      mutateDMStats()
      showToast("⚠️ Logged for retry")
      await advanceDM()
    } finally {
      setProcessing(false)
    }
  }, [currentDMLead, currentDMAccount, processing, vaId, mutateDMStats, showToast, advanceDM])

  const handleAccountIssue = useCallback(async () => {
    if (!currentDMAccount || processing) return
    setProcessing(true)
    try {
      await dashboardApi("update_outreach_account", {
        account_id: currentDMAccount.account_id,
        status: "paused",
      })
      if (currentDMLead) {
        await dashboardApi("log_dm_send", {
          lead_id: currentDMLead.lead_id,
          account_id: currentDMAccount.account_id,
          va_id: vaId,
          message_sent: "",
          status: "account_issue",
          notes: "Account flagged by VA",
        })
      }
      mutateAccounts()
      mutateDMStats()
      showToast(`📸 @${currentDMAccount.username} flagged for admin review`)
      // Don't advance lead, just rotate account
      setDmAccountIdx(prev => (prev + 1) % Math.max(activeAccounts.length, 1))
    } finally {
      setProcessing(false)
    }
  }, [currentDMAccount, currentDMLead, processing, vaId, activeAccounts.length, mutateAccounts, mutateDMStats, showToast])

  // Switch to DM manually
  const switchToDM = useCallback(() => {
    setQueueStep("dm")
    persistState("dm", dmAccountIdx, dmLeadIdx)
  }, [persistState, dmAccountIdx, dmLeadIdx])

  // Switch back to content
  const switchToContent = useCallback(() => {
    setQueueStep("content")
    persistState("content", contentAccountIdx, 0)
  }, [persistState, contentAccountIdx])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (queueStep === "dm") {
        switch (e.key.toLowerCase()) {
          case "s": case "enter": e.preventDefault(); handleDMSent(); break
          case "c": e.preventDefault(); if (currentDMLead?.ai_message) copyText(currentDMLead.ai_message, "message"); break
          case "u": e.preventDefault(); if (igUsername) copyText(igUsername, "username"); break
        }
      } else {
        if (e.key.toLowerCase() === "p" || e.key === "Enter") { e.preventDefault(); handleContentPosted() }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [queueStep, handleDMSent, handleContentPosted, copyText, currentDMLead, igUsername])

  // ── Progress Stats ─────────────────────────────────────────────

  const dmsToday = dmStats?.sent || 0

  // ── Render ─────────────────────────────────────────────────────

  if (!vaSession) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="p-8 text-center max-w-md">
          <div className="text-4xl mb-4">🔐</div>
          <h2 className="text-xl font-bold mb-2">Not Logged In</h2>
          <p className="text-muted-foreground">Please log in as a VA first.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4 pb-24">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2 text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Send className="h-5 w-5 text-purple-400" />
            Queue
          </h1>
          <p className="text-xs text-muted-foreground">Hi {vaSession.va_name} 👋</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {queueStep === "content" ? "📝 Content" : "💬 DMs"}
          </Badge>
        </div>
      </div>

      {/* Step Tabs */}
      <div className="flex gap-2">
        <button
          onClick={switchToContent}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
            queueStep === "content"
              ? "bg-purple-600 text-white"
              : "bg-secondary/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          📝 Step 1: Content
        </button>
        <button
          onClick={switchToDM}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
            queueStep === "dm"
              ? "bg-purple-600 text-white"
              : "bg-secondary/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          💬 Step 2: DMs
        </button>
      </div>

      {/* Progress Bar */}
      <Card className="border-border/50">
        <CardContent className="p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            {queueStep === "content" ? (
              <>
                <span>Account {Math.min(contentAccountIdx + 1, accountsNeedingContent.length)}/{accountsNeedingContent.length}</span>
                <span>{contentPostedAccountIds.size} posted today</span>
              </>
            ) : (
              <>
                <span>Lead {Math.min(dmLeadIdx + 1, totalLeads)}/{totalLeads}</span>
                <span>Account {(dmAccountIdx % Math.max(totalActiveAccounts, 1)) + 1}/{totalActiveAccounts} • DMs today: {dmsToday}</span>
              </>
            )}
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300"
              style={{
                width: queueStep === "content"
                  ? `${accountsNeedingContent.length > 0 ? ((contentAccountIdx + 1) / accountsNeedingContent.length) * 100 : 100}%`
                  : `${totalLeads > 0 ? ((dmLeadIdx + 1) / totalLeads) * 100 : 0}%`
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* CONTENT POSTING STEP */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {queueStep === "content" && (
        <>
          {accountsNeedingContent.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <div className="text-4xl mb-3">✅</div>
                <h2 className="text-lg font-bold mb-1">All Content Posted!</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  All accounts have content posted today. Ready for DMs!
                </p>
                <Button onClick={switchToDM} className="gap-2">
                  <ChevronRight className="h-4 w-4" />
                  Start DM Queue
                </Button>
              </CardContent>
            </Card>
          ) : currentContentAccount ? (
            <Card className="border-border/50">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold">📱 @{currentContentAccount.username}</h2>
                    <p className="text-xs text-muted-foreground">Post content on this account</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {contentAccountIdx + 1}/{accountsNeedingContent.length}
                  </Badge>
                </div>

                {/* Account Details */}
                <div className="space-y-2 p-3 rounded-lg bg-secondary/30 border border-border/50">
                  {[
                    ["Username", currentContentAccount.username],
                    ["Password", currentContentAccount.password],
                    ["Proxy", currentContentAccount.proxy_host ? `${currentContentAccount.proxy_host}:${currentContentAccount.proxy_port}` : "None"],
                    ["Proxy User", currentContentAccount.proxy_username || "N/A"],
                    ["Proxy Pass", currentContentAccount.proxy_password || "N/A"],
                  ].map(([label, val]) => (
                    <div key={label} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <button
                        onClick={() => copyText(val, label)}
                        className="flex items-center gap-1 font-mono text-xs hover:text-primary transition-colors"
                      >
                        {val.length > 30 ? val.slice(0, 30) + "…" : val}
                        {copied === label ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Content posting actions */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    size="lg"
                    className="h-14 text-base font-bold bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleContentPosted}
                    disabled={processing}
                  >
                    ✅ Posted
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-14 text-base"
                    onClick={skipContentAccount}
                    disabled={processing}
                  >
                    ⏭️ Skip
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DM SENDING STEP */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {queueStep === "dm" && (
        <>
          {totalLeads === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <div className="text-4xl mb-3">📭</div>
                <h2 className="text-lg font-bold mb-1">No Leads in DM Queue</h2>
                <p className="text-sm text-muted-foreground">
                  Only leads with AI-generated messages appear here. Wait for messages to be generated.
                </p>
                <Button className="mt-4" onClick={() => mutateLeads()}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                </Button>
              </CardContent>
            </Card>
          ) : !currentDMLead ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <div className="text-4xl mb-3">🎉</div>
                <h2 className="text-lg font-bold mb-1">DM Queue Complete!</h2>
                <p className="text-sm text-muted-foreground">
                  You&apos;ve gone through all {totalLeads} leads. Great work!
                </p>
                <p className="text-xs text-muted-foreground mt-2">DMs sent today: {dmsToday}</p>
              </CardContent>
            </Card>
          ) : activeAccounts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <div className="text-4xl mb-3">🛑</div>
                <h2 className="text-lg font-bold mb-1">All Accounts at Limit</h2>
                <p className="text-sm text-muted-foreground">All active accounts have hit their daily limit. Done for today!</p>
                <p className="text-xs text-muted-foreground mt-2">DMs sent today: {dmsToday}</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Current Account */}
              {currentDMAccount && (
                <Card className="border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">📱</div>
                        <div>
                          <div className="font-semibold">@{currentDMAccount.username}</div>
                          <div className="text-xs text-muted-foreground">
                            {currentDMAccount.sends_today}/{currentDMAccount.daily_limit} sends
                            {currentDMLead.preferred_account_id && currentDMLead.preferred_account_id === currentDMAccount.account_id && (
                              <span className="text-yellow-400 ml-1">🔄 Follow-up</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs text-green-400 border-green-500/30">active</Badge>
                    </div>
                    {/* Account rotation dots */}
                    <div className="flex gap-1 mt-2">
                      {activeAccounts.slice(0, 20).map((a, i) => (
                        <div
                          key={a.account_id}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            a.account_id === currentDMAccount.account_id ? "bg-purple-500" : "bg-secondary"
                          }`}
                          title={`@${a.username} (${a.sends_today}/${a.daily_limit})`}
                        />
                      ))}
                    </div>
                    {/* Proxy info */}
                    {currentDMAccount.proxy_host && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Proxy: {currentDMAccount.proxy_host}:{currentDMAccount.proxy_port}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Lead Info + Username */}
              <Card className="border-border/50">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-bold">{currentDMLead.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {currentDMLead.business_type}{currentDMLead.city ? ` · ${currentDMLead.city}` : ""}{currentDMLead.state ? `, ${currentDMLead.state}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">#{dmLeadIdx + 1}</Badge>
                  </div>

                  {/* Username copy */}
                  <button
                    onClick={() => copyText(igUsername, "username")}
                    className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-pink-500/5 border border-pink-500/20 hover:border-pink-500/40 transition-all active:scale-[0.98]"
                  >
                    <span className="text-xl font-bold text-pink-400">@{igUsername}</span>
                    {copied === "username" ? (
                      <Check className="h-5 w-5 text-green-400 shrink-0" />
                    ) : (
                      <Copy className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  <a
                    href={`https://instagram.com/${igUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-400 hover:underline"
                  >
                    Open Profile <ExternalLink className="h-3 w-3" />
                  </a>
                </CardContent>
              </Card>

              {/* AI Message */}
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">💬 AI Message</span>
                    <span className="text-xs text-muted-foreground">[C] to copy</span>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/5 to-pink-500/5 border border-border/30">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {currentDMLead.ai_message || "No message generated"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className={`w-full mt-3 h-10 ${copied === "message" ? "border-green-500/50 text-green-400" : ""}`}
                    onClick={() => copyText(currentDMLead.ai_message || "", "message")}
                    disabled={!currentDMLead.ai_message}
                  >
                    {copied === "message" ? (
                      <><Check className="h-4 w-4 mr-2" /> Copied!</>
                    ) : (
                      <><Copy className="h-4 w-4 mr-2" /> Copy Message</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  size="lg"
                  className="h-14 text-base font-bold bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleDMSent}
                  disabled={processing}
                >
                  ✅ Sent
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 text-base text-red-400 border-red-500/30 hover:bg-red-500/10"
                  onClick={handleUserNotFound}
                  disabled={processing}
                >
                  ❌ Doesn&apos;t Exist
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 text-base text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10"
                  onClick={handleNotSent}
                  disabled={processing}
                >
                  ⚠️ Not Sent
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 text-base text-orange-400 border-orange-500/30 hover:bg-orange-500/10"
                  onClick={handleAccountIssue}
                  disabled={processing}
                >
                  📸 Account Issue
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {/* Keyboard Shortcuts Footer */}
      <div className="text-center text-xs text-muted-foreground pt-2">
        {queueStep === "content" ? (
          <span><kbd className="bg-secondary px-1 rounded">Enter</kbd>/<kbd className="bg-secondary px-1 rounded">P</kbd> = Posted</span>
        ) : (
          <span>
            <kbd className="bg-secondary px-1 rounded">S</kbd>=Sent ·{" "}
            <kbd className="bg-secondary px-1 rounded">C</kbd>=Copy ·{" "}
            <kbd className="bg-secondary px-1 rounded">U</kbd>=Username
          </span>
        )}
      </div>
    </div>
  )
}
