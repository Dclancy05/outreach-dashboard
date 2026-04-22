"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type Health = "healthy" | "stale" | "expired" | "unknown"

interface Props {
  accountId: string
  // If parent already has cookies_updated_at + cookies_health on the account row,
  // pass them to avoid an extra fetch. Missing props will trigger a GET.
  initialHealth?: Health | string | null
  initialUpdatedAt?: string | null
  className?: string
  onRefresh?: () => void
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never"
  const ms = Date.now() - new Date(iso).getTime()
  if (isNaN(ms)) return "never"
  const min = Math.floor(ms / 60000)
  if (min < 1) return "just now"
  if (min < 60) return `${min} min ago`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

const LOOK: Record<
  Health,
  { dot: string; bg: string; text: string; label: string }
> = {
  healthy: {
    dot: "bg-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/30",
    text: "text-emerald-300",
    label: "Healthy",
  },
  stale: {
    dot: "bg-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
    text: "text-amber-300",
    label: "Stale",
  },
  expired: {
    dot: "bg-red-400",
    bg: "bg-red-500/10 border-red-500/30",
    text: "text-red-300",
    label: "Expired",
  },
  unknown: {
    dot: "bg-zinc-400",
    bg: "bg-zinc-500/10 border-zinc-500/30",
    text: "text-zinc-300",
    label: "Unknown",
  },
}

export function CookieHealthBadge({
  accountId,
  initialHealth,
  initialUpdatedAt,
  className,
  onRefresh,
}: Props) {
  const [health, setHealth] = useState<Health>(
    (initialHealth as Health) || "unknown"
  )
  const [updatedAt, setUpdatedAt] = useState<string | null>(
    initialUpdatedAt || null
  )
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (initialHealth && initialUpdatedAt !== undefined) return
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const r = await fetch(
          `/api/accounts/${encodeURIComponent(accountId)}/cookies/health`,
          { cache: "no-store" }
        )
        if (!r.ok) return
        const data = await r.json()
        if (cancelled) return
        setHealth((data.health as Health) || "unknown")
        setUpdatedAt(data.updated_at || null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accountId, initialHealth, initialUpdatedAt])

  const look = LOOK[health] || LOOK.unknown
  const savedLabel =
    health === "unknown" && !updatedAt
      ? "No session saved"
      : `Saved ${relativeTime(updatedAt)}`

  return (
    <div
      title={`Cookie health: ${look.label}. ${savedLabel}.`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        look.bg,
        look.text,
        className
      )}
      onClick={onRefresh}
      role={onRefresh ? "button" : undefined}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", look.dot, loading && "animate-pulse")} />
      <span>{look.label}</span>
      <span className="opacity-70">· {savedLabel}</span>
    </div>
  )
}
