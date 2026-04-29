"use client"

/**
 * /agency/runs/[id] — Phone-first run monitor.
 *
 * Built for Dylan to keep tabs on a workflow run from his iPhone Safari while
 * he's away from his laptop. Big tap targets, single-column flow, collapsible
 * live log, AI summary on top, step trace newest-at-bottom, and one-tap
 * Pause / Resume / Abort / Approve.
 *
 * Polls /api/runs/[id] + /api/runs/[id]/steps every 2s while the run is
 * active (queued | running | paused). Stops polling once terminal.
 *
 * Live log piggybacks on the existing per-step SSE endpoint
 * /api/runs/[id]/steps/[stepId]/logs — we attach to the currently-active step
 * (running or awaiting_approval) and re-attach as steps advance.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import useSWR from "swr"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import {
  ArrowLeft,
  Pause,
  Play,
  X,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Check,
  ExternalLink,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { SessionExpiredCard, isSessionExpired } from "@/components/projects/session-expired"

import {
  getRun,
  listSteps,
  controlRun,
  approveStep,
  summarizeRun,
  STATUS_BADGE,
  STEP_ICON,
  isTerminal,
  type WorkflowRun,
  type WorkflowStep,
} from "@/lib/api/runs"

// ─── Page ──────────────────────────────────────────────────────────────────

export default function RunDetailPage() {
  const params = useParams<{ id: string }>()
  const runId = params?.id

  // Detect 401s for friendly session-expired UI.
  const [authStatus, setAuthStatus] = useState<number | null>(null)

  const fetcher = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (e) {
      // Surface 401s — error.message contains the upstream JSON error.
      if (isSessionExpired(e)) setAuthStatus(401)
      throw e
    }
  }

  const { data: run, mutate: mutateRun, error: runErr } = useSWR<WorkflowRun>(
    runId ? ["run", runId] : null,
    () => fetcher(() => getRun(runId!)),
    { refreshInterval: (latest) => (latest && isTerminal(latest.status) ? 0 : 2000) }
  )

  const { data: steps = [], mutate: mutateSteps } = useSWR<WorkflowStep[]>(
    runId ? ["steps", runId] : null,
    () => fetcher(() => listSteps(runId!)),
    { refreshInterval: () => (run && isTerminal(run.status) ? 0 : 2000) }
  )

  // Friendly 401 view
  if (authStatus === 401 || (runErr && isSessionExpired(runErr))) {
    return (
      <div className="max-w-xl mx-auto">
        <BackLink />
        <Card className="mt-4 border-zinc-800 bg-zinc-950/40">
          <CardContent className="p-0">
            <SessionExpiredCard what="this run" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!runId) {
    return (
      <div className="max-w-xl mx-auto p-6 text-sm text-zinc-400">
        Missing run id.
      </div>
    )
  }

  if (!run) {
    return (
      <div className="max-w-xl mx-auto">
        <BackLink />
        <div className="mt-6 flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading run…
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <BackLink />
      <RunHeader run={run} steps={steps} onChange={() => { mutateRun(); mutateSteps() }} />
      <ActionBar run={run} onChange={() => { mutateRun(); mutateSteps() }} />
      <SummaryCard run={run} onChange={() => { mutateRun() }} />
      <ApprovalSection run={run} steps={steps} onChange={() => { mutateRun(); mutateSteps() }} />
      <StepTrace run={run} steps={steps} />
      <LiveLogSection run={run} steps={steps} />
    </div>
  )
}

// ─── Back link ─────────────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/agency/memory#agent-workflows/runs"
      className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to Runs
    </Link>
  )
}

// ─── Header (title, status, cost, age) ─────────────────────────────────────

function RunHeader({ run, steps, onChange }: { run: WorkflowRun; steps: WorkflowStep[]; onChange: () => void }) {
  void onChange
  const total = steps.length
  const done = steps.filter(s => s.status === "succeeded" || s.status === "failed" || s.status === "skipped").length
  const ageBase = run.started_at || run.created_at
  return (
    <div className="mt-3">
      <div className="flex items-start gap-2">
        <div className="text-2xl leading-none mt-0.5">{run.workflow_emoji || "🤖"}</div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold text-zinc-100 leading-tight break-words">
            {run.workflow_name || "Workflow run"}
          </h1>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[11px] ${STATUS_BADGE[run.status].className}`}>
              {STATUS_BADGE[run.status].label}
            </Badge>
            {run.trigger && (
              <span className="text-[11px] text-zinc-500 capitalize">{run.trigger}</span>
            )}
          </div>
          <div className="mt-1.5 text-[11px] text-zinc-500 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>Cost: <span className="text-zinc-300">${Number(run.cost_usd).toFixed(2)}</span></span>
            <span>Steps: <span className="text-zinc-300">{done}/{total || "?"}</span></span>
            <span>{formatDistanceToNow(new Date(ageBase), { addSuffix: true })}</span>
          </div>
        </div>
      </div>
      {run.error && (
        <div className="mt-3 text-xs text-red-300 bg-red-500/5 border border-red-500/30 rounded-md px-3 py-2 font-mono whitespace-pre-wrap break-words">
          {run.error}
        </div>
      )}
    </div>
  )
}

// ─── Action bar (Pause / Resume / Abort / View PR / Summarize) ─────────────

function ActionBar({ run, onChange }: { run: WorkflowRun; onChange: () => void }) {
  const [busy, setBusy] = useState<"pause" | "resume" | "abort" | "summarize" | null>(null)
  const prUrl = (run.output && typeof run.output === "object")
    ? ((run.output as Record<string, unknown>).pr_url as string | undefined)
    : undefined

  const isRunning = run.status === "running"
  const isPaused = run.status === "paused"
  const isQueued = run.status === "queued"
  const liveOrPending = isRunning || isPaused || isQueued

  async function act(action: "pause" | "resume" | "abort") {
    if (action === "abort" && !confirm("Abort this run? Any in-flight step will be cancelled.")) return
    setBusy(action)
    try {
      await controlRun(run.id, action)
      const verb = action === "pause" ? "Pause" : action === "resume" ? "Resume" : "Abort"
      toast.info(`${verb} requested`)
      onChange()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function doSummarize() {
    setBusy("summarize")
    try {
      await summarizeRun(run.id)
      toast.success("Summary queued")
      onChange()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // Hide the action bar entirely if there's nothing the user can do.
  const hasSummarize = isTerminal(run.status) && !run.summary
  if (!liveOrPending && !prUrl && !hasSummarize) return null

  return (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
      {liveOrPending && (isRunning ? (
        <Button
          size="lg"
          variant="outline"
          className="w-full sm:w-auto h-12 text-base"
          disabled={busy !== null}
          onClick={() => act("pause")}
        >
          {busy === "pause" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Pause className="h-4 w-4 mr-2" />}
          Pause
        </Button>
      ) : (
        <Button
          size="lg"
          className="w-full sm:w-auto h-12 text-base"
          disabled={busy !== null}
          onClick={() => act("resume")}
        >
          {busy === "resume" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          Resume
        </Button>
      ))}

      {liveOrPending && (
        <Button
          size="lg"
          variant="outline"
          className="w-full sm:w-auto h-12 text-base text-red-300 border-red-500/40 hover:bg-red-500/10 hover:text-red-200"
          disabled={busy !== null}
          onClick={() => act("abort")}
        >
          {busy === "abort" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <X className="h-4 w-4 mr-2" />}
          Abort
        </Button>
      )}

      {prUrl && (
        <Button
          size="lg"
          variant="outline"
          className="w-full sm:w-auto h-12 text-base"
          asChild
        >
          <a href={prUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" /> View PR
          </a>
        </Button>
      )}

      {hasSummarize && (
        <Button
          size="lg"
          variant="outline"
          className="w-full sm:w-auto h-12 text-base"
          disabled={busy !== null}
          onClick={doSummarize}
        >
          {busy === "summarize" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Summarize
        </Button>
      )}
    </div>
  )
}

// ─── AI summary card ───────────────────────────────────────────────────────

function SummaryCard({ run, onChange }: { run: WorkflowRun; onChange: () => void }) {
  void onChange
  if (!run.summary) return null
  return (
    <Card className="mt-4 border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-amber-300 mb-1.5">
          <Sparkles className="h-3 w-3" /> AI summary
        </div>
        <div className="text-sm text-zinc-200 whitespace-pre-wrap break-words leading-relaxed">
          {run.summary}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Approval section (waiting steps surfaced front-and-center) ────────────

function ApprovalSection({ run, steps, onChange }: { run: WorkflowRun; steps: WorkflowStep[]; onChange: () => void }) {
  const waiting = steps.filter(s => s.status === "awaiting_approval")
  if (waiting.length === 0) return null
  return (
    <div className="mt-4 space-y-3">
      {waiting.map(step => (
        <ApprovalCard key={step.id} runId={run.id} step={step} onChange={onChange} />
      ))}
    </div>
  )
}

function ApprovalCard({ runId, step, onChange }: { runId: string; step: WorkflowStep; onChange: () => void }) {
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null)
  const message = (step.input as { message?: string } | null)?.message
    || `Approve step "${step.node_id}"?`

  async function decide(decision: "approve" | "reject") {
    setSubmitting(decision)
    try {
      await approveStep(runId, step.id, decision, note || undefined)
      toast.success(decision === "approve" ? "Approved — workflow resuming" : "Rejected")
      onChange()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-amber-300 mb-1.5">
          <Pause className="h-3 w-3" /> Waiting for your tap — {step.node_id}
        </div>
        <div className="text-sm text-zinc-200 whitespace-pre-wrap break-words leading-relaxed mb-3">
          {message}
        </div>
        <Textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          placeholder="Optional note…"
          className="text-sm mb-3"
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="lg"
            className="h-12 text-base"
            disabled={submitting !== null}
            onClick={() => decide("approve")}
          >
            {submitting === "approve" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
            Approve
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 text-base text-red-300 border-red-500/40 hover:bg-red-500/10 hover:text-red-200"
            disabled={submitting !== null}
            onClick={() => decide("reject")}
          >
            {submitting === "reject" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <X className="h-4 w-4 mr-2" />}
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Step trace (newest at bottom) ─────────────────────────────────────────

function StepTrace({ run, steps }: { run: WorkflowRun; steps: WorkflowStep[] }) {
  // Sort newest-at-bottom by started_at (fallback created_at). The API already
  // returns rows in this order, but be defensive.
  const ordered = useMemo(() => {
    const ts = (s: WorkflowStep) => s.started_at || s.created_at
    return [...steps].sort((a, b) => +new Date(ts(a)) - +new Date(ts(b)))
  }, [steps])

  return (
    <Card className="mt-4 border-zinc-800 bg-zinc-950/40">
      <CardContent className="p-3 sm:p-4">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
          Step trace
          {!isTerminal(run.status) && (
            <span className="inline-flex items-center gap-1 text-[10px] text-blue-400">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> live
            </span>
          )}
        </div>
        {ordered.length === 0 ? (
          <div className="text-xs text-zinc-500 py-2">Waiting for first step…</div>
        ) : (
          <ul className="divide-y divide-zinc-900/60">
            {ordered.map(s => <StepRow key={s.id} step={s} />)}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function StepRow({ step }: { step: WorkflowStep }) {
  const ms = (step.started_at && step.finished_at)
    ? +new Date(step.finished_at) - +new Date(step.started_at)
    : (step.started_at && (step.status === "running" || step.status === "awaiting_approval"))
      ? Date.now() - +new Date(step.started_at)
      : null

  const live = step.status === "running" || step.status === "awaiting_approval"

  return (
    <li className="py-2 flex items-center gap-2 text-sm">
      <span className={`w-5 inline-flex justify-center text-base ${live ? "animate-pulse" : ""}`}>
        {STEP_ICON[step.status]}
      </span>
      <span className="flex-1 min-w-0 truncate text-zinc-200">
        {step.node_id}
        {step.iteration > 0 && (
          <span className="ml-1.5 text-[10px] text-zinc-500">·iter {step.iteration + 1}</span>
        )}
      </span>
      <span className="text-[11px] text-zinc-500 whitespace-nowrap">
        {Number(step.cost_usd) > 0 && <span className="mr-2">${Number(step.cost_usd).toFixed(3)}</span>}
        {ms != null && <span>{formatMs(ms)}</span>}
        {step.status === "awaiting_approval" && <span className="text-amber-400">waiting…</span>}
      </span>
    </li>
  )
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rem = Math.floor(s - m * 60)
  return `${m}m ${rem}s`
}

// ─── Live SSE log (collapsible, auto-scroll) ───────────────────────────────

function LiveLogSection({ run, steps }: { run: WorkflowRun; steps: WorkflowStep[] }) {
  // Default closed on mobile (small screens) since logs are noisy. Persisting
  // open state across re-renders is fine, just scoped to this page.
  const [open, setOpen] = useState(false)

  // Pick the active step to stream — running first, else awaiting_approval,
  // else the most-recent terminal step (so user can review post-mortem).
  const targetStep = useMemo(() => {
    const running = steps.find(s => s.status === "running")
    if (running) return running
    const waiting = steps.find(s => s.status === "awaiting_approval")
    if (waiting) return waiting
    // Fall back to the latest step that has a log_url so users can scrub
    // back through what happened.
    const withLog = [...steps].reverse().find(s => s.log_url)
    return withLog || null
  }, [steps])

  return (
    <Card className="mt-4 border-zinc-800 bg-zinc-950/40">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 sm:px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="text-[11px] uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
          Live log
          {targetStep && !isTerminal(run.status) && (
            <span className="inline-flex items-center gap-1 text-[10px] text-blue-400">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> {targetStep.node_id}
            </span>
          )}
          {!targetStep && (
            <span className="text-[10px] text-zinc-600">no active step</span>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
      </button>
      {open && (
        <CardContent className="p-3 sm:p-4 pt-0">
          {targetStep ? (
            <LiveLog runId={run.id} stepId={targetStep.id} />
          ) : (
            <div className="text-xs text-zinc-500 py-2">No step is producing logs yet.</div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

const MAX_LOG_LINES = 300

function LiveLog({ runId, stepId }: { runId: string; stepId: string }) {
  const [lines, setLines] = useState<string[]>([])
  const containerRef = useRef<HTMLPreElement | null>(null)
  const stuckToBottomRef = useRef(true)

  // Re-attach SSE when stepId changes.
  useEffect(() => {
    setLines([])
    if (typeof EventSource === "undefined") return

    const es = new EventSource(`/api/runs/${runId}/steps/${stepId}/logs`)
    es.onmessage = (ev) => {
      setLines(prev => {
        const next = [...prev, String(ev.data)]
        return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next
      })
    }
    es.addEventListener("end", () => {
      es.close()
    })
    es.onerror = () => es.close()

    return () => es.close()
  }, [runId, stepId])

  // Track whether the user has scrolled up — if they have, stop auto-scrolling
  // until they're back near the bottom.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop
      stuckToBottomRef.current = distFromBottom < 32
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

  // Auto-scroll to bottom on new lines, only if the user hasn't scrolled up.
  useEffect(() => {
    if (!stuckToBottomRef.current) return
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <pre
      ref={containerRef}
      className="text-[11px] leading-snug text-zinc-300 bg-black/60 border border-zinc-900 rounded-md p-2 overflow-auto max-h-72 whitespace-pre-wrap break-words font-mono"
    >
      {lines.length === 0 ? "(waiting for log lines…)" : lines.join("\n")}
    </pre>
  )
}
