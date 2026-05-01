"use client"

/**
 * Runs subtab — list of recent runs (left) + selected run detail (right).
 * Polls every 2s while a run is running so the step tree advances live.
 */

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Activity, Pause, X, Sparkles, Check } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  listRuns, getRun, listSteps, controlRun, approveStep, summarizeRun,
  STATUS_BADGE, STEP_ICON, isTerminal,
  type WorkflowRun, type WorkflowStep,
} from "@/lib/api/runs"

// "Started 5m ago" / "Finished 23h ago" — old card said just "23h ago" which
// read as "this is happening every 23h." Be explicit about which side of the
// run the timestamp refers to.
function relTimeFor(status: WorkflowRun["status"], createdAt: string, finishedAt: string | null): string {
  const live = status === "queued" || status === "running" || status === "paused"
  if (live || !finishedAt) return `Started ${formatDistanceToNow(new Date(createdAt), { addSuffix: true })}`
  return `Finished ${formatDistanceToNow(new Date(finishedAt), { addSuffix: true })}`
}

// "api" reads as a label most users won't recognize. The vast majority of
// api-triggered runs come from the Telegram bot's webhook, so call it that.
function triggerLabel(trigger: string): string {
  switch (trigger) {
    case "api": return "via Telegram"
    case "schedule": return "Scheduled"
    case "manual": return "Manual"
    case "webhook": return "Webhook"
    default: return trigger.charAt(0).toUpperCase() + trigger.slice(1)
  }
}

export function RunsView() {
  const { data: runs = [], mutate: mutateRuns } = useSWR<WorkflowRun[]>(
    "runs", () => listRuns({ limit: 100 }),
    { refreshInterval: 4000 }
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Auto-select the newest run on first load
  useEffect(() => {
    if (!selectedId && runs.length > 0) setSelectedId(runs[0].id)
  }, [runs, selectedId])

  return (
    <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] h-full">
      {/* Left: run list */}
      <div className="border-r border-zinc-800/60 flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-zinc-800/60 flex items-center justify-between">
          <span className="text-xs text-zinc-500 uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-3 h-3" /> Runs ({runs.length})
          </span>
        </div>
        <div className="flex-1 overflow-auto">
          {runs.length === 0 && (
            <div className="p-6 text-center text-xs text-zinc-500">
              No runs yet. Trigger one from the Workflows subtab or test an agent in the Agents subtab.
            </div>
          )}
          {runs.map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`w-full text-left px-3 py-2.5 border-b border-zinc-900/40 hover:bg-zinc-900/40 transition-colors ${selectedId === r.id ? "bg-zinc-900/60" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{r.workflow_emoji || "⚙️"}</span>
                <span className="text-sm text-zinc-200 truncate flex-1">{r.workflow_name || "Workflow"}</span>
                <Badge variant="outline" className={`text-[10px] ${STATUS_BADGE[r.status].className}`}>{STATUS_BADGE[r.status].label}</Badge>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
                <span>{relTimeFor(r.status, r.created_at, r.finished_at)}</span>
                <span>·</span>
                <span>${Number(r.cost_usd).toFixed(2)}</span>
                <span>·</span>
                <span>{triggerLabel(r.trigger)}</span>
              </div>
              {r.summary && <div className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{r.summary}</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex flex-col min-h-0">
        {selectedId ? <RunDetail runId={selectedId} onChange={() => mutateRuns()} /> : (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
            Pick a run on the left.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Detail pane ───────────────────────────────────────────────────────────

function RunDetail({ runId, onChange }: { runId: string; onChange: () => void }) {
  const { data: run, mutate: mutateRun } = useSWR<WorkflowRun>(
    ["run", runId], () => getRun(runId),
    { refreshInterval: 2000 }
  )
  const { data: steps = [], mutate: mutateSteps } = useSWR<WorkflowStep[]>(
    ["steps", runId], () => listSteps(runId),
    { refreshInterval: 2000 }
  )

  // Stop polling once terminal
  useEffect(() => {
    if (run && isTerminal(run.status)) {
      // keep mutate available but no auto-poll needed
    }
  }, [run])

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const selectedStep = steps.find(s => s.id === selectedStepId) || null

  // Auto-select the latest in-progress / awaiting_approval step
  useEffect(() => {
    if (selectedStepId) return
    const live = [...steps].reverse().find(s => s.status === "running" || s.status === "awaiting_approval")
    if (live) setSelectedStepId(live.id)
    else if (steps.length) setSelectedStepId(steps[steps.length - 1].id)
  }, [steps, selectedStepId])

  const stepTree = useMemo(() => buildStepTree(steps), [steps])

  if (!run) return <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">Loading…</div>

  const liveOrPending = run.status === "running" || run.status === "queued" || run.status === "paused"

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800/60 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base">{run.workflow_emoji || "⚙️"}</span>
          <span className="font-medium text-zinc-100">{run.workflow_name || "Workflow"}</span>
          <Badge variant="outline" className={`text-[10px] ${STATUS_BADGE[run.status].className}`}>{STATUS_BADGE[run.status].label}</Badge>
          <span className="text-xs text-zinc-500">· {relTimeFor(run.status, run.created_at, run.finished_at)}</span>
          <span className="text-xs text-zinc-500">· ${Number(run.cost_usd).toFixed(2)} · {run.total_tokens} tok</span>
          <div className="ml-auto flex items-center gap-1">
            {liveOrPending && (
              <>
                <Button size="sm" variant="outline" className="h-7" onClick={async () => {
                  await controlRun(runId, "pause"); toast.info("Pause requested")
                }}><Pause className="w-3 h-3 mr-1" /> Pause</Button>
                <Button size="sm" variant="outline" className="h-7 text-red-400" onClick={async () => {
                  if (!confirm("Abort this run? Any in-flight step will be cancelled.")) return
                  await controlRun(runId, "abort"); toast.info("Abort requested")
                  mutateRun(); onChange()
                }}><X className="w-3 h-3 mr-1" /> Abort</Button>
              </>
            )}
            {isTerminal(run.status) && !run.summary && (
              <Button size="sm" variant="outline" className="h-7" onClick={async () => {
                await summarizeRun(runId); toast.info("Summary queued"); mutateRun()
              }}><Sparkles className="w-3 h-3 mr-1" /> Summarize</Button>
            )}
          </div>
        </div>
        {run.summary && (
          <div className="mt-2 text-xs text-zinc-300 bg-zinc-900/50 rounded px-3 py-2 border border-zinc-800/60">
            <Sparkles className="w-3 h-3 inline mr-1 text-amber-400" /> {run.summary}
          </div>
        )}
        {run.error && (
          <div className="mt-2 text-xs text-red-400 bg-red-500/5 rounded px-3 py-2 border border-red-500/30 font-mono">
            {run.error}
          </div>
        )}
      </div>

      {/* Two columns: step tree + selected step */}
      <div className="grid grid-cols-2 gap-0 flex-1 min-h-0">
        <div className="border-r border-zinc-800/60 overflow-auto p-2">
          {stepTree.length === 0 && <div className="text-xs text-zinc-500 p-4">Waiting for first step…</div>}
          {stepTree.map(node => (
            <StepTreeNode key={node.step.id} node={node} depth={0} selectedId={selectedStepId} onSelect={setSelectedStepId} />
          ))}
        </div>
        <div className="overflow-auto p-3">
          {selectedStep ? <StepDetail step={selectedStep} runId={runId} onChange={() => { mutateSteps(); mutateRun(); onChange() }} /> : <div className="text-xs text-zinc-500">Pick a step.</div>}
        </div>
      </div>
    </div>
  )
}

// ─── Step tree ─────────────────────────────────────────────────────────────

interface TreeNode { step: WorkflowStep; children: TreeNode[] }
function buildStepTree(steps: WorkflowStep[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  for (const s of steps) byId.set(s.id, { step: s, children: [] })
  const roots: TreeNode[] = []
  for (const node of byId.values()) {
    if (node.step.parent_step_id) {
      const parent = byId.get(node.step.parent_step_id)
      if (parent) parent.children.push(node)
      else roots.push(node)
    } else roots.push(node)
  }
  return roots
}

function StepTreeNode({ node, depth, selectedId, onSelect }: { node: TreeNode; depth: number; selectedId: string | null; onSelect: (id: string) => void }) {
  const s = node.step
  const ms = (s.started_at && s.finished_at) ? +new Date(s.finished_at) - +new Date(s.started_at) : null
  return (
    <div>
      <button
        onClick={() => onSelect(s.id)}
        className={`w-full text-left text-xs flex items-center gap-2 py-1 px-2 rounded hover:bg-zinc-800/40 ${selectedId === s.id ? "bg-zinc-800/60" : ""}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <span className={`w-4 inline-block text-center ${s.status === "running" ? "animate-pulse" : ""}`}>{STEP_ICON[s.status]}</span>
        <span className="text-zinc-300">{s.node_id}</span>
        {s.iteration > 0 && <Badge variant="outline" className="text-[9px]">iter {s.iteration + 1}</Badge>}
        <span className="text-[10px] text-zinc-500 ml-auto">
          {ms ? `${(ms / 1000).toFixed(1)}s` : ""}
          {Number(s.cost_usd) > 0 && <span className="ml-1">${Number(s.cost_usd).toFixed(3)}</span>}
        </span>
      </button>
      {node.children.map(c => (
        <StepTreeNode key={c.step.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  )
}

// ─── Step detail (with approval inline) ────────────────────────────────────

function StepDetail({ step, runId, onChange }: { step: WorkflowStep; runId: string; onChange: () => void }) {
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-sm">{STEP_ICON[step.status]}</span>
        <span className="text-zinc-200 font-medium">{step.node_id}</span>
        <Badge variant="outline" className="text-[10px]">{step.node_type}</Badge>
        <Badge variant="outline" className="text-[10px]">{step.status}</Badge>
      </div>

      {step.status === "awaiting_approval" && (
        <ApprovalPrompt runId={runId} step={step} onChange={onChange} />
      )}

      {step.input != null && (
        <Section title="Input">
          <pre className="text-[10px] text-zinc-400 bg-zinc-900/50 rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">{JSON.stringify(step.input, null, 2)}</pre>
        </Section>
      )}
      {step.output != null && (
        <Section title="Output">
          <pre className="text-[10px] text-zinc-400 bg-zinc-900/50 rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">{JSON.stringify(step.output, null, 2)}</pre>
        </Section>
      )}
      {step.error && (
        <Section title="Error">
          <pre className="text-[10px] text-red-400 bg-red-500/5 rounded p-2 overflow-auto whitespace-pre-wrap font-mono">{step.error}</pre>
        </Section>
      )}
      {step.log_url && step.status !== "pending" && (
        <Section title="Live log">
          <LiveLog runId={runId} stepId={step.id} />
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{title}</div>
      {children}
    </div>
  )
}

function ApprovalPrompt({ runId, step, onChange }: { runId: string; step: WorkflowStep; onChange: () => void }) {
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const message = (step.input as { message?: string } | null)?.message || "Approve this step?"

  async function decide(decision: "approve" | "reject") {
    setSubmitting(true)
    try {
      await approveStep(runId, step.id, decision, note || undefined)
      toast.success(decision === "approve" ? "Approved — workflow resuming" : "Rejected")
      onChange()
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setSubmitting(false) }
  }

  return (
    <div className="bg-amber-500/5 border border-amber-500/30 rounded p-3">
      <div className="text-amber-400 text-xs font-medium mb-2">Waiting for your decision</div>
      <pre className="text-[11px] text-zinc-300 whitespace-pre-wrap mb-3">{message}</pre>
      <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Optional note…" className="text-xs mb-2" />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => decide("approve")} disabled={submitting}>
          <Check className="w-3 h-3 mr-1" /> Approve
        </Button>
        <Button size="sm" variant="outline" className="text-red-400" onClick={() => decide("reject")} disabled={submitting}>
          <X className="w-3 h-3 mr-1" /> Reject
        </Button>
      </div>
    </div>
  )
}

function LiveLog({ runId, stepId }: { runId: string; stepId: string }) {
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    if (typeof EventSource === "undefined") return
    const es = new EventSource(`/api/runs/${runId}/steps/${stepId}/logs`)
    es.onmessage = (ev) => setLines(prev => [...prev.slice(-200), String(ev.data)])
    es.onerror = () => es.close()
    return () => es.close()
  }, [runId, stepId])
  return (
    <pre className="text-[10px] text-zinc-400 bg-zinc-900/50 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap font-mono">
      {lines.length === 0 ? "(waiting for log lines…)" : lines.join("\n")}
    </pre>
  )
}
