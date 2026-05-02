"use client"

/**
 * JarvisWorkflowBuilder — main canvas for /jarvis/workflows.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  [Workflows] segmented strip                                     │
 *   │──────────────────────────────────────────────────────────────────│
 *   │  Title row:  Workflows  [count]   [picker]   [Save Run Templates]│
 *   │──────────────────────────────────────────────────────────────────│
 *   │  ┌────────┬───────────────────────────────────┬───────────────┐  │
 *   │  │ Palette│  xyflow canvas                    │  Inspector    │  │
 *   │  │ 180px  │  (Controls bottom-left,           │  320px        │  │
 *   │  │        │   MiniMap bottom-right)           │  collapsible  │  │
 *   │  └────────┴───────────────────────────────────┴───────────────┘  │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Persistence: PATCH /api/workflows/[id] with { graph } — debounced 1.5s on
 * dirty state. Run dispatch: POST /api/workflows/[id]/run → existing
 * runWorkflow helper which sends an Inngest event under the hood.
 *
 * BUG-031 fix: imperative `fitView({ padding: 0.15, duration: 250 })` runs
 * inside an effect AFTER nodes hydrate from SWR. The xyflow `<ReactFlow fitView />`
 * prop only fires once on mount when nodes are still empty (because hydration
 * is async). See line ~210.
 *
 * BUG-032 fix: canvas wrapper has explicit `position: relative` AND `h-full
 * min-h-[480px]` so xyflow's absolute-positioned `<Controls />` /
 * `<MiniMap />` overlays render. Without an explicit height the parent flex
 * container collapses and the panels paint outside the visible bounds. See
 * line ~233.
 */

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import useSWR from "swr"
import { toast } from "sonner"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Workflow as WorkflowIcon, Plus } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { JarvisSegmentedControl } from "@/components/jarvis/shell/jarvis-segmented-control"
import {
  listWorkflows,
  getWorkflow,
  updateWorkflow,
  createWorkflow,
  type Workflow,
} from "@/lib/api/workflows"
import { listAgents, type Agent } from "@/lib/api/agents"
import { validateGraph, type WorkflowGraph } from "@/lib/workflow/graph"
import {
  NODE_TYPES,
  PALETTE,
} from "@/components/agent-workflows/workflows/nodes"
import { getInitialNodesFromWorkflow } from "@/components/agent-workflows/workflows/workflow-builder"
import { JarvisWorkflowToolbar } from "./jarvis-workflow-toolbar"
import { JarvisWorkflowNodePalette } from "./jarvis-workflow-node-palette"
import { JarvisWorkflowInspector } from "./jarvis-workflow-inspector"

interface JarvisWorkflowBuilderProps {
  /** Workflow id from `?id=`. When null, picker selects most-recent. */
  initialWorkflowId: string | null
}

// ─── Sub-tab strip (workflows is the active page in /jarvis) ──────────────
//
// JarvisSegmentedControl is generic (`onChange: (value: T) => void`). We map
// each option's `value` to the route it should send the user to. "workflows"
// is the active value; clicking another option pushes that route.
const SUBTABS = [
  { value: "agents", label: "Agents", route: "/jarvis/agents" },
  { value: "workflows", label: "Workflows", route: "/jarvis/workflows" },
  { value: "memory", label: "Memory", route: "/jarvis/memory" },
] as const
type SubtabValue = (typeof SUBTABS)[number]["value"]

const fetcher = <T,>(url: string): Promise<T> =>
  fetch(url, { cache: "no-store" }).then((r) => r.json())

export function JarvisWorkflowBuilder({
  initialWorkflowId,
}: JarvisWorkflowBuilderProps) {
  // List + active id come from the same SWR cache that /agency uses.
  const { data: workflows = [], mutate: mutateList } = useSWR<Workflow[]>(
    "workflows",
    () => listWorkflows({})
  )
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // The active id: explicit ?id= → first non-archived workflow → null
  const activeId = React.useMemo(() => {
    if (initialWorkflowId) return initialWorkflowId
    const live = workflows.find((w) => w.status !== "archived")
    return live?.id ?? workflows[0]?.id ?? null
  }, [initialWorkflowId, workflows])

  // Sync ?id=… into the URL when picker changes (replaceState — no nav scroll).
  const setActiveId = React.useCallback(
    (id: string) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "")
      sp.set("id", id)
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  const activeCount = workflows.filter((w) => w.status !== "archived").length

  return (
    {/* Wave 9.α fix: min-h-dvh inside main's overflow-y-auto produced 0px canvas.
        Use deterministic h-[calc(100dvh-80px)] (header 56 + status bar 24) so
        flex-1 children inside have computable height for ReactFlow. */}
    <div className="flex flex-col h-[calc(100dvh-80px)] bg-mem-bg -mx-4 sm:-mx-8 -mt-6 -mb-12">
      {/* Sub-tab strip */}
      <div className="flex items-center gap-2 px-4 sm:px-6 pt-4 shrink-0">
        <JarvisSegmentedControl<SubtabValue>
          options={SUBTABS.map((t) => ({ value: t.value, label: t.label }))}
          value="workflows"
          onChange={(v) => {
            const dest = SUBTABS.find((t) => t.value === v)
            if (dest) router.push(dest.route)
          }}
          ariaLabel="Jarvis workspace tabs"
        />
      </div>

      {/* Title + picker */}
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-3 pb-3 shrink-0 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <WorkflowIcon className="w-5 h-5 text-mem-accent shrink-0" />
          <h1
            className="text-[22px] sm:text-[28px] font-semibold tracking-[-0.01em] text-mem-text-primary leading-none"
            style={{ fontFamily: "Inter Display, Inter, system-ui, sans-serif" }}
          >
            Workflows
          </h1>
          <span
            className="inline-flex items-center h-6 px-2 rounded-full bg-mem-surface-2 border border-mem-border text-mem-text-muted text-[11px] font-mono"
            aria-label={`${activeCount} active workflows`}
          >
            {activeCount}
          </span>
          {workflows.length > 0 && (
            <div className="ml-2 min-w-0">
              <WorkflowPicker
                workflows={workflows}
                activeId={activeId}
                onChange={setActiveId}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <NewWorkflowButton
            onCreated={(w) => {
              void mutateList()
              setActiveId(w.id)
            }}
          />
        </div>
      </header>

      {/* 3-pane builder body */}
      {activeId ? (
        <ReactFlowProvider>
          <BuilderPanes
            workflowId={activeId}
            onSavedExternally={() => void mutateList()}
          />
        </ReactFlowProvider>
      ) : (
        <EmptyWorkflows
          onCreated={(w) => {
            void mutateList()
            setActiveId(w.id)
          }}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Picker                                    */
/* -------------------------------------------------------------------------- */

function WorkflowPicker({
  workflows,
  activeId,
  onChange,
}: {
  workflows: Workflow[]
  activeId: string | null
  onChange: (id: string) => void
}) {
  return (
    <Select value={activeId ?? undefined} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[220px] sm:w-[280px] bg-mem-surface-1 border-mem-border text-mem-text-primary text-[12px]">
        <SelectValue placeholder="Pick a workflow" />
      </SelectTrigger>
      <SelectContent>
        {workflows.map((w) => (
          <SelectItem key={w.id} value={w.id} className="text-[12px]">
            <span className="mr-1.5">{w.emoji ?? "⚙️"}</span>
            {w.name}
            <span className="ml-2 text-mem-text-muted text-[10px] uppercase tracking-wider">
              {w.status}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/* -------------------------------------------------------------------------- */
/*                          New workflow button + dialog                      */
/* -------------------------------------------------------------------------- */

function NewWorkflowButton({
  onCreated,
}: {
  onCreated: (workflow: Workflow) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [emoji, setEmoji] = React.useState("⚙️")
  const [submitting, setSubmitting] = React.useState(false)

  async function submit() {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const created = await createWorkflow({
        name: name.trim(),
        emoji,
      } as Partial<Workflow> & { name: string })
      toast.success(`Created "${created.name}"`)
      onCreated(created)
      setOpen(false)
      setName("")
      setEmoji("⚙️")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        className="h-8 bg-mem-accent text-white hover:brightness-110 text-[12px]"
        onClick={() => setOpen(true)}
        data-testid="jarvis-new-workflow"
      >
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        New workflow
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New workflow</DialogTitle>
          <DialogDescription className="text-mem-text-muted text-[12px]">
            Blank canvas. Drag in nodes from the left palette, hit Save when
            you&apos;re happy. You can add a description and template later
            from the inspector.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div>
              <Label htmlFor="jw-emoji" className="text-xs">
                Emoji
              </Label>
              <Input
                id="jw-emoji"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={4}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="jw-name" className="text-xs">
                Name
              </Label>
              <Input
                id="jw-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Daily report"
                className="mt-1"
                autoFocus
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !name.trim()}
            className="bg-mem-accent text-white hover:brightness-110"
          >
            {submitting ? "Creating…" : "Create + open"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/*                              Empty state                                   */
/* -------------------------------------------------------------------------- */

function EmptyWorkflows({
  onCreated,
}: {
  onCreated: (workflow: Workflow) => void
}) {
  return (
    <div className="flex-1 flex items-center justify-center text-center px-6 py-16">
      <div className="max-w-md">
        <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-mem-surface-2 border border-mem-border flex items-center justify-center">
          <WorkflowIcon className="w-6 h-6 text-mem-text-muted" />
        </div>
        <h2 className="text-mem-text-primary font-semibold text-lg">
          No workflows yet
        </h2>
        <p className="text-mem-text-secondary text-[13px] mt-1 mb-4">
          Workflows are visual recipes that chain agents together — loops,
          approval gates, scheduled overnight runs.
        </p>
        <div className="flex items-center justify-center gap-2">
          <NewWorkflowButton onCreated={onCreated} />
          <Link
            href="/jarvis/agents?tab=workflows"
            className="text-[12px] text-mem-text-muted hover:text-mem-text-primary underline-offset-2 hover:underline"
          >
            Browse templates
          </Link>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                              Builder panes                                 */
/* -------------------------------------------------------------------------- */

interface BuilderPanesProps {
  workflowId: string
  onSavedExternally: () => void
}

function BuilderPanes({ workflowId, onSavedExternally }: BuilderPanesProps) {
  const { data: wf, mutate: mutateWf } = useSWR<Workflow>(
    ["workflow", workflowId],
    () => getWorkflow(workflowId)
  )
  const { data: agents = [] } = useSWR<Agent[]>("agents-builder", () =>
    listAgents({})
  )
  const { fitView } = useReactFlow()

  const [nodes, setNodes] = React.useState<Node[]>([])
  const [edges, setEdges] = React.useState<Edge[]>([])
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(
    null
  )
  const [dirty, setDirty] = React.useState(false)
  const lastSavedRef = React.useRef<string>("")
  const hasFitRef = React.useRef(false)

  // Hydrate from server using the legacy helper so we share one cast contract.
  React.useEffect(() => {
    if (!wf) return
    hasFitRef.current = false // re-fit when workflow changes
    const init = getInitialNodesFromWorkflow(wf)
    setNodes(init.nodes)
    setEdges(init.edges)
    lastSavedRef.current = JSON.stringify(wf.graph)
    setDirty(false)
    setSelectedNodeId(null)
  }, [wf])

  // BUG-031 fix: imperative fitView once nodes have hydrated. xyflow's
  // fitView prop only fires on first paint — at that point our nodes were [].
  React.useEffect(() => {
    if (hasFitRef.current) return
    if (nodes.length === 0) return
    hasFitRef.current = true
    const raf = requestAnimationFrame(() => {
      fitView({ padding: 0.15, duration: 250 })
    })
    return () => cancelAnimationFrame(raf)
  }, [nodes, fitView])

  // Debounced autosave.
  React.useEffect(() => {
    if (!dirty || !wf) return
    const t = setTimeout(async () => {
      const g: WorkflowGraph = {
        nodes: nodes as unknown as WorkflowGraph["nodes"],
        edges: edges as unknown as WorkflowGraph["edges"],
        viewport: wf.graph.viewport,
      }
      const serialized = JSON.stringify(g)
      if (serialized === lastSavedRef.current) {
        setDirty(false)
        return
      }
      try {
        await updateWorkflow(workflowId, { graph: g } as Partial<Workflow>)
        lastSavedRef.current = serialized
        setDirty(false)
        onSavedExternally()
      } catch (e) {
        toast.error(`Autosave failed: ${(e as Error).message}`)
      }
    }, 1500)
    return () => clearTimeout(t)
  }, [dirty, nodes, edges, wf, workflowId, onSavedExternally])

  const onNodesChange = React.useCallback((changes: NodeChange[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns))
    if (
      changes.some(
        (c) =>
          c.type === "position" ||
          c.type === "remove" ||
          c.type === "dimensions"
      )
    )
      setDirty(true)
  }, [])

  const onEdgesChange = React.useCallback((changes: EdgeChange[]) => {
    setEdges((es) => applyEdgeChanges(changes, es))
    setDirty(true)
  }, [])

  const onConnect = React.useCallback((conn: Connection) => {
    setEdges((es) =>
      addEdge({ ...conn, id: `e_${Date.now()}` }, es)
    )
    setDirty(true)
  }, [])

  const issues = React.useMemo(
    () =>
      validateGraph({
        nodes: nodes as unknown as WorkflowGraph["nodes"],
        edges: edges as unknown as WorkflowGraph["edges"],
      }),
    [nodes, edges]
  )
  const errorCount = issues.filter((i) => i.level === "error").length

  function addNodeFromPalette(type: keyof typeof NODE_TYPES) {
    const id = `${type}_${Math.random().toString(36).slice(2, 8)}`
    const newNode: Node = {
      id,
      type,
      position: { x: 200 + nodes.length * 30, y: 100 + nodes.length * 30 },
      data: defaultDataForType(type),
      ...(type === "loop" ? { style: { width: 480, height: 260 } } : {}),
    }
    setNodes((ns) => [...ns, newNode])
    setSelectedNodeId(id)
    setDirty(true)
  }

  function updateSelectedNodeData(patch: Record<string, unknown>) {
    if (!selectedNodeId) return
    setNodes((ns) =>
      ns.map((n) =>
        n.id === selectedNodeId
          ? { ...n, data: { ...n.data, ...patch } as Record<string, unknown> }
          : n
      )
    )
    setDirty(true)
  }

  function deleteSelected() {
    if (!selectedNodeId) return
    setNodes((ns) => ns.filter((n) => n.id !== selectedNodeId))
    setEdges((es) =>
      es.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId
      )
    )
    setSelectedNodeId(null)
    setDirty(true)
  }

  // Manual save (also triggers from toolbar). Bypasses the 1.5s debounce.
  async function saveNow() {
    if (!wf) return
    const g: WorkflowGraph = {
      nodes: nodes as unknown as WorkflowGraph["nodes"],
      edges: edges as unknown as WorkflowGraph["edges"],
      viewport: wf.graph.viewport,
    }
    try {
      await updateWorkflow(workflowId, { graph: g } as Partial<Workflow>)
      lastSavedRef.current = JSON.stringify(g)
      setDirty(false)
      toast.success("Saved")
      void mutateWf()
      onSavedExternally()
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`)
    }
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null

  return (
    <>
      <JarvisWorkflowToolbar
        workflowId={workflowId}
        dirty={dirty}
        errorCount={errorCount}
        onSaveNow={saveNow}
        onFitView={() => fitView({ padding: 0.15, duration: 250 })}
      />

      <div className="flex-1 min-h-0 flex border-t border-mem-border">
        {/* Palette */}
        <JarvisWorkflowNodePalette onAdd={addNodeFromPalette} />

        {/* BUG-032 fix: explicit relative + h-full + min-h so xyflow's
            absolute Controls/MiniMap render. min-h covers the case where the
            parent flex never measures because no child has intrinsic height. */}
        <div className="relative flex-1 min-w-0 h-full min-h-[480px] bg-mem-surface-1">
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
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#27272a" gap={16} />
            <Controls
              className="!bg-mem-surface-2/90 !border-mem-border !rounded-md"
              showInteractive={false}
              position="bottom-left"
            />
            <MiniMap
              pannable
              zoomable
              className="!bg-mem-surface-2/90 !border-mem-border !rounded-md"
              maskColor="rgba(10,10,11,0.65)"
              position="bottom-right"
            />
          </ReactFlow>
        </div>

        {/* Inspector */}
        <JarvisWorkflowInspector
          workflow={wf ?? null}
          selectedNode={selectedNode}
          agents={agents}
          allNodes={nodes}
          issues={issues}
          onChange={updateSelectedNodeData}
          onDelete={deleteSelected}
          onWorkflowUpdated={() => void mutateWf()}
        />
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*                          Default node data per type                        */
/* -------------------------------------------------------------------------- */

function defaultDataForType(
  type: keyof typeof NODE_TYPES
): Record<string, unknown> {
  switch (type) {
    case "trigger":
      return { label: "Start", input_schema: {} }
    case "agent":
      return {
        label: "New agent step",
        agent_slug: "",
        prompt: "",
        output_var: "result",
      }
    case "orchestrator":
      return { label: "Orchestrator", agent_slug: "", routes: [] }
    case "loop":
      return {
        label: "Loop",
        mode: "until",
        condition: "$.tests.failed === 0",
        max_iterations: 10,
      }
    case "router":
      return { label: "If / Else", condition: "$.value === true" }
    case "approval":
      return {
        label: "Approve",
        message: "Approve this step?\n\n{{draft}}",
        channel: "in_app",
        timeout_minutes: 1440,
      }
    case "output":
      return { label: "Done", output_schema: {} }
  }
}
