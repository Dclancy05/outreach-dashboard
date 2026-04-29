// Workflow template registry.
//
// This is the canonical source-of-truth for *seedable* workflow templates that
// ship with the product. Edit the matching JSON in seeds/workflows/, register
// it here, and run `npm run seed:workflows` to upsert into the live DB.
//
// Phase 1 ships only "Quick Ask" — the default reply workflow used by the
// Telegram bot. Phase 2 will add four more (research+draft, code-loop fast,
// daily-report, etc.).
//
// Why a typed registry instead of just iterating files: the WorkflowTemplate
// type forces every template to declare the same fields the `workflows` table
// requires (id, graph, entry_node_id, …) so the seed script can't silently
// insert malformed rows. If you add a column to the table, update the type
// here and the compiler will tell you which templates need updating.

import quickAsk from "../../../seeds/workflows/quick-ask.json"

/** xyflow-compatible node. We keep this loose because each node `type` has a
 *  different `data` shape (agent / loop / router / approval / …). The runner
 *  in src/lib/workflow/graph.ts validates per-type at execution time. */
export interface TemplateNode {
  id: string
  type: "trigger" | "agent" | "orchestrator" | "loop" | "router" | "approval" | "output"
  position: { x: number; y: number }
  parentNode?: string
  extent?: "parent"
  style?: Record<string, unknown>
  data: Record<string, unknown>
}

export interface TemplateEdge {
  id: string
  source: string
  target: string
  label?: string
  data?: Record<string, unknown>
}

export interface TemplateGraph {
  nodes: TemplateNode[]
  edges: TemplateEdge[]
  viewport?: { x: number; y: number; zoom: number }
}

/** Mirrors the columns the seed script writes to `workflows`. Stable `id` is
 *  required so re-running `seed:workflows` is idempotent (upserts on id). */
export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  emoji?: string
  status: "draft" | "active" | "archived"
  is_template: boolean
  budget_usd: number
  max_steps: number
  max_loop_iters: number
  entry_node_id: string
  graph: TemplateGraph
}

/** Registered templates. Order here is the order they appear in the UI's
 *  "Start from template" picker. */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  quickAsk as WorkflowTemplate,
]

/** Find a template by its stable id. Returns undefined if not registered. */
export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id)
}
