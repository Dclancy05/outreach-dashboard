"use client"

/**
 * Visual workflow builder. Three columns:
 *   - left:  node palette (drag-to-add)
 *   - center: xyflow canvas
 *   - right: inspector panel for the selected node + budget/action toolbar
 *
 * Autosaves to /api/workflows/[id] every 2 seconds when the graph is dirty.
 *
 * BUG-031 fix: `fitView` is now called explicitly via `useReactFlow().fitView()`
 *   AFTER the nodes hydrate from the server. The original `<ReactFlow fitView />`
 *   prop only fires on mount when nodes are already present — but our nodes
 *   arrive async via SWR, so the initial fit had nothing to frame.
 *
 * BUG-032 fix: `<Controls />` and `<MiniMap />` are inside `<ReactFlow>` (already
 *   were) but the inner xyflow container needs `position: relative` and a
 *   defined height for them to be visible — the wrapper previously had no
 *   explicit height in some embeddings, so they were clipped/invisible.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  addEdge, applyNodeChanges, applyEdgeChanges, useReactFlow,
  type Edge, type Node, type NodeChange, type EdgeChange, type Connection,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Sparkles, Play, FlaskConical, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { getWorkflow, updateWorkflow, runWorkflow, dryRunWorkflow, explainWorkflow, type Workflow } from "@/lib/api/workflows"
import { listAgents, type Agent } from "@/lib/api/agents"
import { validateGraph, type WorkflowGraph } from "@/lib/workflow/graph"
import { NODE_TYPES, PALETTE } from "@/components/agent-workflows/workflows/nodes"

interface Props { workflowId: string; onClose: () => void }

/**
 * Builds initial xyflow nodes/edges arrays from a Workflow record.
 * Exported for the Jarvis builder (W4.C) so it can hydrate without re-implementing
 * the cast logic. Returns plain arrays — caller wraps in setState.
 */
export function getInitialNodesFromWorkflow(wf: Workflow): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: wf.graph.nodes as unknown as Node[],
    edges: wf.graph.edges as unknown as Edge[],
  }
}

export function WorkflowBuilder({ workflowId, onClose }: Props) {
  return (
    <ReactFlowProvider>
      <BuilderInner workflowId={workflowId} onClose={onClose} />
    </ReactFlowProvider>
  )
}

function BuilderInner({ workflowId }: Props) {
  const { data: wf, mutate: mutateWf } = useSWR<Workflow>(["workflow", workflowId], () => getWorkflow(workflowId))
  const { data: agents = [] } = useSWR<Agent[]>("agents-builder", () => listAgents({}))
  const { fitView } = useReactFlow()

  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const lastSavedRef = useRef<string>("")
  const hasFitRef = useRef(false)

  // Hydrate from server
  useEffect(() => {
    if (!wf) return
    const init = getInitialNodesFromWorkflow(wf)
    setNodes(init.nodes)
    setEdges(init.edges)
    lastSavedRef.current = JSON.stringify(wf.graph)
  }, [wf])

  // BUG-031 fix: fitView once after nodes hydrate. The xyflow `fitView` prop
  // only fires on first paint, when our nodes are still empty.
  useEffect(() => {
    if (hasFitRef.current) return
    if (nodes.length === 0) return
    hasFitRef.current = true
    // requestAnimationFrame ensures xyflow has measured node bounds.
    const raf = requestAnimationFrame(() => {
      fitView({ padding: 0.15, duration: 250 })
    })
    return () => cancelAnimationFrame(raf)
  }, [nodes, fitView])

  // Autosave (debounced)
  useEffect(() => {
    if (!dirty || !wf) return
    const t = setTimeout(async () => {
      const g: WorkflowGraph = { nodes: nodes as unknown as WorkflowGraph["nodes"], edges: edges as unknown as WorkflowGraph["edges"], viewport: wf.graph.viewport }
      const serialized = JSON.stringify(g)
      if (serialized === lastSavedRef.current) { setDirty(false); return }
      try {
        await updateWorkflow(workflowId, { graph: g } as Partial<Workflow>)
        lastSavedRef.current = serialized
        setDirty(false)
      } catch (e) {
        toast.error(`Autosave failed: ${(e as Error).message}`)
      }
    }, 1500)
    return () => clearTimeout(t)
  }, [dirty, nodes, edges, wf, workflowId])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(ns => applyNodeChanges(changes, ns))
    if (changes.some(c => c.type === "position" || c.type === "remove" || c.type === "dimensions")) setDirty(true)
  }, [])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(es => applyEdgeChanges(changes, es))
    setDirty(true)
  }, [])
  const onConnect = useCallback((conn: Connection) => {
    setEdges(es => addEdge({ ...conn, id: `e_${Date.now()}` }, es))
    setDirty(true)
  }, [])

  const issues = useMemo(() => validateGraph({ nodes: nodes as unknown as WorkflowGraph["nodes"], edges: edges as unknown as WorkflowGraph["edges"] }), [nodes, edges])
  const errorCount = issues.filter(i => i.level === "error").length

  function addNodeFromPalette(type: keyof typeof NODE_TYPES) {
    const id = `${type}_${Math.random().toString(36).slice(2, 8)}`
    const newNode: Node = {
      id,
      type,
      position: { x: 200 + nodes.length * 30, y: 100 + nodes.length * 30 },
      data: defaultDataForType(type),
      ...(type === "loop" ? { style: { width: 480, height: 260 } } : {}),
    }
    setNodes(ns => [...ns, newNode])
    setSelectedNodeId(id)
    setDirty(true)
  }

  function updateSelectedNodeData(patch: Record<string, unknown>) {
    if (!selectedNodeId) return
    setNodes(ns => ns.map(n => n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n))
    setDirty(true)
  }

  function deleteSelected() {
    if (!selectedNodeId) return
    setNodes(ns => ns.filter(n => n.id !== selectedNodeId))
    setEdges(es => es.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId))
    setSelectedNodeId(null)
    setDirty(true)
  }

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null

  return (
    <div className="grid grid-cols-[160px_1fr_320px] h-full">
      {/* Palette */}
      <div className="border-r border-zinc-800/60 p-2 overflow-auto">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-1 mb-2">Drag in →</div>
        <div className="flex flex-col gap-1">
          {PALETTE.map(p => (
            <button
              key={p.type}
              onClick={() => addNodeFromPalette(p.type)}
              className="text-left px-2 py-1.5 rounded text-xs text-zinc-300 hover:bg-zinc-800/60 flex items-center gap-2 group"
              title={p.help}
            >
              <span className="text-zinc-500 group-hover:text-zinc-300">{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas — explicit relative + h-full so Controls/MiniMap (BUG-032) render */}
      <div className="relative h-full min-h-[480px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedNodeId(n.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          fitView
          minZoom={0.3}
        >
          <Background color="#27272a" gap={16} />
          <Controls className="!bg-zinc-900/80 !border-zinc-700" showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-zinc-900/80 !border-zinc-700" maskColor="rgba(0,0,0,0.6)" />
        </ReactFlow>

        {/* Top toolbar overlay */}
        <div className="absolute top-2 right-2 left-2 flex items-center gap-2 z-10">
          <Badge variant="outline" className="text-[10px]">
            {dirty ? "● Saving…" : "✓ Saved"}
          </Badge>
          {errorCount > 0 && (
            <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/30">
              {errorCount} issue{errorCount === 1 ? "" : "s"}
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            <ExplainButton workflowId={workflowId} />
            <DryRunButton workflowId={workflowId} disabled={errorCount > 0} />
            <RunButton workflowId={workflowId} disabled={errorCount > 0} onClose={() => mutateWf()} />
          </div>
        </div>
      </div>

      {/* Inspector */}
      <div className="border-l border-zinc-800/60 p-3 overflow-auto">
        {selectedNode ? (
          <NodeInspector
            key={selectedNode.id}
            node={selectedNode}
            agents={agents}
            allNodes={nodes}
            onChange={updateSelectedNodeData}
            onDelete={deleteSelected}
          />
        ) : wf ? (
          <WorkflowSettings workflow={wf} onUpdated={() => mutateWf()} issues={issues} />
        ) : null}
      </div>
    </div>
  )
}

// ─── Defaults per node type ────────────────────────────────────────────────

function defaultDataForType(type: keyof typeof NODE_TYPES): Record<string, unknown> {
  switch (type) {
    case "trigger":      return { label: "Start", input_schema: {} }
    case "agent":        return { label: "New agent step", agent_slug: "", prompt: "", output_var: "result" }
    case "orchestrator": return { label: "Orchestrator", agent_slug: "", routes: [] }
    case "loop":         return { label: "Loop", mode: "until", condition: "$.tests.failed === 0", max_iterations: 10 }
    case "router":       return { label: "If / Else", condition: "$.value === true" }
    case "approval":     return { label: "Approve", message: "Approve this step?\n\n{{draft}}", channel: "in_app", timeout_minutes: 1440 }
    case "output":       return { label: "Done", output_schema: {} }
  }
}

// ─── Inspector — renders a different form per node type ────────────────────

function NodeInspector({ node, agents, allNodes, onChange, onDelete }: {
  node: Node
  agents: Agent[]
  allNodes: Node[]
  onChange: (patch: Record<string, unknown>) => void
  onDelete: () => void
}) {
  const data = node.data as Record<string, unknown>
  const type = node.type as keyof typeof NODE_TYPES

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">{type}</div>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-500 hover:text-red-400" onClick={onDelete}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
      <Field label="Label">
        <Input value={(data.label as string) || ""} onChange={e => onChange({ label: e.target.value })} />
      </Field>

      {(type === "agent" || type === "orchestrator") && (
        <Field label="Agent">
          <Select value={(data.agent_slug as string) || ""} onValueChange={v => onChange({ agent_slug: v })}>
            <SelectTrigger><SelectValue placeholder="Pick an agent" /></SelectTrigger>
            <SelectContent>
              {agents.length === 0 && <SelectItem value="__none__" disabled>No agents yet — create one in the Agents subtab</SelectItem>}
              {agents.map(a => (
                <SelectItem key={a.id} value={a.slug}>
                  {a.emoji} {a.name} <span className="text-xs text-zinc-500 ml-1">({a.model})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {type === "agent" && (
        <>
          <Field label="Prompt template">
            <Textarea value={(data.prompt as string) || ""} onChange={e => onChange({ prompt: e.target.value })} rows={5} className="font-mono text-xs" placeholder="Use {{var}} to insert variables from earlier steps" />
          </Field>
          <Field label="Output variable">
            <Input value={(data.output_var as string) || ""} onChange={e => onChange({ output_var: e.target.value })} placeholder="result" />
          </Field>
        </>
      )}

      {type === "orchestrator" && (
        <Field label="Can route to (downstream node IDs)">
          <Textarea
            value={Array.isArray(data.routes) ? (data.routes as string[]).join(", ") : ""}
            onChange={e => onChange({ routes: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
            rows={2}
            placeholder="writer, fixer, output"
            className="font-mono text-xs"
          />
          <div className="text-[10px] text-zinc-500 mt-1">
            Available: {allNodes.filter(n => n.id !== node.id).map(n => n.id).join(", ") || "(no other nodes)"}
          </div>
        </Field>
      )}

      {type === "loop" && (
        <>
          <Field label="Mode">
            <Select value={(data.mode as string) || "until"} onValueChange={v => onChange({ mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="until">until (run, then check — like do-while)</SelectItem>
                <SelectItem value="while">while (check, then run)</SelectItem>
                <SelectItem value="for_each">for each (iterate over a collection)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {(data.mode === "until" || data.mode === "while" || !data.mode) && (
            <Field label="Condition">
              <Input value={(data.condition as string) || ""} onChange={e => onChange({ condition: e.target.value })} className="font-mono text-xs" placeholder="$.tests.failed === 0" />
              <div className="text-[10px] text-zinc-500 mt-1">Use $.var.path to read from the variable bag.</div>
            </Field>
          )}
          {data.mode === "for_each" && (
            <Field label="Collection variable">
              <Input value={(data.collection_var as string) || ""} onChange={e => onChange({ collection_var: e.target.value })} placeholder="leads" />
            </Field>
          )}
          <Field label="Max iterations (hard cap)">
            <Input type="number" value={(data.max_iterations as number) || 10} onChange={e => onChange({ max_iterations: parseInt(e.target.value, 10) || 10 })} />
          </Field>
        </>
      )}

      {type === "router" && (
        <Field label="Condition">
          <Input value={(data.condition as string) || ""} onChange={e => onChange({ condition: e.target.value })} className="font-mono text-xs" placeholder="$.tests.failed === 0" />
          <div className="text-[10px] text-zinc-500 mt-1">True = top output, False = bottom output.</div>
        </Field>
      )}

      {type === "approval" && (
        <>
          <Field label="Message (shown to you)">
            <Textarea value={(data.message as string) || ""} onChange={e => onChange({ message: e.target.value })} rows={4} className="text-xs" placeholder="Send this DM?\n\n{{draft}}" />
          </Field>
          <Field label="Channel">
            <Select value={(data.channel as string) || "in_app"} onValueChange={v => onChange({ channel: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in_app">In-app notification</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Timeout (minutes)">
            <Input type="number" value={(data.timeout_minutes as number) || 1440} onChange={e => onChange({ timeout_minutes: parseInt(e.target.value, 10) || 1440 })} />
          </Field>
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  )
}

// ─── Workflow-level settings (when no node selected) ───────────────────────

function WorkflowSettings({ workflow, onUpdated, issues }: { workflow: Workflow; onUpdated: () => void; issues: ReturnType<typeof validateGraph> }) {
  const [budget, setBudget] = useState(String(workflow.budget_usd))
  const [maxSteps, setMaxSteps] = useState(String(workflow.max_steps))
  const [maxLoopIters, setMaxLoopIters] = useState(String(workflow.max_loop_iters))
  const [status, setStatus] = useState(workflow.status)

  async function save() {
    try {
      await updateWorkflow(workflow.id, {
        budget_usd: parseFloat(budget) || 5,
        max_steps: parseInt(maxSteps, 10) || 50,
        max_loop_iters: parseInt(maxLoopIters, 10) || 10,
        status,
      } as Partial<Workflow>)
      toast.success("Saved")
      onUpdated()
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">Workflow settings</div>

      <Field label="Status">
        <Select value={status} onValueChange={v => setStatus(v as Workflow["status"])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft (won't fire from schedules)</SelectItem>
            <SelectItem value="active">Active (schedules can fire it)</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Budget cap (USD per run)">
        <Input value={budget} onChange={e => setBudget(e.target.value)} type="number" step="0.5" />
      </Field>
      <Field label="Max steps per run">
        <Input value={maxSteps} onChange={e => setMaxSteps(e.target.value)} type="number" />
      </Field>
      <Field label="Max loop iterations">
        <Input value={maxLoopIters} onChange={e => setMaxLoopIters(e.target.value)} type="number" />
      </Field>
      <Button size="sm" onClick={save}><Save className="w-3 h-3 mr-1" /> Save settings</Button>

      {issues.length > 0 && (
        <div className="border-t border-zinc-800/60 pt-3 mt-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Graph issues</div>
          <ul className="space-y-1">
            {issues.map((i, idx) => (
              <li key={idx} className={`text-[11px] ${i.level === "error" ? "text-red-400" : "text-amber-400"}`}>
                {i.level === "error" ? "✗" : "⚠"} {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Action buttons ────────────────────────────────────────────────────────

function ExplainButton({ workflowId }: { workflowId: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7" onClick={async () => {
          setOpen(true); setText(null); setLoading(true)
          try { const r = await explainWorkflow(workflowId); setText(r.explanation) }
          catch (e) { setText(`Error: ${(e as Error).message}`) }
          finally { setLoading(false) }
        }}>
          <Sparkles className="w-3 h-3 mr-1" /> Explain in plain English
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-400" /> What this workflow does</DialogTitle></DialogHeader>
        <div className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
          {loading ? "Asking Claude…" : (text || "No explanation available.")}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DryRunButton({ workflowId, disabled }: { workflowId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [json, setJson] = useState("{}")
  const [submitting, setSubmitting] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7" disabled={disabled}><FlaskConical className="w-3 h-3 mr-1" /> Dry run</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Dry run with sample data</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <Label>Sample input (JSON)</Label>
          <Textarea value={json} onChange={e => setJson(e.target.value)} rows={6} className="font-mono text-xs" />
          <p className="text-xs text-zinc-500">Agents return mock output. No money spent. Watch live in the Runs subtab.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={async () => {
            setSubmitting(true)
            try {
              const input = JSON.parse(json || "{}")
              const r = await dryRunWorkflow(workflowId, input)
              toast.success(`Dry run ${r.run_id.slice(0, 8)} queued — switch to Runs subtab.`)
              setOpen(false)
            } catch (e) { toast.error((e as Error).message) }
            finally { setSubmitting(false) }
          }} disabled={submitting}>{submitting ? "Queueing..." : "Run"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RunButton({ workflowId, disabled }: { workflowId: string; disabled: boolean; onClose: () => void }) {
  const [open, setOpen] = useState(false)
  const [json, setJson] = useState("{}")
  const [submitting, setSubmitting] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled}><Play className="w-3 h-3 mr-1" /> Run now</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Run workflow</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <Label>Input (JSON)</Label>
          <Textarea value={json} onChange={e => setJson(e.target.value)} rows={6} className="font-mono text-xs" />
          <p className="text-xs text-zinc-500">Real LLM calls — counts toward your daily cap. Watch live in the Runs subtab.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={async () => {
            setSubmitting(true)
            try {
              const input = JSON.parse(json || "{}")
              const r = await runWorkflow(workflowId, input)
              toast.success(`Run ${r.run_id.slice(0, 8)} queued — switch to Runs subtab.`)
              setOpen(false)
            } catch (e) { toast.error((e as Error).message) }
            finally { setSubmitting(false) }
          }} disabled={submitting}>{submitting ? "Queueing..." : "Run"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
