// Cost guards enforced at three layers (workflow / step / global daily).
// Mandatory by design — see plan §"Cost guards". A guard trip flips the run
// to status='budget_exceeded' so it shows up clearly in the Runs subtab.

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export class BudgetExceededError extends Error {
  layer: "workflow" | "step" | "global" | "loop_iter"
  details: Record<string, unknown>
  constructor(layer: BudgetExceededError["layer"], message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.layer = layer
    this.details = details
  }
}

export interface RunCostState {
  cost_usd: number
  total_tokens: number
  step_count: number
}

export async function getRunCostState(run_id: string): Promise<RunCostState> {
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("cost_usd, total_tokens")
    .eq("id", run_id)
    .single()
  if (error || !data) throw new Error(`Run ${run_id} not found`)
  const { count } = await supabase
    .from("workflow_steps")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run_id)
  return {
    cost_usd: Number(data.cost_usd) || 0,
    total_tokens: data.total_tokens || 0,
    step_count: count || 0,
  }
}

export interface WorkflowLimits {
  budget_usd: number
  max_steps: number
  max_loop_iters: number
}

/** Throws BudgetExceededError if the next step would push us over a workflow limit. */
export function checkWorkflowLimits(state: RunCostState, limits: WorkflowLimits, projected_step_cost = 0) {
  if (state.cost_usd + projected_step_cost >= limits.budget_usd) {
    throw new BudgetExceededError("workflow",
      `Workflow budget cap hit ($${state.cost_usd.toFixed(2)} of $${limits.budget_usd.toFixed(2)})`,
      { spent: state.cost_usd, cap: limits.budget_usd })
  }
  if (state.step_count >= limits.max_steps) {
    throw new BudgetExceededError("workflow",
      `Workflow step cap hit (${state.step_count} of ${limits.max_steps})`,
      { steps: state.step_count, cap: limits.max_steps })
  }
}

export function checkLoopIterations(iteration: number, max_loop_iters: number) {
  if (iteration >= max_loop_iters) {
    throw new BudgetExceededError("loop_iter",
      `Loop iteration cap hit (${iteration} of ${max_loop_iters})`,
      { iteration, cap: max_loop_iters })
  }
}

/** Today's spend across all runs, in USD. Used for the global daily cap. */
export async function getGlobalDailySpend(): Promise<number> {
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("cost_usd")
    .gte("created_at", since.toISOString())
  if (error) return 0
  return (data || []).reduce((acc, r) => acc + (Number(r.cost_usd) || 0), 0)
}

export async function checkGlobalDailyBudget(): Promise<void> {
  const cap = Number(process.env.WORKFLOW_DAILY_BUDGET_USD || 25)
  const spent = await getGlobalDailySpend()
  if (spent >= cap) {
    throw new BudgetExceededError("global",
      `Global daily budget hit ($${spent.toFixed(2)} of $${cap.toFixed(2)})`,
      { spent, cap })
  }
}

export async function markRunBudgetExceeded(run_id: string, err: BudgetExceededError) {
  await supabase
    .from("workflow_runs")
    .update({
      status: "budget_exceeded",
      finished_at: new Date().toISOString(),
      error: `${err.layer}: ${err.message}`,
    })
    .eq("id", run_id)
}
