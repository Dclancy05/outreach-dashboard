"use client"
import { useState, useEffect, useRef } from "react"
import { Bell, Check, CheckCheck } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { cn } from "@/lib/utils"

type Notification = {
  id: string
  type: string
  title: string | null
  message: string | null
  read: boolean
  created_at: string
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const fetchItems = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/notifications?limit=10", { cache: "no-store" })
      const j = await res.json()
      setItems(j.data || [])
      setUnreadCount(j.unread_count || 0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    fetchItems()
    const i = setInterval(fetchItems, 30000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    if (!open) return
    fetchItems()
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [open])

  const markRead = async (id: string) => {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", id }),
      })
      setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
      setUnreadCount(c => Math.max(0, c - 1))
    } catch {}
  }

  const markAll = async () => {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", mark_all: true }),
      })
      setItems(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {}
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-xl hover:bg-muted/50 transition-all text-muted-foreground hover:text-foreground"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 rounded-xl bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
              <h3 className="text-sm font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <button onClick={markAll} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading && items.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">Loading...</div>
              ) : items.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">No notifications yet</div>
              ) : (
                <ul className="divide-y divide-border/20">
                  {items.map(n => (
                    <li
                      key={n.id}
                      className={cn(
                        "px-4 py-2.5 hover:bg-muted/30 transition cursor-pointer group",
                        !n.read && "bg-blue-500/5"
                      )}
                      onClick={() => { if (!n.read) markRead(n.id) }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {n.title && (
                            <p className={cn("text-xs font-semibold truncate", !n.read && "text-foreground")}>
                              {!n.read && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5 align-middle" />}
                              {n.title}
                            </p>
                          )}
                          {n.message && (
                            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground/60 mt-1">
                            {new Date(n.created_at).toLocaleString()}
                          </p>
                        </div>
                        {!n.read && (
                          <button
                            onClick={(e) => { e.stopPropagation(); markRead(n.id) }}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground shrink-0"
                            title="Mark read"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="px-4 py-2 border-t border-border/30 text-center">
              <Link href="/settings?tab=alerts" className="text-[11px] text-muted-foreground hover:text-foreground">
                View All &amp; Settings →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
