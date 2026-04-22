"use client"
import { useState, useEffect } from "react"
import { AlertCircle, RefreshCw, Clock, X, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

type RetryItem = {
  id: string
  action_type: string
  attempt_count: number
  max_attempts: number
  next_retry_at: string
  status: string
  error_message: string | null
  account_id: string | null
  lead_id: string | null
  created_at: string
  payload: any
}

type Props = { variant?: "card" | "banner" }

export function RetryQueueWidget({ variant = "card" }: Props) {
  const [items, setItems] = useState<RetryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})

  const fetchData = async () => {
    try {
      const res = await fetch("/api/retry-queue?status=pending&limit=20", { cache: "no-store" })
      const j = await res.json()
      setItems(j.data || [])
      setCounts(j.counts || {})
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    const i = setInterval(fetchData, 15000)
    return () => clearInterval(i)
  }, [])

  const activeCount = items.length
  const lastError = items.find(i => i.error_message)?.error_message

  if (loading) return null
  if (activeCount === 0 && (counts.gave_up || 0) === 0) return null

  if (variant === "banner") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden"
      >
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-amber-500/10 transition"
        >
          <div className="flex items-center gap-2.5 text-sm">
            <RefreshCw className="h-4 w-4 text-amber-400 animate-spin" />
            <span className="font-medium text-amber-100">
              {activeCount} {activeCount === 1 ? "send" : "sends"} being retried
            </span>
            {lastError && (
              <span className="text-xs text-amber-300/70 truncate max-w-md">
                · {lastError.slice(0, 60)}
              </span>
            )}
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-amber-400" /> : <ChevronDown className="h-4 w-4 text-amber-400" />}
        </button>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              className="overflow-hidden border-t border-amber-500/20"
            >
              <div className="max-h-64 overflow-y-auto">
                {items.slice(0, 10).map(it => (
                  <RetryRow key={it.id} item={it} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold">Retry Queue</h3>
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">{activeCount}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchData} className="h-7 px-2">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {activeCount === 0 ? (
        <div className="text-xs text-muted-foreground">No active retries</div>
      ) : (
        <>
          {lastError && (
            <div className="text-xs text-muted-foreground border-l-2 border-amber-500/40 pl-2">
              <span className="text-amber-300/80">Last error:</span> {lastError.slice(0, 120)}
            </div>
          )}
          <div className="space-y-1.5">
            {items.slice(0, expanded ? 20 : 3).map(it => (
              <RetryRow key={it.id} item={it} />
            ))}
          </div>
          {activeCount > 3 && (
            <Button variant="ghost" size="sm" onClick={() => setExpanded(v => !v)} className="w-full h-7 text-xs">
              {expanded ? "Show less" : `View all (${activeCount})`}
            </Button>
          )}
        </>
      )}

      {(counts.gave_up || 0) > 0 && (
        <div className="text-xs text-red-300/80 flex items-center gap-1.5 pt-2 border-t border-border/40">
          <AlertCircle className="h-3 w-3" />
          {counts.gave_up} permanently failed
        </div>
      )}
    </div>
  )
}

function RetryRow({ item }: { item: RetryItem }) {
  const nextIn = new Date(item.next_retry_at).getTime() - Date.now()
  const nextLabel = nextIn <= 0 ? "any moment" : nextIn < 60_000 ? `${Math.round(nextIn / 1000)}s` : `${Math.round(nextIn / 60_000)}m`
  return (
    <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-muted/20">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-muted-foreground font-mono shrink-0">#{item.attempt_count + 1}/{item.max_attempts}</span>
        <span className="text-foreground truncate">{item.action_type}</span>
        {item.lead_id && <span className="text-muted-foreground truncate">· {item.lead_id.slice(0, 20)}</span>}
      </div>
      <div className="flex items-center gap-1 text-amber-300/80 shrink-0">
        <Clock className="h-3 w-3" />
        <span>{nextLabel}</span>
      </div>
    </div>
  )
}
