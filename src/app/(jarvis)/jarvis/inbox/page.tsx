"use client"

/**
 * /jarvis/inbox — full-page inbox view (also accessible via the bell drawer).
 *
 * The bell button in JarvisHeader opens the same content as a slide-in drawer
 * for quick triage. This page is the deep-linkable URL for sharing or
 * keeping inbox open in a separate tab/window.
 */

import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Bell, RefreshCw, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { enterJarvis } from "@/components/jarvis/motion/presets"
import { cn } from "@/lib/utils"

type Notification = {
  id: string
  type: string | null
  title: string | null
  message: string | null
  read_at: string | null
  created_at: string
  source_kind?: string | null
}

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime()
  const m = Math.floor((Date.now() - t) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function typeTone(type: string | null): string {
  if (!type) return "border-mem-border bg-mem-surface-2"
  if (type.includes("fail") || type.includes("error") || type.includes("stuck"))
    return "border-mem-status-stuck/40 bg-mem-status-stuck/5"
  if (type.includes("warn") || type.includes("limit") || type.includes("cooldown"))
    return "border-mem-status-thinking/40 bg-mem-status-thinking/5"
  if (type.includes("proposal") || type.includes("ready") || type.includes("agent"))
    return "border-mem-status-needs/40 bg-mem-status-needs/5"
  return "border-mem-border bg-mem-surface-2"
}

export default function JarvisInboxPage() {
  const reduced = useReducedMotion() ?? false
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "unread">("unread")

  async function refresh() {
    try {
      const res = await fetch("/api/notifications?limit=200", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setItems(Array.isArray(json?.notifications) ? json.notifications : json?.data || [])
      setError(null)
    } catch (e: any) {
      setError(e?.message || "fetch failed")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [])

  async function markAllRead() {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      })
      await refresh()
    } catch {}
  }

  const filtered = filter === "unread" ? items.filter((i) => !i.read_at) : items
  const unreadCount = items.filter((i) => !i.read_at).length

  return (
    <motion.div {...enterJarvis} className="mx-auto w-full max-w-[1024px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">INBOX</p>
          <h1 className="text-2xl font-medium text-mem-text-primary">Notifications</h1>
          <p className="mt-1 text-sm text-mem-text-secondary">
            Every alert agents and crons send your way. Bell icon in the header opens the same view as a slide-in drawer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-mem-border bg-mem-surface-1 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-mem-text-secondary transition hover:bg-mem-surface-2 hover:text-mem-text-primary"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            Refresh
          </button>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-1 rounded-md border border-mem-border bg-mem-surface-1 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-mem-text-secondary transition hover:bg-mem-surface-2 hover:text-mem-text-primary disabled:opacity-40"
          >
            <CheckCircle2 className="h-3 w-3" />
            Mark all read
          </button>
        </div>
      </header>

      {/* Filter */}
      <div className="mb-4 flex items-center gap-2">
        {[
          { id: "unread", label: `Unread (${unreadCount})` },
          { id: "all", label: `All (${items.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id as any)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-[12px] font-medium transition",
              filter === tab.id
                ? "border-mem-accent/40 bg-mem-accent/10 text-mem-accent"
                : "border-mem-border bg-mem-surface-1 text-mem-text-secondary hover:bg-mem-surface-2 hover:text-mem-text-primary",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && items.length === 0 ? (
        <div className="rounded-xl border border-mem-status-stuck/40 bg-mem-status-stuck/5 p-4 text-sm text-mem-text-primary">
          Couldn't load notifications — {error}
        </div>
      ) : null}

      {filtered.length === 0 && !loading ? (
        <div className="rounded-xl border border-mem-border bg-mem-surface-1 p-10 text-center">
          <Bell className="mx-auto mb-3 h-8 w-8 text-mem-text-muted" />
          <p className="text-sm text-mem-text-secondary">
            {filter === "unread" ? "Inbox zero ✨" : "Nothing here yet."}
          </p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {filtered.map((n) => (
          <motion.li
            key={n.id}
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16 }}
            className={cn(
              "flex flex-wrap items-start gap-3 rounded-lg border p-4 transition",
              typeTone(n.type),
              !n.read_at && "ring-1 ring-mem-accent/20",
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-mem-text-muted">{n.type || "note"}</span>
                <span className="font-mono text-[10px] text-mem-text-muted">·</span>
                <span className="font-mono text-[10px] text-mem-text-muted">{fmtRelative(n.created_at)}</span>
                {!n.read_at ? (
                  <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-mem-accent" />
                ) : null}
              </div>
              <p className="mt-1 text-sm font-medium text-mem-text-primary">{n.title || n.type}</p>
              {n.message ? <p className="mt-1 text-sm text-mem-text-secondary">{n.message}</p> : null}
            </div>
          </motion.li>
        ))}
      </ul>

      <p className="mt-6 font-mono text-[10px] text-mem-text-muted">
        Inbox auto-refreshes every 30s. New entries arrive via{" "}
        <Link href="/jarvis/status" className="text-mem-accent underline-offset-2 hover:underline">
          /jarvis/status crons
        </Link>{" "}
        and the seeder cron (every 15 min when the schedule is enabled).
      </p>
    </motion.div>
  )
}
