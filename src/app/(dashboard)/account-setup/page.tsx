"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Instagram,
  Facebook,
  Linkedin,
  Copy,
  Check,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Mail,
  Inbox,
  Users,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
  Plus,
  Link as LinkIcon,
  Shield,
  Globe,
  Clock,
  Monitor,
  Wifi,
  WifiOff,
} from "lucide-react"
import { toast } from "sonner"

// ── Types ────────────────────────────────────────────────────────────────────

interface AccountRecord {
  platform: "instagram" | "facebook" | "linkedin"
  index: number
  username?: string
  password?: string
  twofa?: string
  email?: string
  emailPassword?: string
  cookie?: string
  phone?: string
  displayName?: string
  profileUrl?: string
  profileUuid?: string
  goLoginId?: string
  goLoginName?: string
  proxyInfo?: string
  goLoginStatus: "ready" | "no-proxy" | "not-setup"
  // GoLogin live data
  goLoginProfileName?: string
  goLoginCanRun?: boolean
  goLoginRunDisabled?: string | null
  goLoginOS?: string
  goLoginBrowser?: string
  goLoginLastUpdated?: string
  goLoginCreated?: string
  goLoginProxyEnabled?: boolean
  goLoginProxyHost?: string
  goLoginStartUrl?: string
  goLoginHasSession?: boolean
  goLoginUserAgent?: string
  goLoginTags?: string[]
  goLoginLocked?: boolean
  goLoginNotes?: string
}

interface EmailMessage {
  subject: string
  from: string
  date: string
  snippet: string
}

type Platform = "all" | "instagram" | "facebook" | "linkedin"

const PLATFORM_META: Record<string, { label: string; icon: typeof Instagram; color: string; dotColor: string }> = {
  instagram: { label: "Instagram", icon: Instagram, color: "text-pink-400", dotColor: "bg-pink-400" },
  facebook: { label: "Facebook", icon: Facebook, color: "text-blue-400", dotColor: "bg-blue-400" },
  linkedin: { label: "LinkedIn", icon: Linkedin, color: "text-sky-400", dotColor: "bg-sky-400" },
}

const STATUS_META = {
  ready: { label: "Ready", color: "bg-green-400", textColor: "text-green-400" },
  "no-proxy": { label: "No Proxy", color: "bg-yellow-400", textColor: "text-yellow-400" },
  "not-setup": { label: "Not Set Up", color: "bg-zinc-500", textColor: "text-zinc-400" },
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ── Copy Button ──────────────────────────────────────────────────────────────

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    if (label) toast.success(`${label} copied`)
    setTimeout(() => setCopied(false), 1500)
  }, [text, label])

  return (
    <button
      onClick={(e) => { e.stopPropagation(); handleCopy() }}
      className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-white/10 transition-colors"
      title={`Copy ${label || ""}`}
    >
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3 text-zinc-500" />}
    </button>
  )
}

// ── Credential Field ─────────────────────────────────────────────────────────

function CredField({ label, value, secret, showSecrets }: { label: string; value?: string; secret?: boolean; showSecrets: boolean }) {
  if (!value) return null
  const display = secret && !showSecrets ? "••••••••" : value
  const isLong = value.length > 80

  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-zinc-800/50 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">{label}</p>
        <p className={`text-sm font-mono ${isLong ? "break-all text-xs" : ""} text-zinc-200`}>{display}</p>
      </div>
      <CopyBtn text={value} label={label} />
    </div>
  )
}

// ── Expandable Account Row ───────────────────────────────────────────────────

function AccountRow({ account, onRefresh }: { account: AccountRecord; onRefresh?: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [showSecrets, setShowSecrets] = useState(false)

  const meta = PLATFORM_META[account.platform]
  const status = STATUS_META[account.goLoginStatus]
  const Icon = meta.icon
  const displayName = account.username || account.displayName || account.email || `Account ${account.index}`

  return (
    <div className="border-b border-zinc-800/60 last:border-0">
      {/* Main Row */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/30 cursor-pointer transition-colors select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Expand chevron */}
        <div className="w-4 flex-shrink-0">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-zinc-500" />
            : <ChevronRight className="h-4 w-4 text-zinc-500" />
          }
        </div>

        {/* Status dot */}
        <div
          className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
            account.goLoginId
              ? account.goLoginHasSession
                ? "bg-green-400"
                : "bg-yellow-400"
              : status.color
          }`}
          title={
            account.goLoginId
              ? account.goLoginHasSession
                ? "Logged In"
                : "Needs Login"
              : status.label
          }
        />

        {/* Platform icon */}
        <Icon className={`h-4 w-4 flex-shrink-0 ${meta.color}`} />

        {/* Name */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-zinc-100 truncate block">{displayName}</span>
        </div>

        {/* Email */}
        <div className="hidden md:block w-56 truncate text-xs text-zinc-400 font-mono">
          {account.email || "—"}
        </div>

        {/* Proxy */}
        <div className="hidden lg:block w-36 truncate text-xs text-zinc-500 font-mono">
          {account.proxyInfo || "—"}
        </div>

        {/* GoLogin Status */}
        <div className="hidden lg:block w-28">
          {account.goLoginId ? (
            <Badge
              variant="secondary"
              className={`text-[10px] border ${
                account.goLoginHasSession
                  ? "bg-green-500/10 text-green-400 border-green-500/30"
                  : "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
              }`}
            >
              {account.goLoginHasSession ? "Logged In" : "Needs Login"}
            </Badge>
          ) : (
            <span className="text-[10px] text-zinc-600">—</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 w-28 justify-end flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {account.goLoginId ? (
            <a
              href="https://app.gologin.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
              Open GoLogin
            </a>
          ) : (
            <span className="text-[10px] text-zinc-600">—</span>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 pl-12 animate-in slide-in-from-top-1 duration-200 space-y-3">
          {/* GoLogin Profile Status */}
          {account.goLoginId && (
            <div className="bg-zinc-900/80 rounded-lg border border-zinc-800/80 p-4 max-w-3xl">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  GoLogin Profile
                </h4>
                <a
                  href={`https://app.gologin.com/browser/${account.goLoginId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-blue-400 hover:underline flex items-center gap-1"
                >
                  Open in GoLogin <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {/* Session Status */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Session</span>
                  <div className="flex items-center gap-1.5">
                    {account.goLoginHasSession ? (
                      <>
                        <div className="h-2 w-2 rounded-full bg-green-400" />
                        <span className="text-xs text-green-400 font-medium">Logged In</span>
                      </>
                    ) : (
                      <>
                        <div className="h-2 w-2 rounded-full bg-yellow-400" />
                        <span className="text-xs text-yellow-400 font-medium">Needs Login</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Can Run */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Status</span>
                  <div className="flex items-center gap-1.5">
                    {account.goLoginCanRun ? (
                      <>
                        <Shield className="h-3 w-3 text-green-400" />
                        <span className="text-xs text-green-400 font-medium">Ready to Run</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3 w-3 text-red-400" />
                        <span className="text-xs text-red-400 font-medium">{account.goLoginRunDisabled || "Cannot Run"}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Proxy */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Proxy</span>
                  <div className="flex items-center gap-1.5">
                    {account.goLoginProxyEnabled ? (
                      <>
                        <Wifi className="h-3 w-3 text-green-400" />
                        <span className="text-xs text-green-400 font-medium">{account.goLoginProxyHost || "Enabled"}</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="h-3 w-3 text-red-400" />
                        <span className="text-xs text-red-400 font-medium">No Proxy</span>
                      </>
                    )}
                  </div>
                </div>

                {/* OS & Browser */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Environment</span>
                  <div className="flex items-center gap-1.5">
                    <Monitor className="h-3 w-3 text-zinc-400" />
                    <span className="text-xs text-zinc-300">{account.goLoginOS || "—"} · {account.goLoginBrowser || "—"}</span>
                  </div>
                </div>

                {/* Last Updated */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Last Updated</span>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-zinc-400" />
                    <span className="text-xs text-zinc-300">
                      {account.goLoginLastUpdated
                        ? new Date(account.goLoginLastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </span>
                  </div>
                </div>

                {/* Created */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Created</span>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-zinc-400" />
                    <span className="text-xs text-zinc-300">
                      {account.goLoginCreated
                        ? new Date(account.goLoginCreated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Start URL */}
              {account.goLoginStartUrl && (
                <div className="mt-3 pt-3 border-t border-zinc-800/60">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Start URL</span>
                  <p className="text-xs text-zinc-300 mt-0.5 font-mono">{account.goLoginStartUrl}</p>
                </div>
              )}

              {/* Profile Name */}
              {account.goLoginProfileName && (
                <div className="mt-2">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Profile Name</span>
                  <p className="text-xs text-zinc-300 mt-0.5">{account.goLoginProfileName}</p>
                </div>
              )}

              {/* Locked */}
              {account.goLoginLocked && (
                <div className="mt-2">
                  <Badge variant="outline" className="text-[10px] border-orange-500/30 text-orange-400">🔒 Profile Locked</Badge>
                </div>
              )}
            </div>
          )}

          {/* Account Credentials */}
          <div className="bg-zinc-900/80 rounded-lg border border-zinc-800/80 p-4 max-w-3xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Account Credentials</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-[10px] text-zinc-500"
                onClick={() => setShowSecrets(!showSecrets)}
              >
                {showSecrets ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showSecrets ? "Hide" : "Show"} Secrets
              </Button>
            </div>
            <div className="space-y-0">
              {account.username && <CredField label="Username" value={account.username} showSecrets={showSecrets} />}
              {account.email && <CredField label="Email" value={account.email} showSecrets={showSecrets} />}
              <CredField label="Password" value={account.password} secret showSecrets={showSecrets} />
              {account.emailPassword && <CredField label="Email Password" value={account.emailPassword} secret showSecrets={showSecrets} />}
              <CredField label="2FA Code" value={account.twofa} showSecrets={showSecrets} />
              {account.phone && <CredField label="Phone" value={account.phone} showSecrets={showSecrets} />}
              {account.displayName && <CredField label="Display Name" value={account.displayName} showSecrets={showSecrets} />}
              {account.profileUrl && <CredField label="Profile URL" value={account.profileUrl} showSecrets={showSecrets} />}
              {account.cookie && <CredField label="Cookie" value={account.cookie} secret showSecrets={showSecrets} />}
              {account.profileUuid && <CredField label="Profile UUID" value={account.profileUuid} showSecrets={showSecrets} />}
              {account.proxyInfo && <CredField label="Proxy" value={account.proxyInfo} showSecrets={showSecrets} />}
              {account.goLoginId && <CredField label="GoLogin ID" value={account.goLoginId} showSecrets={showSecrets} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Email Inbox Tab ──────────────────────────────────────────────────────────

// ── Helper: localStorage token management ───────────────────────────────────

function getEmailTokens(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(localStorage.getItem("email_oauth_tokens") || "{}")
  } catch { return {} }
}

function setEmailToken(email: string, token: string) {
  const tokens = getEmailTokens()
  tokens[email] = token
  localStorage.setItem("email_oauth_tokens", JSON.stringify(tokens))
}

function getManualEmails(): Array<{ email: string; password: string; platform: string }> {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem("manual_email_accounts") || "[]")
  } catch { return [] }
}

function saveManualEmails(emails: Array<{ email: string; password: string; platform: string }>) {
  localStorage.setItem("manual_email_accounts", JSON.stringify(emails))
}

// ── Add Email Account Modal ──────────────────────────────────────────

function AddEmailModal({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (v: boolean) => void; onAdded: () => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [platform, setPlatform] = useState<string>("instagram")

  function handleSave() {
    if (!email.trim()) { toast.error("Email is required"); return }
    const existing = getManualEmails()
    if (existing.some(e => e.email === email.trim())) {
      toast.error("Email already added")
      return
    }
    existing.push({ email: email.trim(), password, platform })
    saveManualEmails(existing)
    toast.success("Email account added")
    setEmail("")
    setPassword("")
    onOpenChange(false)
    onAdded()
  }

  function handleConnect() {
    if (!email.trim()) { toast.error("Enter email first"); return }
    // Save first
    const existing = getManualEmails()
    if (!existing.some(e => e.email === email.trim())) {
      existing.push({ email: email.trim(), password, platform })
      saveManualEmails(existing)
    }
    // Open OAuth in new tab
    window.open(`/api/email/oauth/authorize?email=${encodeURIComponent(email.trim())}`, "_blank")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Email Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Email Address</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="account@outlook.com" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Password <span className="text-zinc-500">(optional, for reference)</span></Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="For reference only" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Platform</Label>
            <div className="flex gap-2">
              {(["instagram", "facebook", "linkedin"] as const).map((p) => {
                const meta = PLATFORM_META[p]
                const Icon = meta.icon
                return (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-all ${
                      platform === p ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${platform === p ? meta.color : ""}`} />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleConnect} className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700 text-white">
              <LinkIcon className="h-4 w-4" />
              {email.includes("@clso.us") || email.includes("@gmail.com") ? "Connect via Google" : "Connect via Microsoft"}
            </Button>
            <Button onClick={handleSave} variant="outline" className="gap-2">
              Save without connecting
            </Button>
          </div>
          <p className="text-[10px] text-zinc-500 text-center">
            This will redirect you to sign in with your email provider (Microsoft or Google) for OAuth2 email access.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Email Inbox Tab ──────────────────────────────────────────────────

function EmailInboxTab({ accounts }: { accounts: AccountRecord[] }) {
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null)
  const [emailResults, setEmailResults] = useState<Record<string, { loading: boolean; emails?: EmailMessage[]; error?: string }>>({})
  const [searchQuery, setSearchQuery] = useState("")
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [manualRefresh, setManualRefresh] = useState(0)
  const checkingAllRef = useRef(false)

  // Listen for OAuth completion from popup tab
  useEffect(() => {
    if (typeof window === "undefined") return

    // Also handle legacy URL-based callback (in case of direct navigation)
    const params = new URLSearchParams(window.location.search)
    const connected = params.get("connected")
    const hash = window.location.hash
    if (connected && hash.startsWith("#token=")) {
      const token = decodeURIComponent(hash.slice(7))
      if (token) {
        setEmailToken(connected, token)
        toast.success(`Connected: ${connected}`)
        window.history.replaceState({}, "", "/account-setup?tab=email")
        setManualRefresh(r => r + 1)
      }
    }
    const errorMsg = params.get("error")
    if (errorMsg) {
      toast.error(`OAuth error: ${errorMsg}`)
      window.history.replaceState({}, "", "/account-setup?tab=email")
    }

    // Listen for postMessage from OAuth popup
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "oauth-complete" && event.data.email && event.data.token) {
        setEmailToken(event.data.email, event.data.token)
        toast.success(`Connected: ${event.data.email}`)
        setManualRefresh(r => r + 1)
      } else if (event.data?.type === "oauth-error" && event.data.error) {
        toast.error(`OAuth error: ${event.data.error}`)
      }
    }
    window.addEventListener("message", handleMessage)

    // Listen for localStorage signal (fallback when window.opener is lost after cross-origin redirects)
    function handleStorage(event: StorageEvent) {
      if (event.key === "oauth_complete_signal" && event.newValue) {
        try {
          const data = JSON.parse(event.newValue)
          if (data.type === "oauth-complete" && data.email && data.token) {
            setEmailToken(data.email, data.token)
            toast.success(`Connected: ${data.email}`)
            setManualRefresh(r => r + 1)
          } else if (data.type === "oauth-error" && data.error) {
            toast.error(`OAuth error: ${data.error}`)
          }
          // Clean up the signal
          localStorage.removeItem("oauth_complete_signal")
        } catch {}
      }
    }
    window.addEventListener("storage", handleStorage)

    return () => {
      window.removeEventListener("message", handleMessage)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  // Merge account emails + manual emails
  const emailAccounts = useMemo(() => {
    const seen = new Set<string>()
    const result: Array<{ email: string; password: string; platform: string; username?: string }> = []

    // From account data
    for (const acc of accounts) {
      const email = acc.email
      const password = acc.emailPassword || acc.password || ""
      if (email && !seen.has(email)) {
        seen.add(email)
        result.push({ email, password, platform: acc.platform, username: acc.username })
      }
    }

    // From manually added
    for (const m of getManualEmails()) {
      if (!seen.has(m.email)) {
        seen.add(m.email)
        result.push({ email: m.email, password: m.password, platform: m.platform })
      }
    }

    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, manualRefresh])

  const tokens = useMemo(() => getEmailTokens(), [manualRefresh])

  const filteredEmails = useMemo(() => {
    if (!searchQuery) return emailAccounts
    const q = searchQuery.toLowerCase()
    return emailAccounts.filter(
      (e) => e.email.toLowerCase().includes(q) || e.username?.toLowerCase().includes(q)
    )
  }, [emailAccounts, searchQuery])

  const checkEmail = useCallback(async (email: string, password: string) => {
    setEmailResults((prev) => ({ ...prev, [email]: { loading: true } }))
    try {
      const token = getEmailTokens()[email]
      const body: Record<string, string> = { email }
      if (token) {
        body.refreshToken = token
      } else if (password) {
        body.password = password
      } else {
        setEmailResults((prev) => ({ ...prev, [email]: { loading: false, error: "Not connected — click Connect to authenticate via Microsoft OAuth" } }))
        return
      }

      // Route to correct API based on email provider
      const isGoogle = email.includes("@clso.us") || email.includes("@gmail.com") || email.includes("@googlemail.com")
      const endpoint = isGoogle ? "/api/email/check-google" : "/api/email/check"

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.error) {
        setEmailResults((prev) => ({ ...prev, [email]: { loading: false, error: data.error } }))
      } else {
        setEmailResults((prev) => ({ ...prev, [email]: { loading: false, emails: data.emails } }))
      }
    } catch {
      setEmailResults((prev) => ({ ...prev, [email]: { loading: false, error: "Connection failed" } }))
    }
  }, [])

  const checkAllConnected = useCallback(async () => {
    if (checkingAllRef.current) return
    checkingAllRef.current = true
    const currentTokens = getEmailTokens()
    const connected = emailAccounts.filter(a => currentTokens[a.email])
    if (connected.length === 0) {
      toast.error("No connected accounts to check")
      checkingAllRef.current = false
      return
    }
    toast.info(`Checking ${connected.length} connected inboxes...`)
    for (const acc of connected) {
      await checkEmail(acc.email, acc.password)
    }
    checkingAllRef.current = false
    toast.success("All connected inboxes checked!")
  }, [emailAccounts, checkEmail])

  function handleConnect(email: string) {
    // Route to the correct OAuth provider — opens in a new tab
    const isGoogle = email.includes("@clso.us") || email.includes("@gmail.com") || email.includes("@googlemail.com")
    const url = isGoogle
      ? `/api/email/oauth/google/authorize?email=${encodeURIComponent(email)}`
      : `/api/email/oauth/authorize?email=${encodeURIComponent(email)}`
    window.open(url, "_blank")
  }

  const selectedResult = selectedEmail ? emailResults[selectedEmail] : null

  return (
    <>
      <AddEmailModal open={addModalOpen} onOpenChange={setAddModalOpen} onAdded={() => setManualRefresh(r => r + 1)} />
      <div className="flex gap-4 h-[calc(100vh-280px)] min-h-[500px]">
        {/* Left: Email list */}
        <div className="w-80 lg:w-96 flex-shrink-0 border border-zinc-800 rounded-lg overflow-hidden flex flex-col bg-zinc-900/50">
          <div className="p-3 border-b border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                {emailAccounts.length} Email Accounts
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => setAddModalOpen(true)}>
                  <Plus className="h-3 w-3" />
                  Add
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={checkAllConnected}>
                  <RefreshCw className="h-3 w-3" />
                  Check All
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <Input
                placeholder="Filter emails..."
                className="pl-8 h-8 text-xs bg-zinc-800/50 border-zinc-700"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredEmails.map((acc) => {
              const result = emailResults[acc.email]
              const isSelected = selectedEmail === acc.email
              const plat = PLATFORM_META[acc.platform] || PLATFORM_META.instagram
              const isConnected = !!tokens[acc.email]
              return (
                <div
                  key={acc.email}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-zinc-800/50 transition-colors ${
                    isSelected ? "bg-zinc-800/60" : "hover:bg-zinc-800/30"
                  }`}
                  onClick={() => setSelectedEmail(acc.email)}
                >
                  <plat.icon className={`h-3.5 w-3.5 flex-shrink-0 ${plat.color}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${isConnected ? "bg-green-400" : "bg-red-400"}`} title={isConnected ? "OAuth Connected" : "Not Connected"} />
                      <p className="text-xs font-mono text-zinc-200 truncate">{acc.email}</p>
                    </div>
                    {acc.username && <p className="text-[10px] text-zinc-500 truncate ml-3.5">@{acc.username}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {result?.loading && <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />}
                    {result?.error && <AlertCircle className="h-3 w-3 text-red-400" />}
                    {result?.emails && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-zinc-800">{result.emails.length}</Badge>
                    )}
                    {!isConnected ? (
                      <button
                        onClick={() => handleConnect(acc.email)}
                        className="h-6 px-2 rounded flex items-center justify-center gap-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-[10px] font-medium transition-colors"
                        title={acc.email.includes("@clso.us") || acc.email.includes("@gmail.com") ? "Connect via Google" : "Connect via Microsoft"}
                      >
                        <LinkIcon className="h-3 w-3" />
                        Connect
                      </button>
                    ) : (
                      <button
                        onClick={() => checkEmail(acc.email, acc.password)}
                        className="h-6 w-6 rounded flex items-center justify-center hover:bg-zinc-700 transition-colors"
                        title="Check inbox"
                      >
                        <Inbox className="h-3 w-3 text-zinc-500" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {emailAccounts.length === 0 && (
              <div className="p-6 text-center text-zinc-600 text-xs">
                <Mail className="h-6 w-6 mx-auto mb-2 opacity-30" />
                <p>No email accounts yet</p>
                <p className="mt-1">Click &quot;Add&quot; to add an email account</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Email preview */}
        <div className="flex-1 border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/50 flex flex-col">
          {!selectedEmail ? (
            <div className="flex-1 flex items-center justify-center text-zinc-600">
              <div className="text-center">
                <Mail className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Select an email account</p>
                <p className="text-xs mt-1">Connect via OAuth, then check inbox</p>
              </div>
            </div>
          ) : selectedResult?.loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
          ) : selectedResult?.error ? (
            <div className="flex-1 flex items-center justify-center text-red-400">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">Connection Failed</p>
                <p className="text-xs mt-1 text-zinc-500 max-w-xs">{selectedResult.error}</p>
                {!tokens[selectedEmail] && (
                  <Button size="sm" className="mt-3 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleConnect(selectedEmail)}>
                    <LinkIcon className="h-3 w-3" /> {selectedEmail.includes("@clso.us") || selectedEmail.includes("@gmail.com") ? "Connect via Google" : "Connect via Microsoft"}
                  </Button>
                )}
              </div>
            </div>
          ) : selectedResult?.emails ? (
            <div className="flex-1 overflow-y-auto">
              <div className="p-3 border-b border-zinc-800">
                <p className="text-xs text-zinc-400">
                  <span className="font-mono">{selectedEmail}</span> — {selectedResult.emails.length} recent emails
                </p>
              </div>
              {selectedResult.emails.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-8 text-zinc-600 text-sm">
                  No emails found
                </div>
              ) : (
                selectedResult.emails.map((msg, i) => (
                  <div key={i} className="p-4 border-b border-zinc-800/50 hover:bg-zinc-800/20">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-medium text-zinc-200">{msg.subject}</p>
                      <span className="text-[10px] text-zinc-600 flex-shrink-0">
                        {msg.date ? new Date(msg.date).toLocaleDateString() : ""}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mb-2">{msg.from}</p>
                    <p className={`text-xs leading-relaxed ${
                      msg.snippet.startsWith("🔑") ? "text-amber-300 font-medium bg-amber-500/10 rounded px-2 py-1" : "text-zinc-400"
                    }`}>
                      {msg.snippet}
                    </p>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-600">
              <div className="text-center">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">
                  {tokens[selectedEmail] ? "Click the inbox icon to check" : "Connect this account first"}
                </p>
                {!tokens[selectedEmail] && (
                  <Button size="sm" className="mt-3 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleConnect(selectedEmail)}>
                    <LinkIcon className="h-3 w-3" /> {selectedEmail.includes("@clso.us") || selectedEmail.includes("@gmail.com") ? "Connect via Google" : "Connect via Microsoft"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AccountSetupPage() {
  // Account-setup page shows password/2FA/cookie under a "Show secrets"
  // toggle, so it explicitly opts into the secrets-included response.
  // Default /api/accounts/all response strips credentials (P0 from
  // Wave 9.7.5.T A&P testing).
  const { data, error, isLoading, mutate } = useSWR("/api/accounts/all?include_secrets=1", fetcher, {
    revalidateOnFocus: false,
  })

  const accounts: AccountRecord[] = data?.accounts || []
  const [platformFilter, setPlatformFilter] = useState<Platform>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [mainTab, setMainTab] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      if (params.get("tab") === "email" || params.get("tab") === "inbox") return "email"
    }
    return "accounts"
  })

  const filtered = useMemo(() => {
    let list = accounts
    if (platformFilter !== "all") {
      list = list.filter((a) => a.platform === platformFilter)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (a) =>
          a.username?.toLowerCase().includes(q) ||
          a.email?.toLowerCase().includes(q) ||
          a.displayName?.toLowerCase().includes(q) ||
          a.goLoginName?.toLowerCase().includes(q)
      )
    }
    return list
  }, [accounts, platformFilter, searchQuery])

  const counts = useMemo(() => ({
    all: accounts.length,
    instagram: accounts.filter((a) => a.platform === "instagram").length,
    facebook: accounts.filter((a) => a.platform === "facebook").length,
    linkedin: accounts.filter((a) => a.platform === "linkedin").length,
    ready: accounts.filter((a) => a.goLoginStatus === "ready").length,
    noProxy: accounts.filter((a) => a.goLoginStatus === "no-proxy").length,
    notSetup: accounts.filter((a) => a.goLoginStatus === "not-setup").length,
    loggedIn: accounts.filter((a) => a.goLoginHasSession).length,
    needsLogin: accounts.filter((a) => a.goLoginId && !a.goLoginHasSession).length,
  }), [accounts])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Account Manager</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {counts.all} accounts &middot;{" "}
            <span className="text-green-400">{counts.loggedIn} logged in</span> &middot;{" "}
            <span className="text-yellow-400">{counts.needsLogin} needs login</span> &middot;{" "}
            <span className="text-zinc-500">{counts.notSetup} not set up</span>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-zinc-700 text-zinc-300"
          onClick={() => mutate()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Main tabs: Accounts / Email Inbox */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="accounts" className="gap-2 data-[state=active]:bg-zinc-800">
            <Users className="h-4 w-4" />
            Accounts
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2 data-[state=active]:bg-zinc-800">
            <Mail className="h-4 w-4" />
            Email Inbox
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4 space-y-3">
          {/* How-to banner */}
          <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300/80 space-y-1">
            <div><strong className="text-blue-300">How to log in:</strong> Click <strong>Open GoLogin</strong> → find the profile in GoLogin → run it → log into the account → stop the profile in GoLogin to save your session.</div>
            <div className="text-zinc-500">💡 Status updates automatically when you refresh this page.</div>
            {counts.needsLogin > 0 && (
              <div className="text-yellow-400 font-medium">{counts.needsLogin} accounts still need login</div>
            )}
          </div>
          {/* Filters bar */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Platform filter pills */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
              {(["all", "instagram", "facebook", "linkedin"] as const).map((p) => {
                const isActive = platformFilter === p
                const meta = p === "all" ? null : PLATFORM_META[p]
                const count = p === "all" ? counts.all : counts[p]
                return (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(p)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-zinc-800 text-zinc-100 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {meta && <meta.icon className={`h-3.5 w-3.5 ${isActive ? meta.color : ""}`} />}
                    {p === "all" ? "All" : meta?.label}
                    <span className="text-[10px] text-zinc-600">{count}</span>
                  </button>
                )
              })}
            </div>

            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <Input
                placeholder="Search accounts..."
                className="pl-8 h-8 text-xs bg-zinc-900 border-zinc-800"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-sm text-red-400">
              Failed to load accounts. Check the server logs.
            </div>
          )}

          {/* Loading skeleton */}
          {isLoading && !data && (
            <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/50">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 animate-pulse">
                  <div className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                  <div className="h-4 w-4 rounded bg-zinc-800" />
                  <div className="h-3 w-32 rounded bg-zinc-800" />
                  <div className="flex-1" />
                  <div className="h-3 w-40 rounded bg-zinc-800" />
                </div>
              ))}
            </div>
          )}

          {/* Account table */}
          {data && (
            <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/50">
              {/* Table header */}
              <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border-b border-zinc-800 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                <div className="w-4" /> {/* chevron */}
                <div className="w-2.5" /> {/* status dot */}
                <div className="w-4" /> {/* platform icon */}
                <div className="flex-1">Account</div>
                <div className="hidden md:block w-56">Email</div>
                <div className="hidden lg:block w-36">Proxy</div>
                <div className="hidden lg:block w-28">Status</div>
                <div className="w-28">Actions</div>
              </div>

              {/* Rows */}
              {filtered.length > 0 ? (
                filtered.map((acc) => (
                  <AccountRow key={`${acc.platform}-${acc.index}`} account={acc} onRefresh={() => mutate()} />
                ))
              ) : (
                <div className="p-8 text-center text-zinc-600 text-sm">
                  No accounts match your filters
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          <EmailInboxTab accounts={accounts} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
