"use client"

/**
 * PopupTrustBar
 *
 * Compact strip rendered inside the Sign In Now modal showing the user
 * exactly which Chrome / proxy / profile they're connected to. Patterned
 * after Browserbase's session bar and the proxy-status pills used by
 * GoLogin / AdsPower / Multilogin — surface enough identity info that the
 * user can trust they're typing real credentials into the right place.
 *
 * Data source: GET /api/accounts/:id/session-info (public-safe subset of
 * the account row + proxy_groups + account_fingerprints — never includes
 * proxy username or password).
 */

import { useEffect, useState } from "react"
import { Globe, MapPin, FolderOpen, Hash, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface SessionInfo {
  account_id: string
  platform: string
  username: string | null
  proxy: {
    ip: string | null
    port: number | null
    provider: string | null
    city: string | null
    state: string | null
    country: string | null
    status: string | null
  } | null
  profile: { dir: string | null; label: string }
  vnc: { session_id: string; framebuffer: string }
}

type ConnState = "idle" | "connecting" | "connected" | "reconnecting" | "error"

interface PopupTrustBarProps {
  accountId?: string
  /** Live state from the VNC viewer — drives the connection pill color. */
  vncState?: ConnState
  className?: string
}

export default function PopupTrustBar({ accountId, vncState, className }: PopupTrustBarProps) {
  const [info, setInfo] = useState<SessionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!accountId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/accounts/${encodeURIComponent(accountId)}/session-info`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`session-info ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (!cancelled) setInfo(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "couldn't load session info")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [accountId])

  if (!accountId) return null

  // Derive the connection pill color from the live VNC state.
  const conn = (() => {
    if (vncState === "connected") return { color: "emerald", text: "Connected", icon: CheckCircle2 }
    if (vncState === "connecting") return { color: "violet", text: "Connecting…", icon: Loader2, spin: true }
    if (vncState === "reconnecting") return { color: "amber", text: "Reconnecting…", icon: Loader2, spin: true }
    if (vncState === "error") return { color: "red", text: "Connection error", icon: AlertTriangle }
    return { color: "muted", text: "Idle", icon: Loader2 }
  })()
  const ConnIcon = conn.icon

  const proxyLabel = info?.proxy?.ip
    ? `${info.proxy.ip}${info.proxy.port ? `:${info.proxy.port}` : ""}`
    : loading
    ? "loading…"
    : "no proxy"
  const proxyLocation = (() => {
    if (!info?.proxy) return null
    const parts = [info.proxy.city, info.proxy.state, info.proxy.country].filter(Boolean)
    return parts.length ? parts.join(", ") : null
  })()

  const profileLabel = info?.profile?.label || (loading ? "loading…" : "main")

  return (
    <div
      className={cn(
        "shrink-0 border-b border-border/40 bg-card/60 backdrop-blur px-3 py-1.5",
        "flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground",
        className
      )}
      role="status"
      aria-label="Browser session identity bar"
    >
      {/* Proxy pill */}
      <Pill
        color={info?.proxy?.ip ? "emerald" : "amber"}
        title={
          info?.proxy
            ? `Outbound IP — Chrome connects to platforms through this residential proxy.${
                info.proxy.provider ? `\nProvider: ${info.proxy.provider}` : ""
              }${info.proxy.status ? `\nStatus: ${info.proxy.status}` : ""}`
            : "No residential proxy configured for this account — direct internet (high ban risk)."
        }
      >
        <Globe className="h-3 w-3" />
        <span className="font-mono">{proxyLabel}</span>
      </Pill>

      {/* Location pill (only if known) */}
      {proxyLocation && (
        <Pill color="muted" title={`Proxy reported location: ${proxyLocation}`}>
          <MapPin className="h-3 w-3" />
          <span>{proxyLocation}</span>
        </Pill>
      )}

      {/* Provider pill (only if known and distinct from IP) */}
      {info?.proxy?.provider && (
        <Pill color="muted" title="Proxy provider">
          <span className="opacity-70">via</span>
          <span className="font-medium">{info.proxy.provider}</span>
        </Pill>
      )}

      {/* Profile pill */}
      <Pill color="muted" title={`Chrome profile: ${info?.profile?.dir || "(unknown)"} — cookies + history persist here.`}>
        <FolderOpen className="h-3 w-3" />
        <span className="font-mono">{profileLabel}</span>
      </Pill>

      {/* Session pill */}
      {info?.vnc?.session_id && (
        <Pill color="muted" title={`VNC session id — Phase 2 will swap to per-group sessions.`}>
          <Hash className="h-3 w-3" />
          <span className="font-mono">{info.vnc.session_id}</span>
        </Pill>
      )}

      <div className="flex-1" />

      {/* Connection status */}
      <Pill color={conn.color} title={`Live VNC connection state.`}>
        <ConnIcon className={cn("h-3 w-3", conn.spin && "animate-spin")} />
        <span>{conn.text}</span>
      </Pill>

      {error && (
        <Pill color="red" title={error}>
          <AlertTriangle className="h-3 w-3" />
          <span>session-info error</span>
        </Pill>
      )}
    </div>
  )
}

function Pill({
  color = "muted",
  title,
  children,
}: {
  color?: string
  title?: string
  children: React.ReactNode
}) {
  const palette: Record<string, string> = {
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
    violet: "bg-violet-500/10 border-violet-500/30 text-violet-300",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-300",
    red: "bg-red-500/10 border-red-500/30 text-red-300",
    muted: "bg-muted/30 border-border/40 text-muted-foreground",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border whitespace-nowrap",
        palette[color] || palette.muted
      )}
      title={title}
    >
      {children}
    </span>
  )
}
