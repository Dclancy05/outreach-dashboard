"use client"
import { useState, useEffect } from "react"
import { X, Lightbulb, Zap } from "lucide-react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"

type Props = { page: "outreach" | "automations" | "accounts" }

const DISMISS_DAYS = 7

function isDismissed(key: string): boolean {
  if (typeof window === "undefined") return true
  try {
    const raw = localStorage.getItem(`nudge.${key}`)
    if (!raw) return false
    const when = parseInt(raw)
    if (isNaN(when)) return false
    return Date.now() - when < DISMISS_DAYS * 86400_000
  } catch { return false }
}
function dismiss(key: string) {
  try { localStorage.setItem(`nudge.${key}`, String(Date.now())) } catch {}
}

export function NudgeBanners({ page }: Props) {
  const [deadmanConfigured, setDeadmanConfigured] = useState<boolean | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [dismissedKeys, setDismissedKeys] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setDismissedKeys({
      deadman: isDismissed("deadman-setup"),
      retry: isDismissed("retry-visible"),
    })

    fetch("/api/settings/system?key=deadman_switch", { cache: "no-store" })
      .then(r => r.json())
      .then(j => setDeadmanConfigured(!!j?.value?.enabled))
      .catch(() => setDeadmanConfigured(false))

    if (page === "automations") {
      fetch("/api/retry-queue?status=pending&limit=1", { cache: "no-store" })
        .then(r => r.json())
        .then(j => setRetryCount((j.data || []).length))
        .catch(() => {})
    }
  }, [page])

  const banners: React.ReactNode[] = []

  if (page === "outreach" && deadmanConfigured === false && !dismissedKeys.deadman) {
    banners.push(
      <motion.div
        key="deadman"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 px-4 py-2.5"
      >
        <div className="flex items-center gap-2.5 text-sm">
          <Lightbulb className="h-4 w-4 text-blue-400" />
          <span className="text-blue-100">
            Set up dead man&apos;s switch to get alerted when sends stop →{" "}
            <Link href="/settings?tab=alerts" className="underline underline-offset-2 hover:text-blue-300">Settings</Link>
          </span>
        </div>
        <button
          aria-label="Dismiss"
          onClick={() => { dismiss("deadman-setup"); setDismissedKeys(k => ({ ...k, deadman: true })) }}
          className="text-blue-300/60 hover:text-blue-200 p-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </motion.div>
    )
  }

  if (page === "automations" && retryCount > 0 && !dismissedKeys.retry) {
    banners.push(
      <motion.div
        key="retry"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5"
      >
        <div className="flex items-center gap-2.5 text-sm">
          <Zap className="h-4 w-4 text-amber-400" />
          <span className="text-amber-100">{retryCount} send{retryCount === 1 ? "" : "s"} being retried — view details in the Overview tab</span>
        </div>
        <button
          aria-label="Dismiss"
          onClick={() => { dismiss("retry-visible"); setDismissedKeys(k => ({ ...k, retry: true })) }}
          className="text-amber-300/60 hover:text-amber-200 p-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </motion.div>
    )
  }

  if (banners.length === 0) return null
  return (
    <div className="space-y-2">
      <AnimatePresence>{banners}</AnimatePresence>
    </div>
  )
}
