"use client"

/**
 * P9.3 — Recording replay dialog.
 *
 * Opens from a Your Automations card (via the play button). Asks Dylan for a
 * target URL, POSTs to /api/automations/:id/replay, then renders per-step
 * progress. If the API responds with stub=true we surface a hint so Dylan
 * knows the replay didn't actually touch a browser yet.
 */

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Play, X, CheckCircle, AlertTriangle, RefreshCw, ExternalLink, SkipForward,
} from "lucide-react"

interface StepResult {
  index: number
  description: string
  status: "passed" | "failed" | "skipped"
  detail?: string
}

export function ReplayAutomationDialog({
  open, onClose, automationId, automationName,
}: {
  open: boolean
  onClose: () => void
  automationId: string | null
  automationName?: string | null
}) {
  const [targetUrl, setTargetUrl] = useState("")
  const [sessionId, setSessionId] = useState("")
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<StepResult[]>([])
  const [overall, setOverall] = useState<"passed" | "failed" | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setTargetUrl(""); setSessionId(""); setRunning(false)
      setResults([]); setOverall(null); setNote(null); setError(null)
    }
  }, [open])

  if (!open || !automationId) return null

  const start = async () => {
    if (!targetUrl.trim()) { setError("Enter a target URL"); return }
    setError(null); setResults([]); setOverall(null); setNote(null); setRunning(true)
    try {
      const res = await fetch(`/api/automations/${automationId}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_url: targetUrl.trim(), session_id: sessionId.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Replay failed")
        setRunning(false)
        return
      }
      // Stream in results one-by-one for a smooth feel.
      const incoming: StepResult[] = data.data.steps || []
      for (let i = 0; i < incoming.length; i++) {
        await new Promise(r => setTimeout(r, 150))
        setResults(prev => [...prev, incoming[i]])
      }
      setOverall(data.data.overall)
      setNote(data.data.note || null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
        className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2 bg-emerald-500/20">
              <Play className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Replay automation</h3>
              <p className="text-xs text-muted-foreground">{automationName || automationId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted/30 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Inputs */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Target URL</label>
            <input
              value={targetUrl}
              onChange={e => setTargetUrl(e.target.value)}
              placeholder="https://instagram.com/some_target"
              className="w-full rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={running}
            />
            <label className="text-xs font-medium text-muted-foreground mt-1 block">VNC session id (optional)</label>
            <input
              value={sessionId}
              onChange={e => setSessionId(e.target.value)}
              placeholder="paste a live session id to replay in a real browser"
              className="w-full rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={running}
            />
            <p className="text-[10px] text-muted-foreground">
              Without a session id the replay runs in stub mode — each step reports as skipped so you can still see the sequence.
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
            </div>
          )}

          {/* Per-step progress */}
          {(running || results.length > 0) && (
            <div className="rounded-xl border border-border/40 bg-muted/10 divide-y divide-border/20 max-h-[260px] overflow-y-auto">
              <AnimatePresence>
                {results.map(r => (
                  <motion.div
                    key={r.index}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-2 px-3 py-2 text-xs"
                  >
                    {r.status === "passed" && <CheckCircle className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />}
                    {r.status === "failed" && <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />}
                    {r.status === "skipped" && <SkipForward className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{r.index + 1}. {r.description}</p>
                      {r.detail && <p className="text-[10px] text-muted-foreground truncate">{r.detail}</p>}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {running && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Running…
                </div>
              )}
            </div>
          )}

          {overall && (
            <div className={`rounded-xl px-3 py-2 text-xs border flex items-center gap-2 ${
              overall === "passed"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            }`}>
              {overall === "passed" ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              <span className="font-semibold">Overall: {overall}</span>
              {note && <span className="text-muted-foreground ml-2">· {note}</span>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-border/30">
          {targetUrl && (
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-xl border border-border/50 px-3 py-2 text-xs font-medium hover:bg-muted/20 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open target
            </a>
          )}
          <button
            onClick={onClose}
            className="rounded-xl border border-border/50 px-4 py-2 text-sm font-medium hover:bg-muted/20 transition-colors"
          >
            Close
          </button>
          <button
            onClick={start}
            disabled={running || !targetUrl.trim()}
            className="rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors flex items-center gap-1.5"
          >
            {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Start replay
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
