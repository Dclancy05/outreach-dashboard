"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import {
  Copy, Eye, EyeOff, Shield, Mail, Key, Phone, Link2, RefreshCw, AlertTriangle,
  CheckCircle2, Clock, Activity, Server, Sparkles, XCircle, LogIn, Pause, Play, Ban,
  Loader2, Cookie,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DeviceIdentity } from "@/components/device-identity"
import { CookieHealthBadge } from "@/components/cookie-health-badge"

interface Props {
  open: boolean
  accountId: string | null
  onClose: () => void
  onLoginClick?: (account: any) => void
  onChanged?: () => void
}

interface DetailData {
  account: any
  totp: { code: string; remaining: number } | null
  session: { hasCookie: boolean; ageDays: number | null }
  proxy: any
  warmup: any
  recentSends: any[]
  flags: { signals: string[]; needsAttention: boolean }
}

function CopyButton({ value, label }: { value: string | undefined | null; label?: string }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(String(value))
          setCopied(true)
          toast.success(`${label || "Copied"} copied`)
          setTimeout(() => setCopied(false), 1200)
        } catch {
          toast.error("Copy failed")
        }
      }}
      className={cn(
        "p-1.5 rounded-lg transition-colors",
        copied ? "text-emerald-400 bg-emerald-500/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
      )}
      title="Copy"
    >
      {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function Field({
  icon: Icon,
  label,
  value,
  isSecret,
  muted,
}: {
  icon?: any
  label: string
  value: string | undefined | null
  isSecret?: boolean
  muted?: boolean
}) {
  const [shown, setShown] = useState(false)
  const display = value ? (isSecret && !shown ? "•".repeat(Math.min(String(value).length, 16)) : String(value)) : "—"
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </Label>
      <div className={cn("flex items-center gap-1.5 rounded-lg bg-muted/20 border border-border/40 px-2.5 py-1.5", muted && "opacity-60")}>
        <span className="text-xs font-mono text-foreground truncate flex-1">{display}</span>
        {isSecret && value && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            className="p-1 rounded text-muted-foreground hover:text-foreground"
            title={shown ? "Hide" : "Show"}
          >
            {shown ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </button>
        )}
        {value && <CopyButton value={value} label={label} />}
      </div>
    </div>
  )
}

function TotpDisplay({ initial }: { initial: DetailData["totp"] }) {
  const [totp, setTotp] = useState(initial)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setTotp(initial)
  }, [initial])

  useEffect(() => {
    if (!totp) return
    const interval = setInterval(() => {
      setTotp((t) => {
        if (!t) return t
        const next = t.remaining - 1
        if (next <= 0) return { ...t, remaining: 0 }
        return { ...t, remaining: next }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [totp?.code])

  const refresh = async (secret?: string) => {
    if (!secret && !totp) return
    setRefreshing(true)
    try {
      const res = await fetch("/api/accounts/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      })
      const data = await res.json()
      if (res.ok) setTotp(data)
      else toast.error(data.error || "Failed to generate code")
    } catch (e: any) {
      toast.error(e.message)
    }
    setRefreshing(false)
  }

  if (!totp) return null

  const pct = (totp.remaining / 30) * 100
  const urgent = totp.remaining <= 5

  return (
    <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-blue-500/10 border border-violet-500/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Shield className="h-4 w-4 text-violet-400" />
          <Label className="text-xs font-medium text-foreground">2FA Code</Label>
        </div>
        <span className={cn("text-[10px] font-mono", urgent ? "text-red-400" : "text-muted-foreground")}>
          {totp.remaining}s
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 font-mono text-2xl font-bold text-foreground tracking-widest">
          {totp.code.slice(0, 3)} {totp.code.slice(3)}
        </div>
        <CopyButton value={totp.code} label="2FA code" />
      </div>
      <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all duration-1000", urgent ? "bg-red-500" : "bg-gradient-to-r from-violet-500 to-blue-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

type TimelineEntry = {
  timestamp: string
  source: "send_log" | "automation_runs"
  action: string
  status: string
  target: string | null
  error: string | null
}

export default function AccountDetailDialog({ open, accountId, onClose, onLoginClick, onChanged }: Props) {
  const [data, setData] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchingCode, setFetchingCode] = useState(false)
  const [fetchedCode, setFetchedCode] = useState<{ code: string; from: string; subject: string } | null>(null)
  const [actioning, setActioning] = useState(false)
  const [cookieImportOpen, setCookieImportOpen] = useState(false)
  const [cookieImportText, setCookieImportText] = useState("")
  const [cookieImporting, setCookieImporting] = useState(false)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineExpanded, setTimelineExpanded] = useState(false)

  const load = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    setFetchedCode(null)
    try {
      const res = await fetch("/api/accounts/detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId }),
      })
      const json = await res.json()
      if (res.ok) setData(json)
      else toast.error(json.error || "Failed to load")
    } catch (e: any) {
      toast.error(e.message)
    }
    setLoading(false)
  }, [accountId])

  useEffect(() => {
    if (open && accountId) load()
    else { setData(null); setTimeline([]) }
  }, [open, accountId, load])

  // Load richer timeline from send_log + automation_runs
  useEffect(() => {
    if (!open || !accountId) return
    let cancelled = false
    setTimelineLoading(true)
    fetch(`/api/accounts/timeline?account_id=${encodeURIComponent(accountId)}&limit=50`, { cache: "no-store" })
      .then(r => r.json())
      .then(j => { if (!cancelled) setTimeline(j.data || []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTimelineLoading(false) })
    return () => { cancelled = true }
  }, [open, accountId])

  useEffect(() => {
    if (!data?.totp || !open) return
    if (data.totp.remaining <= 1) {
      const t = setTimeout(() => load(), 1500)
      return () => clearTimeout(t)
    }
  }, [data?.totp?.remaining, open, load])

  const fetchVerificationCode = async () => {
    if (!accountId) return
    setFetchingCode(true)
    setFetchedCode(null)
    try {
      const res = await fetch("/api/accounts/verification-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId }),
      })
      const json = await res.json()
      if (res.ok) {
        setFetchedCode(json)
        toast.success("Code found: " + json.code)
      } else {
        toast.error(json.error || "Could not fetch code")
      }
    } catch (e: any) {
      toast.error(e.message)
    }
    setFetchingCode(false)
  }

  const importCookies = async () => {
    if (!accountId || !cookieImportText.trim()) {
      toast.error("Paste cookie JSON or header string first")
      return
    }
    setCookieImporting(true)
    try {
      const res = await fetch("/api/accounts/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, cookies: cookieImportText }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(`Imported ${json.count || 0} cookies`)
        setCookieImportOpen(false)
        setCookieImportText("")
        await load()
        onChanged?.()
      } else {
        toast.error(json.error || "Import failed")
      }
    } catch (e: any) {
      toast.error(e.message)
    }
    setCookieImporting(false)
  }

  const flagAccount = async (status: string, reason?: string) => {
    if (!accountId) return
    setActioning(true)
    try {
      const res = await fetch("/api/accounts/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, status, reason }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(`Marked ${status}`)
        await load()
        onChanged?.()
      } else toast.error(json.error)
    } catch (e: any) {
      toast.error(e.message)
    }
    setActioning(false)
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-400" />
            Account Details
            {data?.account && (
              <Badge variant="outline" className="text-xs capitalize ml-auto">
                {data.account.platform}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
          </div>
        )}

        {!loading && data && (
          <div className="space-y-4">
            {/* Header */}
            <div className="rounded-xl bg-card/40 border border-border/40 p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">@{data.account.username || data.account.display_name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge
                      className={cn(
                        "text-[10px]",
                        data.account.status === "active" && "bg-green-500/20 text-green-400 border-green-500/30",
                        data.account.status === "banned" && "bg-red-500/20 text-red-400 border-red-500/30",
                        data.account.status === "cooldown" && "bg-orange-500/20 text-orange-400 border-orange-500/30",
                        data.account.status === "flagged" && "bg-amber-500/20 text-amber-400 border-amber-500/30",
                        data.account.status === "paused" && "bg-muted/30 text-muted-foreground",
                        data.account.status === "pending_setup" && "bg-violet-500/20 text-violet-400 border-violet-500/30",
                        data.account.status === "warming" && "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                      )}
                    >
                      {data.account.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">ID {data.account.account_id}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {data.session.hasCookie ? (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Session Saved
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] gap-1">
                    <AlertTriangle className="h-3 w-3" /> Not Logged In
                  </Badge>
                )}
              </div>
            </div>

            {/* Cookie health + device identity — expose the new persistence
                system to the user without cluttering the primary card. */}
            <div className="flex flex-wrap items-center gap-2">
              <CookieHealthBadge
                accountId={data.account.account_id}
                initialHealth={(data.account as any).cookies_health}
                initialUpdatedAt={(data.account as any).cookies_updated_at}
              />
            </div>
            <DeviceIdentity accountId={data.account.account_id} />

            {/* Flag signals */}
            {data.flags.needsAttention && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  <span className="text-xs font-semibold text-red-400">Health Signals</span>
                </div>
                <ul className="text-xs text-foreground space-y-1 pl-5 list-disc">
                  {data.flags.signals.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 2FA */}
            {data.totp ? (
              <TotpDisplay initial={data.totp} />
            ) : data.account.twofa_secret ? (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-400">
                2FA secret exists but couldn&apos;t be decoded. Check that it&apos;s a valid base32 TOTP secret.
              </div>
            ) : null}

            {/* Credentials */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Credentials</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Field icon={Key} label="Username" value={data.account.username} />
                <Field icon={Shield} label="Password" value={data.account.password} isSecret />
                <Field icon={Mail} label="Email" value={data.account.email} />
                <Field icon={Key} label="Email Password" value={data.account.email_password} isSecret />
                <Field icon={Phone} label="Phone" value={data.account.phone} />
                <Field icon={Link2} label="Profile URL" value={data.account.profile_url} />
              </div>
            </div>

            {/* Email verification reader */}
            {data.account.email && data.account.email_password && (
              <div className="rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-4 w-4 text-blue-400" />
                    <span className="text-xs font-medium text-foreground">Email Verification Reader</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={fetchVerificationCode}
                    disabled={fetchingCode}
                    className="h-7 text-xs bg-blue-600 hover:bg-blue-500 rounded-lg"
                  >
                    {fetchingCode ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Checking...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1" /> Fetch Latest Code
                      </>
                    )}
                  </Button>
                </div>
                {fetchedCode && (
                  <div className="flex items-center gap-2 bg-card/40 rounded-lg p-2">
                    <div className="font-mono text-xl font-bold text-blue-400 tracking-widest flex-1">
                      {fetchedCode.code}
                    </div>
                    <CopyButton value={fetchedCode.code} label="Verification code" />
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Scans inbox for {data.account.platform} verification emails from the last 30 min. Needs app password for
                  Gmail/Yahoo.
                </p>
              </div>
            )}

            {/* Connection & infra */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Connection</div>
              <div className="grid grid-cols-2 gap-2.5">
                <Field icon={Server} label="Connection" value={data.account.connection_type || "novnc"} />
                {data.proxy && (
                  <Field icon={Server} label="Proxy" value={`${data.proxy.location_city || data.proxy.ip} (${data.proxy.provider || "?"})`} />
                )}
                <Field label="Daily Limit" value={String(data.account.daily_limit || "40")} />
                <Field label="Sends Today" value={String(data.account.sends_today || "0")} />
                {data.warmup && (
                  <>
                    <Field label="Warmup Sequence" value={data.warmup.name} />
                    <Field label="Warmup Day" value={String(data.account.warmup_day || 0)} />
                  </>
                )}
                <Field label="Health Score" value={String(data.account.health_score || "—")} />
                <Field label="Last Used" value={data.account.last_used_at ? new Date(data.account.last_used_at).toLocaleString() : "Never"} />
              </div>
            </div>

            {/* Activity timeline — send_log + automation_runs merged */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <Activity className="h-3 w-3" /> Recent Activity {timeline.length > 0 && `(${timeline.length})`}
                </div>
                {timeline.length > 5 && (
                  <button
                    onClick={() => setTimelineExpanded(v => !v)}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {timelineExpanded ? "Show less" : `Show all (${timeline.length})`}
                  </button>
                )}
              </div>
              {timelineLoading ? (
                <div className="text-xs text-muted-foreground py-4 text-center">
                  <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5" /> Loading timeline...
                </div>
              ) : timeline.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center rounded-xl bg-muted/10 border border-border/30">
                  No activity yet
                </div>
              ) : (
                <div className={cn(
                  "rounded-xl bg-muted/20 border border-border/40 overflow-y-auto",
                  timelineExpanded ? "max-h-80" : "max-h-48"
                )}>
                  {timeline.slice(0, timelineExpanded ? 50 : 10).map((t, i) => {
                    const isFail = ["failed", "error", "gave_up"].includes(t.status)
                    const isOk = ["sent", "passed", "healed", "queued", "resolved"].includes(t.status)
                    return (
                      <div key={i} className="px-2.5 py-1.5 border-b border-border/20 last:border-0 flex items-center gap-2 text-xs hover:bg-muted/30">
                        {isFail ? <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                          : isOk ? <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                          : <Clock className="h-3 w-3 text-amber-400 shrink-0" />}
                        <span className="shrink-0 text-muted-foreground font-mono text-[10px]">
                          {t.source === "automation_runs" ? "auto" : "send"}
                        </span>
                        <span className="truncate flex-1 text-foreground" title={t.error || undefined}>
                          {t.action}{t.target ? ` → ${t.target}` : ""}
                        </span>
                        <Badge className={cn(
                          "text-[9px] h-4 px-1",
                          isFail && "bg-red-500/10 text-red-300 border-red-500/20",
                          isOk && "bg-green-500/10 text-green-300 border-green-500/20",
                          !isFail && !isOk && "bg-amber-500/10 text-amber-300 border-amber-500/20",
                        )}>{t.status}</Badge>
                        <span className="text-[9px] text-muted-foreground shrink-0">
                          {t.timestamp ? new Date(t.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Notes */}
            {data.account.notes && (
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</Label>
                <div className="rounded-lg bg-muted/20 border border-border/40 p-2.5 text-xs text-foreground whitespace-pre-wrap">
                  {data.account.notes}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 border-t border-border/30 flex flex-wrap gap-2">
              {/* Google accounts are band-quality boosters — never send, never
                  need a login flow on the VPS Chrome. Hide the Log In button
                  entirely for them so nobody (or stray click handler) can drive
                  the shared browser to a Google login URL. */}
              {data.account.platform !== "google" && (
                <Button
                  size="sm"
                  onClick={() => onLoginClick?.(data.account)}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl text-xs"
                >
                  <LogIn className="h-3.5 w-3.5 mr-1" /> {data.session.hasCookie ? "Re-login" : "Log In"}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCookieImportOpen(true)}
                className="rounded-xl text-xs text-violet-300 border-violet-500/30 hover:bg-violet-500/10"
                title="Import cookies from an aged account (skips login + looks older)"
              >
                <Cookie className="h-3.5 w-3.5 mr-1" /> Import Cookies
              </Button>
              {data.account.status !== "paused" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actioning}
                  onClick={() => flagAccount("paused", "Manually paused")}
                  className="rounded-xl text-xs"
                >
                  <Pause className="h-3.5 w-3.5 mr-1" /> Pause
                </Button>
              )}
              {data.account.status !== "active" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actioning}
                  onClick={() => flagAccount("active")}
                  className="rounded-xl text-xs"
                >
                  <Play className="h-3.5 w-3.5 mr-1" /> Activate
                </Button>
              )}
              {data.account.status !== "flagged" && data.account.status !== "banned" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actioning}
                  onClick={() => {
                    const reason = window.prompt("Why flag this account? (optional)") || ""
                    flagAccount("flagged", reason)
                  }}
                  className="rounded-xl text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Flag
                </Button>
              )}
              {data.account.status !== "banned" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actioning}
                  onClick={() => {
                    if (!confirm("Mark this account as banned? It will stop sending.")) return
                    flagAccount("banned", "Manually marked banned")
                  }}
                  className="rounded-xl text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                >
                  <Ban className="h-3.5 w-3.5 mr-1" /> Banned
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Cookie import modal — overlays within the same dialog so the import UX
            stays attached to the account being edited. */}
        {cookieImportOpen && (
          <div className="mt-4 rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Cookie className="h-4 w-4 text-violet-300" />
              <span className="text-sm font-semibold text-foreground">Import Cookies</span>
              <Badge className="text-[10px] bg-violet-500/20 text-violet-200 border-violet-500/30 ml-auto">Stealth</Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Paste cookies from an aged account to skip the login flow. Accepted formats:
              <br />— <span className="font-mono">Cookie: name1=val1; name2=val2</span> header
              <br />— JSON array from EditThisCookie / Cookie-Editor extension
              <br />— Netscape <span className="font-mono">cookies.txt</span> format
            </p>
            <textarea
              value={cookieImportText}
              onChange={(e) => setCookieImportText(e.target.value)}
              placeholder='[{"name":"sessionid","value":"...","domain":".instagram.com"}]'
              className="w-full min-h-[140px] rounded-lg bg-black/40 border border-border/40 p-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-violet-500/50"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={importCookies}
                disabled={cookieImporting}
                className="bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl text-xs"
              >
                {cookieImporting ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Importing...</> : <><Cookie className="h-3.5 w-3.5 mr-1" /> Import</>}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setCookieImportOpen(false); setCookieImportText("") }}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
