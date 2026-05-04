"use client"

/**
 * SystemHealthStrip
 *
 * Top-of-/accounts strip that surfaces:
 *   - VPS infra health (Chrome, Xvfb, proxy, queue) from /api/recordings/health
 *   - Per-status totals derived from the parent page's `accounts` state — no
 *     extra fetch, updates every poll tick (PR #100).
 *   - Live-probe verdict per platform (instagram/facebook/linkedin/tiktok)
 *     from the same parent state.
 *
 * Designed for "show, don't tell": every pill has a tooltip with the WHY,
 * the colors are honest (green = working, amber = needs attention, red =
 * broken), and counts are live.
 */

import { useEffect, useState } from "react"
import { CheckCircle2, AlertTriangle, XCircle, Activity, Server, Globe, Shield, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type VpsHealth = {
  chrome?: boolean
  xvfb?: boolean
  proxy?: boolean
  queueProcessor?: boolean
  recording?: boolean
}

interface AccountLike {
  account_id: string
  platform: string
  session_status?: string
  status?: string
  has_auth_cookie?: boolean
  live_probe_logged_in?: boolean | null
}

function effectiveStatus(a: AccountLike): string {
  if (a.session_status) return a.session_status
  return a.status || "pending_setup"
}

interface Props {
  accounts: AccountLike[]
  proxyCount: number
}

export function SystemHealthStrip({ accounts, proxyCount }: Props) {
  const [vps, setVps] = useState<VpsHealth | null>(null)
  const [vpsLoading, setVpsLoading] = useState(true)
  const [vpsError, setVpsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function tick() {
      try {
        const r = await fetch("/api/recordings/health", {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        })
        if (!r.ok) throw new Error(`health ${r.status}`)
        const j = await r.json()
        if (!cancelled) {
          setVps(j)
          setVpsError(null)
          setVpsLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setVpsError(e instanceof Error ? e.message : "unreachable")
          setVpsLoading(false)
        }
      }
    }
    tick()
    // 60s — slow enough that we're not pinging the VPS every 5s, fast
    // enough to see chrome restarts within a minute. Same cadence as the
    // accounts polling loop's "wakeup-on-tab-visible" trigger.
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        tick()
      }
    }, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // Derive per-status counts from the live accounts list — no extra DB call.
  const totals = (() => {
    const counts: Record<string, number> = {
      active: 0, warming: 0, needs_signin: 0, expired: 0, banned: 0, cooldown: 0, paused: 0,
    }
    let withAuthCookie = 0
    let liveProbeFalse = 0
    for (const a of accounts) {
      const s = effectiveStatus(a)
      counts[s] = (counts[s] || 0) + 1
      if (a.has_auth_cookie) withAuthCookie += 1
      if (a.live_probe_logged_in === false) liveProbeFalse += 1
    }
    return { counts, total: accounts.length, withAuthCookie, liveProbeFalse }
  })()

  // VPS overall pill: green if all 4 critical bits are true, amber if any
  // are false, red on fetch error. We treat `recording` as nice-to-have
  // (used for /recordings/start which most users won't touch daily).
  const critical = vps ? (vps.chrome && vps.xvfb && vps.proxy && vps.queueProcessor) : false
  const vpsTone: "good" | "warn" | "bad" | "loading" =
    vpsLoading ? "loading"
    : vpsError ? "bad"
    : critical ? "good"
    : "warn"

  // Per-platform login health (only platforms the live probe supports)
  const PLATFORM_PROBE_SUPPORTED = new Set(["instagram", "facebook", "linkedin", "tiktok"])
  const platformHealth = (() => {
    const out: Record<string, { active: number; needs: number; total: number }> = {}
    for (const a of accounts) {
      const p = (a.platform || "").toLowerCase()
      if (!PLATFORM_PROBE_SUPPORTED.has(p)) continue
      if (!out[p]) out[p] = { active: 0, needs: 0, total: 0 }
      out[p].total += 1
      const s = effectiveStatus(a)
      if (s === "active" || s === "warming") out[p].active += 1
      else if (s === "needs_signin" || s === "expired") out[p].needs += 1
    }
    return out
  })()

  return (
    <div className="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm p-3 flex flex-wrap items-center gap-2 text-[11px]">
      {/* VPS overall pill */}
      <Pill
        tone={vpsTone}
        title={
          vpsError ? `VPS unreachable: ${vpsError}`
          : !vps ? "Probing the VPS…"
          : `Chrome ${vps.chrome ? "✓" : "✗"} · Xvfb ${vps.xvfb ? "✓" : "✗"} · Proxy ${vps.proxy ? "✓" : "✗"} · Queue ${vps.queueProcessor ? "✓" : "✗"}`
        }
      >
        {vpsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Server className="h-3 w-3" />}
        <span className="font-medium">VPS</span>
        <span className={cn("opacity-80", vpsTone === "bad" && "text-red-300")}>
          {vpsLoading ? "checking" : vpsError ? "unreachable" : critical ? "healthy" : "degraded"}
        </span>
      </Pill>

      {/* Account totals */}
      <Pill tone="muted" title={`${totals.total} total accounts across all groups`}>
        <Shield className="h-3 w-3" />
        <span>{totals.total} accounts</span>
      </Pill>
      {totals.counts.active > 0 && (
        <Pill tone="good" title={`${totals.counts.active} accounts logged in and ready to send`}>
          <CheckCircle2 className="h-3 w-3" />
          <span>{totals.counts.active} active</span>
        </Pill>
      )}
      {totals.counts.warming > 0 && (
        <Pill tone="warn" title={`${totals.counts.warming} accounts in warmup ramp`}>
          <Activity className="h-3 w-3" />
          <span>{totals.counts.warming} warming</span>
        </Pill>
      )}
      {(totals.counts.needs_signin > 0 || totals.counts.expired > 0) && (
        <Pill tone="bad" title={`${totals.counts.needs_signin + totals.counts.expired} accounts need a fresh login`}>
          <AlertTriangle className="h-3 w-3" />
          <span>{totals.counts.needs_signin + totals.counts.expired} need sign-in</span>
        </Pill>
      )}
      {totals.counts.banned > 0 && (
        <Pill tone="bad" title={`${totals.counts.banned} accounts banned by the platform`}>
          <XCircle className="h-3 w-3" />
          <span>{totals.counts.banned} banned</span>
        </Pill>
      )}
      {totals.counts.cooldown > 0 && (
        <Pill tone="warn" title={`${totals.counts.cooldown} accounts on platform-imposed cooldown`}>
          <AlertTriangle className="h-3 w-3" />
          <span>{totals.counts.cooldown} cooldown</span>
        </Pill>
      )}

      {/* Proxy total */}
      <Pill tone="muted" title={`${proxyCount} proxy groups configured`}>
        <Globe className="h-3 w-3" />
        <span>{proxyCount} proxies</span>
      </Pill>

      <div className="flex-1" />

      {/* Per-platform mini-pills (only for platforms the live probe supports) */}
      {Object.entries(platformHealth).map(([p, h]) => {
        const tone = h.needs > 0 ? "warn" : h.active === h.total ? "good" : "muted"
        return (
          <Pill
            key={p}
            tone={tone}
            title={`${p}: ${h.active}/${h.total} logged in${h.needs > 0 ? `, ${h.needs} need sign-in` : ""}`}
          >
            <span className="capitalize">{p}</span>
            <span className="font-mono">
              {h.active}/{h.total}
            </span>
          </Pill>
        )
      })}
    </div>
  )
}

function Pill({
  tone = "muted",
  title,
  children,
}: {
  tone?: "good" | "warn" | "bad" | "muted" | "loading"
  title?: string
  children: React.ReactNode
}) {
  const palette: Record<string, string> = {
    good: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
    warn: "bg-amber-500/10 border-amber-500/30 text-amber-300",
    bad: "bg-red-500/10 border-red-500/30 text-red-300",
    muted: "bg-muted/30 border-border/40 text-muted-foreground",
    loading: "bg-violet-500/10 border-violet-500/30 text-violet-300",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md border whitespace-nowrap",
        palette[tone] || palette.muted
      )}
      title={title}
    >
      {children}
    </span>
  )
}
