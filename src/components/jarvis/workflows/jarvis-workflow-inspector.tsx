"use client"

/**
 * JarvisWorkflowInspector — right rail (320px) of the builder.
 *
 * Two modes:
 *   1. Node selected → form for that node's type (label + per-type fields).
 *      Identical field set to the legacy NodeInspector — we re-implement here
 *      with Jarvis chrome so the look matches the rest of /jarvis without
 *      forking the legacy file.
 *   2. No node selected → workflow-level settings (status, budget, max steps,
 *      max loop iterations) + graph issue list.
 *
 * The whole thing is `aria-label`'d as a "Workflow inspector" complementary
 * landmark and is keyboard-friendly (every input has a connected Label).
 */

import * as React from "react"
import { toast } from "sonner"
import { Trash2, Save, AlertCircle, AlertTriangle } from "lucide-react"
import type { Node } from "@xyflow/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  updateWorkflow,
  type Workflow,
  type WorkflowStatus,
} from "@/lib/api/workflows"
import type { Agent } from "@/lib/api/agents"
import type { GraphIssue } from "@/lib/workflow/graph"
import type { NODE_TYPES } from "@/components/agent-workflows/workflows/nodes"

interface JarvisWorkflowInspectorProps {
  workflow: Workflow | null
  selectedNode: Node | null
  agents: Agent[]
  allNodes: Node[]
  issues: GraphIssue[]
  onChange: (patch: Record<string, unknown>) => void
  onDelete: () => void
  onWorkflowUpdated: () => void
}

export function JarvisWorkflowInspector({
  workflow,
  selectedNode,
  agents,
  allNodes,
  issues,
  onChange,
  onDelete,
  onWorkflowUpdated,
}: JarvisWorkflowInspectorProps) {
  return (
    <aside
      className="hidden lg:flex flex-col w-[320px] shrink-0 border-l border-mem-border bg-mem-surface-1 overflow-auto"
      aria-label="Workflow inspector"
    >
      {selectedNode ? (
        <NodeInspector
          key={selectedNode.id}
          node={selectedNode}
          agents={agents}
          allNodes={allNodes}
          onChange={onChange}
          onDelete={onDelete}
        />
      ) : workflow ? (
        <WorkflowSettingsPane
          workflow={workflow}
          issues={issues}
          onWorkflowUpdated={onWorkflowUpdated}
        />
      ) : (
        <div className="p-4 text-[12px] text-mem-text-muted">Loading…</div>
      )}
    </aside>
  )
}

/* -------------------------------------------------------------------------- */
/*                              Node inspector                                */
/* -------------------------------------------------------------------------- */

function NodeInspector({
  node,
  agents,
  allNodes,
  onChange,
  onDelete,
}: {
  node: Node
  agents: Agent[]
  allNodes: Node[]
  onChange: (patch: Record<string, unknown>) => void
  onDelete: () => void
}) {
  const data = node.data as Record<string, unknown>
  const type = node.type as keyof typeof NODE_TYPES

  return (
    <div className="space-y-3 p-3 text-[13px]">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-mem-text-muted">
          {type}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-mem-text-muted hover:text-mem-status-stuck"
          onClick={onDelete}
          aria-label="Delete node"
          data-testid="jarvis-node-delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      <Field label="Label" htmlFor="ji-label">
        <Input
          id="ji-label"
          value={(data.label as string) || ""}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>

      {(type === "agent" || type === "orchestrator") && (
        <Field label="Agent">
          <Select
            value={(data.agent_slug as string) || ""}
            onValueChange={(v) => onChange({ agent_slug: v })}
          >
            <SelectTrigger aria-label="Choose agent">
              <SelectValue placeholder="Pick an agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.length === 0 && (
                <SelectItem value="__none__" disabled>
                  No agents yet — create one in /jarvis/agents
                </SelectItem>
              )}
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.slug}>
                  {a.emoji} {a.name}{" "}
                  <span className="text-xs text-mem-text-muted ml-1">
                    ({a.model})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {type === "agent" && (
        <>
          <Field label="Prompt template" htmlFor="ji-prompt">
            <Textarea
              id="ji-prompt"
              value={(data.prompt as string) || ""}
              onChange={(e) => onChange({ prompt: e.target.value })}
              rows={5}
              className="font-mono text-xs"
              placeholder="Use {{var}} to insert variables from earlier steps"
            />
          </Field>
          <Field label="Output variable" htmlFor="ji-output">
            <Input
              id="ji-output"
              value={(data.output_var as string) || ""}
              onChange={(e) => onChange({ output_var: e.target.value })}
              placeholder="result"
            />
          </Field>
        </>
      )}

      {type === "orchestrator" && (
        <Field label="Can route to (downstream node IDs)" htmlFor="ji-routes">
          <Textarea
            id="ji-routes"
            value={
              Array.isArray(data.routes)
                ? (data.routes as string[]).join(", ")
                : ""
            }
            onChange={(e) =>
              onChange({
                routes: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            rows={2}
            placeholder="writer, fixer, output"
            className="font-mono text-xs"
          />
          <div className="text-[10px] text-mem-text-muted mt-1">
            Available:{" "}
            {allNodes
              .filter((n) => n.id !== node.id)
              .map((n) => n.id)
              .join(", ") || "(no other nodes)"}
          </div>
        </Field>
      )}

      {type === "loop" && (
        <>
          <Field label="Mode">
            <Select
              value={(data.mode as string) || "until"}
              onValueChange={(v) => onChange({ mode: v })}
            >
              <SelectTrigger aria-label="Loop mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="until">
                  until (run, then check — like do-while)
                </SelectItem>
                <SelectItem value="while">while (check, then run)</SelectItem>
                <SelectItem value="for_each">
                  for each (iterate over a collection)
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {(data.mode === "until" ||
            data.mode === "while" ||
            !data.mode) && (
            <Field label="Condition" htmlFor="ji-cond">
              <Input
                id="ji-cond"
                value={(data.condition as string) || ""}
                onChange={(e) => onChange({ condition: e.target.value })}
                className="font-mono text-xs"
                placeholder="$.tests.failed === 0"
              />
              <div className="text-[10px] text-mem-text-muted mt-1">
                Use $.var.path to read from the variable bag.
              </div>
            </Field>
          )}
          {data.mode === "for_each" && (
            <Field label="Collection variable" htmlFor="ji-coll">
              <Input
                id="ji-coll"
                value={(data.collection_var as string) || ""}
                onChange={(e) => onChange({ collection_var: e.target.value })}
                placeholder="leads"
              />
            </Field>
          )}
          <Field label="Max iterations (hard cap)" htmlFor="ji-maxit">
            <Input
              id="ji-maxit"
              type="number"
              value={(data.max_iterations as number) || 10}
              onChange={(e) =>
                onChange({
                  max_iterations: parseInt(e.target.value, 10) || 10,
                })
              }
            />
          </Field>
        </>
      )}

      {type === "router" && (
        <Field label="Condition" htmlFor="ji-rcond">
          <Input
            id="ji-rcond"
            value={(data.condition as string) || ""}
            onChange={(e) => onChange({ condition: e.target.value })}
            className="font-mono text-xs"
            placeholder="$.tests.failed === 0"
          />
          <div className="text-[10px] text-mem-text-muted mt-1">
            True = top output, False = bottom output.
          </div>
        </Field>
      )}

      {type === "approval" && (
        <>
          <Field label="Message (shown to you)" htmlFor="ji-msg">
            <Textarea
              id="ji-msg"
              value={(data.message as string) || ""}
              onChange={(e) => onChange({ message: e.target.value })}
              rows={4}
              className="text-xs"
              placeholder={"Send this DM?\n\n{{draft}}"}
            />
          </Field>
          <Field label="Channel">
            <Select
              value={(data.channel as string) || "in_app"}
              onValueChange={(v) => onChange({ channel: v })}
            >
              <SelectTrigger aria-label="Notification channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_app">In-app notification</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Timeout (minutes)" htmlFor="ji-timeout">
            <Input
              id="ji-timeout"
              type="number"
              value={(data.timeout_minutes as number) || 1440}
              onChange={(e) =>
                onChange({
                  timeout_minutes: parseInt(e.target.value, 10) || 1440,
                })
              }
            />
          </Field>
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                          Workflow settings + issues                        */
/* -------------------------------------------------------------------------- */

function WorkflowSettingsPane({
  workflow,
  issues,
  onWorkflowUpdated,
}: {
  workflow: Workflow
  issues: GraphIssue[]
  onWorkflowUpdated: () => void
}) {
  const [budget, setBudget] = React.useState(String(workflow.budget_usd))
  const [maxSteps, setMaxSteps] = React.useState(String(workflow.max_steps))
  const [maxLoopIters, setMaxLoopIters] = React.useState(
    String(workflow.max_loop_iters)
  )
  const [status, setStatus] = React.useState<WorkflowStatus>(workflow.status)
  const [saving, setSaving] = React.useState(false)

  // Re-sync local form state when the workflow id (or any field we mirror)
  // changes underneath us.
  React.useEffect(() => {
    setBudget(String(workflow.budget_usd))
    setMaxSteps(String(workflow.max_steps))
    setMaxLoopIters(String(workflow.max_loop_iters))
    setStatus(workflow.status)
  }, [workflow.id, workflow.budget_usd, workflow.max_steps, workflow.max_loop_iters, workflow.status])

  async function save() {
    setSaving(true)
    try {
      await updateWorkflow(workflow.id, {
        budget_usd: parseFloat(budget) || 5,
        max_steps: parseInt(maxSteps, 10) || 50,
        max_loop_iters: parseInt(maxLoopIters, 10) || 10,
        status,
      } as Partial<Workflow>)
      toast.success("Saved")
      onWorkflowUpdated()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 p-3 text-[13px]">
      <div className="text-[10px] uppercase tracking-wider text-mem-text-muted">
        Workflow settings
      </div>

      <Field label="Status">
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as WorkflowStatus)}
        >
          <SelectTrigger aria-label="Workflow status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">
              Draft (won&apos;t fire from schedules)
            </SelectItem>
            <SelectItem value="active">
              Active (schedules can fire it)
            </SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Budget cap (USD per run)" htmlFor="js-budget">
        <Input
          id="js-budget"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          type="number"
          step="0.5"
        />
      </Field>
      <Field label="Max steps per run" htmlFor="js-maxsteps">
        <Input
          id="js-maxsteps"
          value={maxSteps}
          onChange={(e) => setMaxSteps(e.target.value)}
          type="number"
        />
      </Field>
      <Field label="Max loop iterations" htmlFor="js-maxloop">
        <Input
          id="js-maxloop"
          value={maxLoopIters}
          onChange={(e) => setMaxLoopIters(e.target.value)}
          type="number"
        />
      </Field>
      <Button
        size="sm"
        onClick={save}
        disabled={saving}
        className="bg-mem-accent text-white hover:brightness-110 h-8"
      >
        <Save className="w-3.5 h-3.5 mr-1.5" />
        {saving ? "Saving…" : "Save settings"}
      </Button>

      {issues.length > 0 && (
        <div className="border-t border-mem-border pt-3 mt-3">
          <div className="text-[10px] uppercase tracking-wider text-mem-text-muted mb-2">
            Graph issues ({issues.length})
          </div>
          <ul className="space-y-1.5">
            {issues.map((i, idx) => (
              <li
                key={idx}
                className={
                  i.level === "error"
                    ? "text-mem-status-stuck text-[11px] flex items-start gap-1.5"
                    : "text-mem-status-thinking text-[11px] flex items-start gap-1.5"
                }
              >
                {i.level === "error" ? (
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                )}
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="text-xs text-mem-text-secondary">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
