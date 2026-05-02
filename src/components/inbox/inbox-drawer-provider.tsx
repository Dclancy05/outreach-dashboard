"use client"
/**
 * Inbox drawer context — owns open/close state + notification list state
 * (read/unread). Both <InboxBell /> and <InboxDrawer /> read from here so
 * the bell badge and the drawer share one source of truth.
 *
 * Notifications fetched from /api/notifications. Polled every 30s while the
 * provider is mounted.
 */
import * as React from "react"

export interface DBNotification {
  id: string
  type: string
  title: string | null
  message: string | null
  read: boolean
  created_at: string
  source_kind?: string | null
  source_id?: string | null
}

interface InboxDrawerContext {
  isOpen: boolean
  isMounted: boolean
  open: () => void
  close: () => void
  toggle: () => void
  notifications: DBNotification[]
  unreadCount: number
  loading: boolean
  refresh: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

const Ctx = React.createContext<InboxDrawerContext | null>(null)

const POLL_MS = 30_000

export function InboxDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [isMounted, setIsMounted] = React.useState(false)
  const [notifications, setNotifications] = React.useState<DBNotification[]>([])
  const [unreadCount, setUnreadCount] = React.useState(0)
  const [loading, setLoading] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/notifications?limit=40", { cache: "no-store" })
      if (r.ok) {
        const j = await r.json()
        setNotifications(j.data || [])
        setUnreadCount(j.unread_count || 0)
      }
    } catch {
      /* ignore network errors */
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  const open = React.useCallback(() => {
    setIsMounted(true)
    setIsOpen(true)
    // refresh on open so the drawer shows fresh data immediately
    refresh()
  }, [refresh])

  const close = React.useCallback(() => setIsOpen(false), [])

  const toggle = React.useCallback(() => {
    setIsMounted((m) => m || true)
    setIsOpen((o) => {
      if (!o) refresh()
      return !o
    })
  }, [refresh])

  const markRead = React.useCallback(async (id: string) => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setUnreadCount((c) => Math.max(0, c - 1))
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", id }),
      })
    } catch {
      // rollback would re-fetch — simpler: silent fail and let next poll fix
    }
  }, [])

  const markAllRead = React.useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", mark_all: true }),
      })
    } catch {
      /* ignore */
    }
  }, [])

  const value = React.useMemo<InboxDrawerContext>(
    () => ({
      isOpen,
      isMounted,
      open,
      close,
      toggle,
      notifications,
      unreadCount,
      loading,
      refresh,
      markRead,
      markAllRead,
    }),
    [isOpen, isMounted, open, close, toggle, notifications, unreadCount, loading, refresh, markRead, markAllRead]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useInboxDrawer(): InboxDrawerContext {
  const ctx = React.useContext(Ctx)
  if (!ctx) {
    throw new Error("useInboxDrawer must be used inside <InboxDrawerProvider>")
  }
  return ctx
}

/** Emoji prefix for each notification type (matches prototype palette). */
export const NOTIFICATION_EMOJI: Record<string, string> = {
  agent_proposal: "🤖",
  run_failed: "🚨",
  account_health: "⚠️",
  stripe_alert: "💳",
  system: "📦",
}

/** Color token for the leading status dot. */
export const NOTIFICATION_DOT_COLOR: Record<string, string> = {
  agent_proposal: "bg-mem-status-needs",
  run_failed: "bg-mem-status-stuck",
  account_health: "bg-mem-status-thinking",
  stripe_alert: "bg-mem-status-stuck",
  system: "bg-mem-status-idle",
}

export function isNeedsMe(n: DBNotification): boolean {
  return (
    n.type === "agent_proposal" ||
    n.type === "account_health" ||
    n.type === "stripe_alert"
  )
}
