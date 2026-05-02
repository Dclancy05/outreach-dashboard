"use client"

/**
 * Replay Viewer Modal (Automations W4B Slice 5)
 *
 * Opens when an automation_runs row is clicked. Renders a step-by-step
 * carousel with screenshots (when `screenshot_urls` is populated by the
 * recording-service) plus the run's status, error, and timing.
 *
 * Read-only. Does not retry, replay, or mutate anything.
 */

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Image as ImageIcon, X, ChevronLeft, ChevronRight, AlertTriangle, Clock,
  CheckCircle, RotateCcw, RefreshCw,
} from "lucide-react"

export interface ReplayRun {
  id: string
  automation_id: string
  automation_name?: string | null
  run_type: string | null
  status: "running" | "passed" | "failed" | "healed"
  started_at: string
  finished_at: string | null
  error: string | null
  steps_completed: number | null
  /** jsonb column on automation_runs — array of public URLs, one per step. */
  screenshot_urls?: string[] | null
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return "in flight"
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return "—"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 1000 / 60)}m`
}

const STATUS_STYLES: Record<string, string> = {
  passed: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  healed: "bg-blue-500/10 border-blue-500/30 text-blue-300",
  failed: "bg-red-500/10 border-red-500/30 text-red-300",
  running: "bg-amber-500/10 border-amber-500/30 text-amber-300",
}

export function ReplayViewerModal({
  open,
  run,
  onClose,
}: {
  open: boolean
  run: ReplayRun | null
  onClose: () => void
}) {
  const [activeStep, setActiveStep] = useState(0)

  // Reset carousel when a new run is opened so we don't carry an old
  // index across modals.
  useEffect(() => {
    if (open) setActiveStep(0)
  }, [open, run?.id])

  if (!open || !run) return null

  const screenshots = Array.isArray(run.screenshot_urls) ? run.screenshot_urls : []
  const stepsCount = Math.max(
    screenshots.length,
    run.steps_completed ?? 0,
    1
  )
  const safeIndex = Math.min(activeStep, Math.max(0, screenshots.length - 1))
  const currentShot = screenshots[safeIndex]

  const StatusIcon =
    run.status === "passed" ? CheckCircle
    : run.status === "healed" ? RotateCcw
    : run.status === "failed" ? AlertTriangle
    : RefreshCw

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        >
          <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl flex items-center justify-between p-5 border-b border-border/30">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`rounded-xl p-2 ${STATUS_STYLES[run.status] || "bg-muted/30"}`}>
                <StatusIcon className={`h-5 w-5 ${run.status === "running" ? "animate-spin" : ""}`} />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-base truncate">
                  {run.automation_name || run.automation_id.slice(0, 8)}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {run.run_type || "run"} · {new Date(run.started_at).toLocaleString()}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-muted/30 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Meta tiles */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border/40 bg-muted/10 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</p>
                <p className={`text-sm font-semibold capitalize ${STATUS_STYLES[run.status]?.split(" ").find(c => c.startsWith("text-"))}`}>
                  {run.status}
                </p>
              </div>
              <div className="rounded-xl border border-border/40 bg-muted/10 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" /> Duration
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatDuration(run.started_at, run.finished_at)}
                </p>
              </div>
              <div className="rounded-xl border border-border/40 bg-muted/10 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Steps done</p>
                <p className="text-sm font-semibold tabular-nums">
                  {run.steps_completed ?? "—"}
                </p>
              </div>
            </div>

            {/* Error block */}
            {run.error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="break-words">{run.error}</span>
              </div>
            )}

            {/* Screenshot carousel */}
            <div className="rounded-xl border border-border/40 bg-muted/10 overflow-hidden">
              <div className="relative aspect-video bg-black/30 flex items-center justify-center">
                {currentShot ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentShot}
                    alt={`Step ${safeIndex + 1} screenshot`}
                    loading="lazy"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="text-center px-6 py-8">
                    <ImageIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium text-muted-foreground">No screenshots captured for this run</p>
                    <p className="text-[10px] text-muted-foreground mt-1 max-w-sm">
                      Once the recording-service starts saving step shots to <code>screenshot_urls</code>, they show up here.
                    </p>
                  </div>
                )}
              </div>
              {screenshots.length > 0 && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/30">
                  <button
                    onClick={() => setActiveStep((v) => Math.max(0, v - 1))}
                    disabled={safeIndex <= 0}
                    className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1 text-xs font-medium hover:bg-muted/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Step {safeIndex + 1} of {screenshots.length}
                  </span>
                  <button
                    onClick={() => setActiveStep((v) => Math.min(screenshots.length - 1, v + 1))}
                    disabled={safeIndex >= screenshots.length - 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1 text-xs font-medium hover:bg-muted/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Run id (small print, helps support) */}
            <p className="text-[10px] text-muted-foreground font-mono break-all">
              run_id: {run.id} · automation_id: {run.automation_id} · steps_count_basis: {stepsCount}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 p-5 border-t border-border/30">
            <button
              onClick={onClose}
              className="rounded-xl border border-border/50 px-4 py-2 text-sm font-medium hover:bg-muted/20 transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
