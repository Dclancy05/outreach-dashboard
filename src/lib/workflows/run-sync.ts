/**
 * Synchronous workflow executor — fallback path when Inngest isn't wired.
 *
 * Walks a single-agent workflow graph in-process: loads the run + workflow,
 * resolves the first agent node, calls the VPS agent-runner, writes back the
 * result, and dispatches the standard run_completed / run_failed Telegram
 * notifications via dispatchNotification.
 *
 * Limitations vs runWorkflow (Inngest):
 *  - No durability — if the function dies mid-flight, the run is stuck running.
 *  - Single agent-node only. Loops, orchestrators, approvals are skipped.
 *  - No per-step checkpointing — only the run row is updated.
 *
 * Use this for "Quick Ask" style flows where latency + simplicity > durability.
 * For multi-step workflows (Build Feature End-to-End, Investigate Bug, etc.)
 * Inngest cloud must be configured (INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"
import { dispatchNotification } from "@/lib/notifications/dispatch"

type GraphNode = {
  id: string
  type: string
  data?: {
    agent_slug?: string
    prompt?: string
    output_var?: string
    label?: string
  }
}

type Graph = {
  nodes?: GraphNode[]
  edges?: { source: string; target: string }[]
}

function renderTemplate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k]
    return v === undefined || v === null ? "" : String(v)
  })
}

function extractMeta(input: Record<string, unknown>): {
  source?: string
  telegram_chat_id?: string | number
  telegram_message_id?: number
} {
  const m = (input as { _meta?: unknown })._meta
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {}
}

function pickReplyText(output: unknown): string {
  if (typeof output === "string") return output
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>
    for (const k of ["reply", "text", "output", "result", "answer", "message"]) {
      const v = o[k]
      if (typeof v === "string" && v.trim()) return v
    }
    return JSON.stringify(o)
  }
  return String(output)
}

export async function runWorkflowSync(args: {
  run_id: string
  workflow_id: string
  input: Record<string, unknown>
}): Promise<void> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const { run_id, workflow_id, input } = args
  const meta = extractMeta(input)
  const startedAt = new Date().toISOString()

  // Mark running.
  await sb
    .from("workflow_runs")
    .update({ status: "running", started_at: startedAt })
    .eq("id", run_id)

  // Load workflow graph.
  const { data: workflow, error: wfErr } = await sb
    .from("workflows")
    .select("name, graph, entry_node_id")
    .eq("id", workflow_id)
    .maybeSingle()

  if (wfErr || !workflow) {
    await failRun(sb, run_id, `Workflow not found: ${wfErr?.message || workflow_id}`, meta)
    return
  }

  const graph = (workflow.graph || {}) as Graph
  const nodes = graph.nodes || []
  const agentNode = nodes.find((n) => n.type === "agent")
  if (!agentNode || !agentNode.data?.agent_slug) {
    await failRun(sb, run_id, "No agent node found in workflow graph", meta)
    return
  }

  // Render prompt template against the input vars.
  const promptTpl = agentNode.data.prompt || "{{message}}"
  const prompt = renderTemplate(promptTpl, input)

  // Call the agent-runner.
  const url = await getSecret("AGENT_RUNNER_URL")
  const token = await getSecret("AGENT_RUNNER_TOKEN")
  if (!url) {
    await failRun(sb, run_id, "AGENT_RUNNER_URL not configured (api_keys table)", meta)
    return
  }

  let output: unknown = null
  let cost_usd = 0
  let tokens = 0
  try {
    const res = await fetch(`${url}/agents/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        agent_slug: agentNode.data.agent_slug,
        prompt,
        vars: input,
        parent_run_id: run_id,
      }),
      signal: AbortSignal.timeout(110_000), // under Vercel 120s + Telegram 60s buffer
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`agent-runner ${res.status}: ${body.slice(0, 300)}`)
    }
    // Agent-runner currently returns { result, total_cost_usd, usage } —
    // accept both that shape and the `output / cost_usd / tokens` shape so a
    // future runner refactor doesn't break us.
    const data = (await res.json()) as {
      output?: unknown
      result?: unknown
      cost_usd?: number
      total_cost_usd?: number
      tokens?: number
      usage?: { total_tokens?: number; tokens?: number }
    }
    output = data.output ?? data.result ?? null
    cost_usd = Number(data.cost_usd ?? data.total_cost_usd) || 0
    tokens =
      Number(data.tokens ?? data.usage?.total_tokens ?? data.usage?.tokens) || 0
  } catch (e) {
    await failRun(sb, run_id, `agent-runner call failed: ${(e as Error).message}`, meta)
    return
  }

  const replyText = pickReplyText(output)

  // Mark succeeded.
  await sb
    .from("workflow_runs")
    .update({
      status: "succeeded",
      finished_at: new Date().toISOString(),
      cost_usd,
      total_tokens: tokens,
      output: typeof output === "object" && output !== null ? output : { reply: replyText },
      summary: replyText.slice(0, 500),
    })
    .eq("id", run_id)

  // Bump the workflow's use_count + last_run_at so the Workflows tab cards
  // show accurate counters. The Inngest path does the same in run-workflow.ts;
  // this mirror keeps the synchronous executor in lockstep.
  const { data: wfMeta } = await sb
    .from("workflows")
    .select("use_count")
    .eq("id", workflow_id)
    .maybeSingle()
  await sb
    .from("workflows")
    .update({
      last_run_at: new Date().toISOString(),
      use_count: (wfMeta?.use_count != null ? Number(wfMeta.use_count) + 1 : 1),
    })
    .eq("id", workflow_id)

  // Notify trigger source.
  try {
    await dispatchNotification(
      "run_completed",
      {
        run_id,
        workflow_name: workflow.name || "Workflow",
        output_text: replyText,
      },
      { meta: meta as Record<string, unknown> },
    )
  } catch (e) {
    console.error("[run-sync] notify completed threw:", (e as Error).message)
  }
}

async function failRun(
  sb: SupabaseClient,
  run_id: string,
  errorMsg: string,
  meta: ReturnType<typeof extractMeta>,
) {
  await sb
    .from("workflow_runs")
    .update({
      status: "failed",
      error: errorMsg,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run_id)

  try {
    await dispatchNotification(
      "run_failed",
      { run_id, error_text: errorMsg },
      { meta: meta as Record<string, unknown> },
    )
  } catch (e) {
    console.error("[run-sync] notify failed threw:", (e as Error).message)
  }
}
