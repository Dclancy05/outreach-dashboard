"use client"
/**
 * Right-edge slide-in drawer (z-50/51 — Terminals stays on z-60/61 so they
 * coexist). Renders grouped notification list with filter pills and a
 * "Mark all read" footer.
 *
 * Wired to the dashboard's existing /api/notifications route via
 * <InboxDrawerProvider />.
 */
import * as React from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { X, CheckCheck, Inbox as InboxIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  useInboxDrawer,
  NOTIFICATION_EMOJI,
  NOTIFICATION_DOT_COLOR,
  isNeedsMe,
  type DBNotification,
} from "./inbox-drawer-provider"

type FilterId = "all" | "needs" | "updates"

const FILTER_LABELS: Record<FilterId, string> = {
  all: "All",
  needs: "Needs you",
  updates: "Updates",
}

export function InboxDrawer() {
  const {
    isOpen, isMounted, close,
    notifications, unreadCount, markRead, markAllRead, loading,
  } = useInboxDrawer()
  const [filter, setFilter] = React.useState<FilterId>("all")
  const reduceMotion = useReducedMotion()

  React.useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, close])

  React.useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  if (!isMounted) return null

  const filtered = notifications.filter((n) => {
    if (filter === "all") return true
    if (filter === "needs") return isNeedsMe(n)
    return !isNeedsMe(n)
  })

  const groups = groupByDay(filtered)

  const panelTransition = reduceMotion
    ? { duration: 0.12 }
    : { type: "spring" as const, stiffness: 320, damping: 32, mass: 0.9 }
  const panelInitial = reduceMotion ? { opacity: 0 } : { x: "100%" }
  const panelAnimate = reduceMotion ? { opacity: 1 } : { x: 0 }
  const panelExit = reduceMotion ? { opacity: 0 } : { x: "100%" }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="inbox-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[50] bg-black/40 backdrop-blur-sm"
            onClick={close}
            aria-hidden
          />
          <motion.aside
            key="inbox-panel"
            initial={panelInitial}
            animate={panelAnimate}
            exit={panelExit}
            transition={panelTransition}
            className={cn(
              "fixed right-0 top-0 z-[51] h-screen flex flex-col",
              "w-full sm:w-[380px]",
              "bg-mem-surface-1 border-l border-mem-border shadow-2xl"
            )}
            role="dialog"
            aria-label="Inbox"
            aria-modal="false"
          >
            <header className="shrink-0 border-b border-mem-border">
              <div className="h-12 px-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-mem-text-primary">
                  <InboxIcon size={15} className="text-mem-accent" />
                  <span className="text-[15px] font-semibold">Inbox</span>
                  {unreadCount > 0 && (
                    <span className="font-mono text-[11px] text-mem-text-muted">
                      {unreadCount} unread
                    </span>
                  )}
                </div>
                <button
                  onClick={close}
                  aria-label="Close inbox"
                  className="h-7 w-7 grid place-items-center rounded-md text-mem-text-muted hover:text-mem-text-primary hover:bg-mem-surface-2 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="px-4 pb-3 flex items-center gap-1.5">
                {(Object.keys(FILTER_LABELS) as FilterId[]).map((id) => (
                  <button
                    key={id}
                    onClick={() => setFilter(id)}
                    className={cn(
                      "h-7 px-3 rounded-full text-[12px] font-medium transition-colors border",
                      filter === id
                        ? "bg-mem-surface-3 border-mem-border-strong text-mem-text-primary"
                        : "bg-mem-surface-2 border-mem-border text-mem-text-secondary hover:text-mem-text-primary"
                    )}
                  >
                    {FILTER_LABELS[id]}
                  </button>
                ))}
              </div>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
              {loading && notifications.length === 0 ? (
                <div className="px-6 py-12 text-center text-[13px] text-mem-text-muted">
                  Loading…
                </div>
              ) : groups.length === 0 ? (
                <div className="px-6 py-12 text-center text-[13px] text-mem-text-muted">
                  Nothing here. You&apos;re all caught up.
                </div>
              ) : (
                groups.map((g) => (
                  <section key={g.label} className="py-2">
                    <h3 className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-[0.04em] font-semibold text-mem-text-muted">
                      {g.label}
                    </h3>
                    <ul className="divide-y divide-mem-border/40">
                      {g.items.map((n) => (
                        <NotificationRow key={n.id} n={n} onResolve={() => markRead(n.id)} />
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>

            <footer className="shrink-0 border-t border-mem-border bg-mem-surface-1 px-4 py-3 flex items-center justify-between">
              <span className="text-[11px] text-mem-text-muted">
                {notifications.length} total
              </span>
              <button
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className={cn(
                  "h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-[12px] font-medium transition-colors border",
                  unreadCount === 0
                    ? "bg-mem-surface-2 border-mem-border text-mem-text-muted cursor-not-allowed"
                    : "bg-mem-surface-3 border-mem-border-strong text-mem-text-primary hover:border-mem-accent/40"
                )}
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function NotificationRow({ n, onResolve }: { n: DBNotification; onResolve: () => void }) {
  const dot = NOTIFICATION_DOT_COLOR[n.type] || "bg-mem-status-idle"
  const emoji = NOTIFICATION_EMOJI[n.type] || "•"
  return (
    <li
      className={cn(
        "px-4 py-3 transition-colors",
        !n.read ? "bg-mem-accent/5" : "hover:bg-mem-surface-2/40"
      )}
    >
      <div className="flex items-start gap-2.5">
        <span aria-hidden className={cn("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                "text-[13px] leading-tight truncate",
                n.read ? "text-mem-text-secondary" : "text-mem-text-primary font-medium"
              )}
            >
              <span className="mr-1.5" aria-hidden>{emoji}</span>
              {n.title || "(untitled)"}
            </p>
            <span className="shrink-0 font-mono text-[10px] text-mem-text-muted whitespace-nowrap">
              {relativeTime(n.created_at)}
            </span>
          </div>
          {n.message && (
            <p className="mt-0.5 text-[12px] text-mem-text-muted line-clamp-2">{n.message}</p>
          )}
          {!n.read && (
            <div className="mt-1.5">
              <button
                onClick={onResolve}
                className="h-6 px-2 rounded-md bg-mem-surface-3 border border-mem-border text-[11px] font-medium text-mem-text-secondary hover:text-mem-text-primary hover:border-mem-border-strong transition-colors"
              >
                Resolve
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

interface DayGroup {
  label: string
  items: DBNotification[]
}

function groupByDay(items: DBNotification[]): DayGroup[] {
  if (items.length === 0) return []
  const sorted = [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const today = startOfDay(new Date())
  const yesterday = new Date(today.getTime() - 86400000)
  const buckets = new Map<string, DBNotification[]>()
  const orderedKeys: string[] = []
  for (const n of sorted) {
    const d = startOfDay(new Date(n.created_at))
    let label: string
    if (d.getTime() === today.getTime()) label = "Today"
    else if (d.getTime() === yesterday.getTime()) label = "Yesterday"
    else
      label = d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    if (!buckets.has(label)) {
      buckets.set(label, [])
      orderedKeys.push(label)
    }
    buckets.get(label)!.push(n)
  }
  return orderedKeys.map((label) => ({ label, items: buckets.get(label)! }))
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function relativeTime(iso: string): string {
  const ts = new Date(iso).getTime()
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const d = Math.floor(hr / 24)
  return `${d}d`
}
