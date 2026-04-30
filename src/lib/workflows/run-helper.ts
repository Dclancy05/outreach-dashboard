// Reusable workflow-run trigger. Mirrors the logic in
// `src/app/api/workflows/[id]/run/route.ts` but takes a slug + structured
// input/metadata so non-HTTP callers (Telegram webhook, future webhooks,
// internal jobs) can fire workflows without a self-HTTP-call.
//
// The `workflows` table currently has no `slug` column (see migration
// 20260427_agent_workflows.sql). Until/unless one is added we resolve the slug
// by matching it case-insensitively against `name`. If a future migration adds
// a real `slug` column, we'll prefer that and fall back to name.
//
// `metadata` is stored inside the run's `input` JSON under a `_meta` key so it
// shows up in the Runs subtab without a schema change. The chosen trigger is
// `'api'` — it's the only allowed value (per the table's CHECK) that fits an
// external webhook source.
//
// Cost guards: we run the same global daily-budget gate the HTTP route does.
// If the gate trips, BudgetExceededError bubbles to the caller.

import { createClient } from "@supabase/supabase-js"
import { inngest, EVENT_RUN_QUEUED } from "@/lib/inngest/client"
import { checkGlobalDailyBudget } from "@/lib/workflow/cost-guards"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export class WorkflowNotFoundError extends Error {
  slug: string
  constructor(slug: string) {
    super(`Workflow not found for slug "${slug}"`)
    this.slug = slug
  }
}

export interface TriggerResult {
  run_id: string
  workflow_id: string
}

/**
 * Look up a workflow by slug (currently matches against `name` case-insensitive
 * since the table has no slug column) and queue a run via Inngest.
 *
 * Throws `WorkflowNotFoundError` if no matching workflow exists.
 * Throws `BudgetExceededError` if the global daily budget cap is hit.
 */
export async function triggerWorkflowBySlug(
  slug: string,
  inputVars: Record<string, unknown>,
  metadata: Record<string, unknown> = {},
): Promise<TriggerResult> {
  // Try slug column first if it exists; otherwise fall back to name match.
  // We swallow "column does not exist" (PGRST: 42703) and retry on name.
  let workflow: { id: string } | null = null

  const slugAttempt = await supabase
    .from("workflows")
    .select("id")
    .eq("slug", slug)
    .eq("is_template", false)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle()

  if (slugAttempt.data) {
    workflow = slugAttempt.data
  } else {
    // Fall back to name match. Try exact case-insensitive first, then
    // de-slugified ("quick-ask" → "quick ask") so callers can pass either
    // form. Pre-loads candidates and matches in JS to handle both directions
    // without burning multiple round-trips.
    const candidates = [slug, slug.replace(/[-_]+/g, " ")]
    for (const candidate of candidates) {
      const nameAttempt = await supabase
        .from("workflows")
        .select("id")
        .ilike("name", candidate)
        .eq("is_template", false)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (nameAttempt.data) {
        workflow = nameAttempt.data
        break
      }
    }
  }

  if (!workflow) throw new WorkflowNotFoundError(slug)

  // Global daily budget gate — same as the HTTP route does.
  await checkGlobalDailyBudget()

  // Stash metadata inside input under a non-colliding key so it survives
  // through to step rendering and shows up in the run's Inputs panel.
  const runInput = {
    ...inputVars,
    _meta: metadata,
  }

  const { data: run, error } = await supabase
    .from("workflow_runs")
    .insert({
      workflow_id: workflow.id,
      trigger: "api",
      status: "queued",
      input: runInput,
    })
    .select("id")
    .single()

  if (error || !run) {
    throw new Error(`Failed to insert workflow_run: ${error?.message || "unknown"}`)
  }

  await inngest.send({
    name: EVENT_RUN_QUEUED,
    data: { run_id: run.id, workflow_id: workflow.id, input: runInput },
  })

  return { run_id: run.id, workflow_id: workflow.id }
}
