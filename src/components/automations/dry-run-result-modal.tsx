"use client"

/**
 * Dry-Run Result Modal (Automations W4B Slice 4)
 *
 * Shows the per-step outcome of a "Dry Run" against an automation. Dry run
 * means the VPS replay endpoint walks every step, evaluates the selector
 * (or whatever the step kind needs), and reports what WOULD happen — but
 * never actually clicks/types anything.
 *
 * Why this is safe to ship in front of real platforms:
 *   - Pure read-only inspection on the VPS side (no DM send, no follow,
 *     no comment).
 *   - This dashboard never lists campaign-worker / send paths.
 *   - Failures here do not flip an automation's `status` (we pass
 *     `dryRun: true` so the API persists nothing destructive).
 */

import { motion, AnimatePresence } from "framer-motion"
import {
  CheckCircle, AlertTriangle, X, Eye, RefreshCw, SkipForward,
} from "lucide-react"

export interface DryRunStepResult {
  index: number
  description: string
  status: "passed" | "failed" | "skipped"
  selector_matched?: boolean
  match_count?: number
  detail?: string
}

export interface DryRunResultPayload {
  ok: boolean
  automation_name?: string | null
  overall?: "passed" | "failed" | null
  steps: DryRunStepResult[]
  note?: string | null
  error?: string | null
}

export function DryRunResultModal({
  open,
  loading,
  result,
  onClose,
}: {
  open: boolean
  loading: boolean
  result: DryRunResultPayload | null
  onClose: () => void
}) {
  if (!open) return null

  const passed = result?.steps?.filter((s) => s.status === "passed").length ?? 0
  const failed = result?.steps?.filter((s) => s.status === "failed").length ?? 0
  const skipped = result?.steps?.filter((s) => s.status === "skipped").length ?? 0

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
          className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="rounded-xl p-2 bg-amber-500/20">
                <Eye className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Dry run results</h3>
                <p className="text-xs text-muted-foreground">
                  {result?.automation_name || "Inspecting selectors — no clicks fired"}
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
            {loading && (
              <div className="rounded-xl border border-border/40 bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Asking the browser to walk every step (no clicks)…
              </div>
            )}

            {!loading && result?.error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{result.error}</span>
              </div>
            )}

            {!loading && result && !result.error && (
              <>
                {/* Summary tiles */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-emerald-300/70">Pass</p>
                    <p className="text-lg font-bold text-emerald-300 tabular-nums">{passed}</p>
                  </div>
                  <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-2.5 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-red-300/70">Fail</p>
                    <p className="text-lg font-bold text-red-300 tabular-nums">{failed}</p>
                  </div>
                  <div className="rounded-xl bg-muted/20 border border-border/40 p-2.5 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Skipped</p>
                    <p className="text-lg font-bold tabular-nums">{skipped}</p>
                  </div>
                </div>

                {/* Per-step list */}
                <div className="rounded-xl border border-border/40 bg-muted/10 divide-y divide-border/20 max-h-[260px] overflow-y-auto">
                  {(result.steps || []).length === 0 ? (
                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                      No step results returned.
                    </div>
                  ) : (
                    result.steps.map((s) => (
                      <div key={s.index} className="flex items-start gap-2 px-3 py-2 text-xs">
                        {s.status === "passed" && <CheckCircle className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />}
                        {s.status === "failed" && <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />}
                        {s.status === "skipped" && <SkipForward className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{s.index + 1}. {s.description}</p>
                          {(typeof s.match_count === "number" || typeof s.selector_matched === "boolean") && (
                            <p className="text-[10px] text-muted-foreground">
                              {typeof s.selector_matched === "boolean" && (
                                <span className={s.selector_matched ? "text-emerald-300" : "text-red-300"}>
                                  selector {s.selector_matched ? "matched" : "no match"}
                                </span>
                              )}
                              {typeof s.match_count === "number" && (
                                <span className="ml-1.5 text-muted-foreground">· {s.match_count} hit{s.match_count === 1 ? "" : "s"}</span>
                              )}
                            </p>
                          )}
                          {s.detail && (
                            <p className="text-[10px] text-muted-foreground truncate" title={s.detail}>{s.detail}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Overall + note */}
                {result.overall && (
                  <div className={`rounded-xl px-3 py-2 text-xs border flex items-center gap-2 ${
                    result.overall === "passed"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-red-500/10 border-red-500/30 text-red-300"
                  }`}>
                    {result.overall === "passed" ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    <span className="font-semibold">Overall: {result.overall}</span>
                    {result.note && <span className="text-muted-foreground ml-2">· {result.note}</span>}
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground italic">
                  Dry run never clicks, sends, or types. It only verifies selectors resolve. Re-run a real replay to actually exercise the steps.
                </p>
              </>
            )}
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
