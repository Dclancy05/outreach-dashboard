// Types and helpers for the xyflow graph stored in workflows.graph (jsonb).
// The graph is the source of truth; the runner (Inngest function) walks it
// and dispatches each node to the VPS agent runner. Mutations happen in the
// visual builder via @xyflow/react and serialize back via toObject().

export type NodeKind =
  | "trigger"
  | "agent"
  | "orchestrator"
  | "loop"
  | "router"
  | "approval"
  | "output"

interface BaseNode<K extends NodeKind, D> {
  id: string
  type: K
  position: { x: number; y: number }
  /** xyflow group-node containment (Loop nodes contain children) */
  parentNode?: string
  extent?: "parent"
  style?: { width?: number; height?: number }
  data: D
}

export type TriggerNode = BaseNode<"trigger", {
  label: string
  /** rough JSON-Schema-ish: { fieldName: typeName } */
  input_schema?: Record<string, string>
}>

export type AgentNode = BaseNode<"agent", {
  label: string
  agent_slug: string
  /** Mustache-style template, vars resolved from the run's variable bag */
  prompt: string
  output_var: string
}>

export type OrchestratorNode = BaseNode<"orchestrator", {
  label: string
  agent_slug: string
  /** node ids the orchestrator is allowed to route to */
  routes: string[]
}>

export type LoopNode = BaseNode<"loop", {
  label: string
  mode: "for_each" | "while" | "until"
  /** for_each: collection var name. while/until: JS-ish expression evaluated each iter */
  condition?: string
  collection_var?: string
  max_iterations: number
}>

export type RouterNode = BaseNode<"router", {
  label: string
  /** JS-ish expression returning truthy/falsy. true → first outgoing edge, false → second */
  condition: string
}>

export type ApprovalNode = BaseNode<"approval", {
  label: string
  /** Mustache template — what the human sees */
  message: string
  channel: "in_app" | "sms" | "email"
  timeout_minutes: number
}>

export type OutputNode = BaseNode<"output", {
  label: string
  output_schema?: Record<string, string>
}>

export type WorkflowNode =
  | TriggerNode
  | AgentNode
  | OrchestratorNode
  | LoopNode
  | RouterNode
  | ApprovalNode
  | OutputNode

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  label?: string
  data?: { branch?: "true" | "false"; condition?: string }
}

export interface WorkflowGraph {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  viewport?: { x: number; y: number; zoom: number }
}

export const EMPTY_GRAPH: WorkflowGraph = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
}

// ─── Validation ─────────────────────────────────────────────────────────────

export interface GraphIssue {
  level: "error" | "warning"
  node_id?: string
  edge_id?: string
  message: string
}

export function validateGraph(g: WorkflowGraph): GraphIssue[] {
  const issues: GraphIssue[] = []
  const ids = new Set<string>()
  let triggerCount = 0
  let outputCount = 0

  for (const n of g.nodes) {
    if (ids.has(n.id)) issues.push({ level: "error", node_id: n.id, message: `Duplicate node id "${n.id}"` })
    ids.add(n.id)
    if (n.type === "trigger") triggerCount++
    if (n.type === "output") outputCount++
    if (n.type === "agent" && !n.data.agent_slug) {
      issues.push({ level: "error", node_id: n.id, message: `Agent node "${n.data.label}" has no agent selected` })
    }
    if (n.type === "orchestrator" && (!n.data.routes || n.data.routes.length === 0)) {
      issues.push({ level: "warning", node_id: n.id, message: `Orchestrator "${n.data.label}" has no routes — it can't decide where to go` })
    }
    if (n.type === "loop" && (!n.data.max_iterations || n.data.max_iterations < 1)) {
      issues.push({ level: "error", node_id: n.id, message: `Loop "${n.data.label}" needs max_iterations ≥ 1` })
    }
  }

  if (triggerCount === 0) issues.push({ level: "error", message: "Workflow needs a Trigger node" })
  if (triggerCount > 1) issues.push({ level: "error", message: "Only one Trigger node is allowed" })
  if (outputCount === 0) issues.push({ level: "warning", message: "No Output node — the run won't have a final result" })

  for (const e of g.edges) {
    if (!ids.has(e.source)) issues.push({ level: "error", edge_id: e.id, message: `Edge ${e.id}: source ${e.source} not found` })
    if (!ids.has(e.target)) issues.push({ level: "error", edge_id: e.id, message: `Edge ${e.id}: target ${e.target} not found` })
  }

  // detect orphan nodes (no incoming AND not a trigger AND not inside a loop)
  const inLoop = new Set(g.nodes.filter(n => n.parentNode).map(n => n.id))
  const incoming = new Set(g.edges.map(e => e.target))
  for (const n of g.nodes) {
    if (n.type === "trigger") continue
    if (inLoop.has(n.id)) continue
    if (!incoming.has(n.id)) {
      issues.push({ level: "warning", node_id: n.id, message: `"${n.data.label}" has no incoming edge — it'll never run` })
    }
  }

  return issues
}

// ─── Graph walking ──────────────────────────────────────────────────────────

export function getNode(g: WorkflowGraph, id: string): WorkflowNode | null {
  return g.nodes.find(n => n.id === id) ?? null
}

export function getOutgoing(g: WorkflowGraph, nodeId: string): WorkflowEdge[] {
  return g.edges.filter(e => e.source === nodeId)
}

/** First outgoing edge whose data.branch matches "true"/"false", else first edge. */
export function getBranchEdge(g: WorkflowGraph, nodeId: string, branch: "true" | "false"): WorkflowEdge | null {
  const outs = getOutgoing(g, nodeId)
  return outs.find(e => e.data?.branch === branch) ?? outs[0] ?? null
}

/** Children of a Loop container node, in topological order from the loop's internal entry. */
export function getLoopChildren(g: WorkflowGraph, loopId: string): WorkflowNode[] {
  return g.nodes.filter(n => n.parentNode === loopId)
}

export function findEntry(g: WorkflowGraph): WorkflowNode | null {
  return g.nodes.find(n => n.type === "trigger") ?? null
}

// ─── Variable templating ────────────────────────────────────────────────────

const TEMPLATE_RE = /\{\{\s*([\w.]+)\s*\}\}/g

/** Resolve {{var}} and {{var.path}} against the variable bag. Missing → empty string. */
export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(TEMPLATE_RE, (_, path: string) => {
    const parts = path.split(".")
    let cur: unknown = vars
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p]
      } else {
        return ""
      }
    }
    if (cur == null) return ""
    if (typeof cur === "string") return cur
    return JSON.stringify(cur)
  })
}

/** Eval a router/loop condition. Restricted to simple expressions over $.path values. */
export function evalCondition(expr: string, vars: Record<string, unknown>): boolean {
  // Replace $.path references with JSON.stringify(value); leave the rest of the
  // expression alone. Then `new Function` it. This is intentionally simple —
  // workflows are user-authored in a visual builder, not arbitrary remote code.
  const rewritten = expr.replace(/\$\.([\w.]+)/g, (_, path: string) => {
    const parts = path.split(".")
    let cur: unknown = vars
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p]
      } else {
        return "undefined"
      }
    }
    return JSON.stringify(cur)
  })
  try {
    return Boolean(new Function(`return (${rewritten})`)())
  } catch {
    return false
  }
}
