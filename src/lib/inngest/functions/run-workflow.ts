// The durable function that executes a workflow end-to-end.
//
// Why Inngest: every step.run() is a checkpoint. If Inngest crashes, the
// dashboard restarts, or the laptop sleeps — the function resumes from the
// last completed step instead of restarting. step.waitForEvent lets the
// Approval node pause indefinitely without burning compute. Native step
// retries handle transient VPS failures with backoff.
//
// Flow per run:
//   1. Load the workflow (and graph) from Supabase
//   2. Mark run as 'running'
//   3. Walk the graph from the trigger node
//   4. Per node: dispatch to its handler (agent / loop / approval / router / orchestrator / output)
//      Each dispatch is wrapped in step.run() so it's checkpointed
//   5. Cost guards run after every step — trip → mark run budget_exceeded → return
//   6. On completion: mark run succeeded, fire summary generation as a follow-up event
//
// Loops (the big requirement Dylan named) execute as a JS for-loop *inside*
// the function. Each iteration's body is itself a sequence of step.run() calls
// — Inngest persists state per call, so a loop interrupted mid-iter-7 resumes
// exactly there.
//
// Telegram completion: when a run was triggered by the Telegram bot (Jarvis
// remote-Claude — see src/app/api/telegram/webhook/route.ts), the producer
// stashes routing metadata under `input._meta = { source: 'telegram',
// telegram_chat_id, telegram_message_id }`. After the run succeeds (or fails)
// we fire one Telegram message back to that chat so Dylan sees the result on
// his phone without opening the dashboard. We use a dynamic import for
// `@/lib/telegram` so the type/build is decoupled from Agent A's parallel work
// — and so a Telegram outage can't take down the workflow runner.

import { createClient } from "@supabase/supabase-js"
import { inngest, EVENT_RUN_QUEUED, EVENT_RUN_APPROVAL, EVENT_RUN_ABORTED, type RunQueuedEvent } from "@/lib/inngest/client"
import {
  type WorkflowGraph, type WorkflowNode, findEntry, getNode, getOutgoing,
  getBranchEdge, getLoopChildren, renderTemplate, evalCondition,
} from "@/lib/workflow/graph"
import {
  BudgetExceededError, checkWorkflowLimits, checkLoopIterations,
  checkGlobalDailyBudget, getRunCostState, markRunBudgetExceeded,
} from "@/lib/workflow/cost-guards"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const AGENT_RUNNER_URL   = process.env.AGENT_RUNNER_URL   || "http://localhost:10001"
const AGENT_RUNNER_TOKEN = process.env.AGENT_RUNNER_TOKEN || ""

// ─── Per-step helpers ──────────────────────────────────────────────────────

interface StepResult {
  output: Record<string, unknown>
  cost_usd: number
  tokens: number
  log_url?: string
  /** For orchestrator: which downstream node id to route to next */
  next_node_id?: string
}

interface StepContext {
  run_id: string
  workflow_id: string
  vars: Record<string, unknown>
  dry_run: boolean
  parent_step_id?: string | null
  iteration?: number
}

/** Trigger metadata threaded through `input._meta` by the producer. The
 *  workflow_runs table has no dedicated `metadata` column (per migration
 *  20260427_agent_workflows.sql) so callers piggyback on `input`. */
interface TriggerMeta {
  source?: "telegram" | "api" | "schedule" | "manual" | "test" | string
  telegram_chat_id?: string | number
  telegram_message_id?: number
}

function extractMeta(input: Record<string, unknown>): TriggerMeta {
  const m = (input as { _meta?: unknown })._meta
  if (m && typeof m === "object") return m as TriggerMeta
  return {}
}

/** Pull a human-readable reply string out of the run's vars. We look at the
 *  graph's last agent node's `output_var` first, then common names ("reply",
 *  "answer", "text", "draft"), then fall back to a JSON dump. */
function extractFinalReply(graph: WorkflowGraph, vars: Record<string, unknown>): string {
  const stringify = (v: unknown): string => {
    if (typeof v === "string") return v
    if (v == null) return ""
    if (typeof v === "object") {
      const obj = v as Record<string, unknown>
      // Agent-runner often returns { text } or { reply } or { content }.
      if (typeof obj.text === "string") return obj.text
      if (typeof obj.reply === "string") return obj.reply
      if (typeof obj.content === "string") return obj.content
      if (typeof obj.message === "string") return obj.message
      try { return JSON.stringify(v, null, 2) } catch { return String(v) }
    }
    return String(v)
  }

  // Walk nodes in declared order; remember the last agent node's output_var.
  let lastVar: string | undefined
  for (const n of graph.nodes) {
    if (n.type === "agent") {
      const ov = (n.data as { output_var?: string }).output_var
      if (ov) lastVar = ov
    }
  }
  if (lastVar && lastVar in vars) {
    const out = stringify(vars[lastVar])
    if (out) return out
  }
  for (const k of ["reply", "answer", "text", "draft", "content", "result"]) {
    if (k in vars) {
      const out = stringify(vars[k])
      if (out) return out
    }
  }
  // Last resort: dump everything except internal `_meta`.
  const { _meta: _omit, ...rest } = vars as { _meta?: unknown } & Record<string, unknown>
  void _omit
  try { return JSON.stringify(rest, null, 2) } catch { return String(rest) }
}

function truncateForTelegram(text: string, max = 3500): string {
  if (text.length <= max) return text
  return text.slice(0, max - 100) + "\n\n…(truncated)"
}

async function recordStep(
  ctx: StepContext,
  node: WorkflowNode,
  status: "running" | "succeeded" | "failed" | "awaiting_approval" | "skipped",
  partial: Partial<{ input: unknown; output: unknown; cost_usd: number; tokens: number; log_url: string; error: string }> = {},
  existing_id?: string,
): Promise<string> {
  if (existing_id) {
    await supabase.from("workflow_steps").update({
      status,
      ...(status === "succeeded" || status === "failed" ? { finished_at: new Date().toISOString() } : {}),
      ...partial,
    }).eq("id", existing_id)
    return existing_id
  }
  const { data, error } = await supabase.from("workflow_steps").insert({
    run_id: ctx.run_id,
    parent_step_id: ctx.parent_step_id ?? null,
    node_id: node.id,
    node_type: node.type,
    agent_id: null,
    iteration: ctx.iteration ?? 0,
    status,
    started_at: new Date().toISOString(),
    ...partial,
  }).select("id").single()
  if (error || !data) throw new Error(`Failed to record step: ${error?.message}`)
  return data.id
}

async function callAgentRunner(
  agent_slug: string,
  prompt: string,
  vars: Record<string, unknown>,
  parent_run_id: string,
  dry_run: boolean,
): Promise<StepResult> {
  if (dry_run) {
    return {
      output: { mock: true, agent: agent_slug, prompt_preview: prompt.slice(0, 200) },
      cost_usd: 0.001,
      tokens: 250,
    }
  }
  const res = await fetch(`${AGENT_RUNNER_URL}/agents/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(AGENT_RUNNER_TOKEN ? { Authorization: `Bearer ${AGENT_RUNNER_TOKEN}` } : {}),
    },
    body: JSON.stringify({ agent_slug, prompt, vars, parent_run_id }),
    signal: AbortSignal.timeout(300_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Agent runner ${agent_slug} returned ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json() as {
    output: Record<string, unknown>
    cost_usd?: number
    tokens?: number
    log_url?: string
  }
  return {
    output: data.output ?? {},
    cost_usd: Number(data.cost_usd) || 0,
    tokens: Number(data.tokens) || 0,
    log_url: data.log_url,
  }
}

async function bumpRunCost(run_id: string, delta_cost: number, delta_tokens: number) {
  // Use raw SQL increment to avoid lost-update under concurrent steps.
  await supabase.rpc("increment_run_cost", { p_run_id: run_id, p_cost: delta_cost, p_tokens: delta_tokens })
    .then(({ error }) => {
      if (error) {
        // Fall back to read-modify-write if the RPC isn't installed yet (additive migration).
        return supabase.from("workflow_runs").select("cost_usd, total_tokens").eq("id", run_id).single().then(({ data }) => {
          if (!data) return
          return supabase.from("workflow_runs").update({
            cost_usd: Number(data.cost_usd) + delta_cost,
            total_tokens: data.total_tokens + delta_tokens,
          }).eq("id", run_id)
        })
      }
    })
}

// ─── The function ──────────────────────────────────────────────────────────

export const runWorkflow = inngest.createFunction(
  {
    id: "run-workflow",
    name: "Run a workflow",
    concurrency: { limit: 25 }, // 25 simultaneous runs is plenty for one founder
    retries: 3,
  },
  { event: EVENT_RUN_QUEUED },
  async ({ event, step, logger }) => {
    const { run_id, workflow_id, input, dry_run = false } = (event as RunQueuedEvent).data
    const meta = extractMeta(input || {})

    const wf = await step.run("load-workflow", async () => {
      const { data, error } = await supabase
        .from("workflows")
        .select("id, name, graph, budget_usd, max_steps, max_loop_iters, status")
        .eq("id", workflow_id)
        .single()
      if (error || !data) throw new Error(`Workflow ${workflow_id} not found`)
      return data
    })

    const limits = {
      budget_usd: Number(wf.budget_usd),
      max_steps: wf.max_steps,
      max_loop_iters: wf.max_loop_iters,
    }
    const graph = wf.graph as WorkflowGraph

    await step.run("mark-running", async () => {
      await supabase.from("workflow_runs").update({
        status: "running",
        started_at: new Date().toISOString(),
        inngest_run_id: event.id ?? null,
      }).eq("id", run_id)
      await checkGlobalDailyBudget()
    })

    const entry = findEntry(graph)
    if (!entry) {
      await step.run("no-entry", async () => {
        await supabase.from("workflow_runs").update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error: "Workflow has no Trigger node",
        }).eq("id", run_id)
      })
      // Still ping Telegram so the user isn't left hanging.
      if (meta.source === "telegram" && meta.telegram_chat_id) {
        await step.run("notify-telegram-on-no-entry", async () => {
          try {
            const { sendTelegram } = await import("@/lib/telegram")
            await sendTelegram(
              `❌ *Run failed*\n\nWorkflow has no Trigger node.\n\n_Run \`${run_id}\`_`,
              {
                chatId: meta.telegram_chat_id,
                parseMode: "Markdown",
                replyToMessageId: meta.telegram_message_id,
              },
            )
          } catch (e) {
            logger.error("Telegram notify (no-entry) failed", { run_id, err: (e as Error).message })
          }
        })
      }
      return { ok: false, error: "no-entry" }
    }

    const ctx: StepContext = { run_id, workflow_id, vars: { ...input }, dry_run }

    try {
      await walkFromNode(entry.id, graph, ctx, limits, step)

      await step.run("mark-succeeded", async () => {
        await supabase.from("workflow_runs").update({
          status: "succeeded",
          finished_at: new Date().toISOString(),
          output: ctx.vars,
        }).eq("id", run_id)
        await supabase.from("workflows").update({
          last_run_at: new Date().toISOString(),
          use_count: (wf as { use_count?: number }).use_count != null
            ? Number((wf as { use_count?: number }).use_count) + 1 : 1,
        }).eq("id", workflow_id)
      })

      // ── Telegram: round-trip the final reply back to the chat that asked.
      if (meta.source === "telegram" && meta.telegram_chat_id) {
        await step.run("notify-telegram-on-complete", async () => {
          try {
            const { sendTelegram } = await import("@/lib/telegram")
            const reply = extractFinalReply(graph, ctx.vars)
            const body = truncateForTelegram(reply || "(no reply produced)")
            await sendTelegram(
              `✅ *Done!*\n\n${body}\n\n_Run \`${run_id}\`_`,
              {
                chatId: meta.telegram_chat_id,
                parseMode: "Markdown",
                replyToMessageId: meta.telegram_message_id,
              },
            )
          } catch (e) {
            // Never let a Telegram blip mark the run as failed — it succeeded.
            logger.error("Telegram notify (complete) failed", { run_id, err: (e as Error).message })
          }
        })
      }

      // Fire-and-forget: have the summarizer write a plain-English summary.
      await step.sendEvent("queue-summary", {
        name: "workflow/run.summarize",
        data: { run_id },
      })

      return { ok: true, run_id, vars: ctx.vars }
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        await step.run("mark-budget-exceeded", async () => {
          await markRunBudgetExceeded(run_id, err)
        })
        if (meta.source === "telegram" && meta.telegram_chat_id) {
          await step.run("notify-telegram-on-budget", async () => {
            try {
              const { sendTelegram } = await import("@/lib/telegram")
              await sendTelegram(
                `⚠️ *Budget cap hit*\n\n${err.message}\n\n_Run \`${run_id}\`_`,
                {
                  chatId: meta.telegram_chat_id,
                  parseMode: "Markdown",
                  replyToMessageId: meta.telegram_message_id,
                },
              )
            } catch (e) {
              logger.error("Telegram notify (budget) failed", { run_id, err: (e as Error).message })
            }
          })
        }
        return { ok: false, run_id, budget: err.layer, error: err.message }
      }
      logger.error("Workflow run failed", { run_id, workflow_id, err: (err as Error).message })
      await step.run("mark-failed", async () => {
        await supabase.from("workflow_runs").update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error: (err as Error).message?.slice(0, 1000),
        }).eq("id", run_id)
      })
      if (meta.source === "telegram" && meta.telegram_chat_id) {
        await step.run("notify-telegram-on-failure", async () => {
          try {
            const { sendTelegram } = await import("@/lib/telegram")
            const errMsg = ((err as Error).message || "Unknown error").slice(0, 800)
            await sendTelegram(
              `❌ *Run failed*\n\n${errMsg}\n\n_Run \`${run_id}\`_`,
              {
                chatId: meta.telegram_chat_id,
                parseMode: "Markdown",
                replyToMessageId: meta.telegram_message_id,
              },
            )
          } catch (e) {
            logger.error("Telegram notify (failure) failed", { run_id, err: (e as Error).message })
          }
        })
      }
      throw err // let Inngest retries kick in
    }

    /* ─── Inner walker (closure over step + supabase) ─────────────────── */

    async function walkFromNode(
      node_id: string,
      g: WorkflowGraph,
      c: StepContext,
      lim: typeof limits,
      s: typeof step,
    ): Promise<void> {
      let cur: string | null = node_id
      while (cur) {
        const node = getNode(g, cur)
        if (!node) throw new Error(`Node ${cur} not found in graph`)

        await s.run(`guard:${node.id}`, async () => {
          const state = await getRunCostState(c.run_id)
          checkWorkflowLimits(state, lim)
        })

        switch (node.type) {
          case "trigger":
          case "output":
            // No work — input/vars already set; just advance.
            await s.run(`mark:${node.id}`, async () => {
              await recordStep(c, node, "succeeded", { output: c.vars })
            })
            cur = nextLinear(g, node.id)
            break

          case "agent": {
            const stepId = await s.run(`record-start:${node.id}`, async () => {
              return await recordStep(c, node, "running", { input: { vars: c.vars } })
            })
            const result = await s.run(`agent:${node.id}`, async () => {
              const prompt = renderTemplate(node.data.prompt, c.vars)
              const r = await callAgentRunner(node.data.agent_slug, prompt, c.vars, c.run_id, c.dry_run)
              c.vars[node.data.output_var] = r.output
              return r
            })
            await s.run(`record-end:${node.id}`, async () => {
              await recordStep(c, node, "succeeded", { output: result.output, cost_usd: result.cost_usd, tokens: result.tokens, log_url: result.log_url }, stepId)
              await bumpRunCost(c.run_id, result.cost_usd, result.tokens)
            })
            cur = nextLinear(g, node.id)
            break
          }

          case "orchestrator": {
            const stepId = await s.run(`record-start:${node.id}`, async () => {
              return await recordStep(c, node, "running", { input: { vars: c.vars, routes: node.data.routes } })
            })
            const result = await s.run(`orchestrate:${node.id}`, async () => {
              // Orchestrator's prompt is auto-generated: "Decide which of these
              // downstream agents should handle this. Routes: [...]. Return
              // {next: <route_id>, reason: <string>}".
              const prompt = `You are routing work in a multi-agent workflow.\n\nCurrent state vars:\n${JSON.stringify(c.vars, null, 2)}\n\nAvailable downstream nodes (pick one): ${node.data.routes.join(", ")}\n\nReturn JSON: {"next": "<one of the routes>", "reason": "<why>"}`
              const r = await callAgentRunner(node.data.agent_slug, prompt, c.vars, c.run_id, c.dry_run)
              const out = r.output as { next?: string; reason?: string }
              const next_node_id = node.data.routes.includes(out.next || "") ? (out.next as string) : node.data.routes[0]
              return { ...r, next_node_id }
            })
            await s.run(`record-end:${node.id}`, async () => {
              await recordStep(c, node, "succeeded", { output: result.output, cost_usd: result.cost_usd, tokens: result.tokens, log_url: result.log_url }, stepId)
              await bumpRunCost(c.run_id, result.cost_usd, result.tokens)
            })
            cur = result.next_node_id ?? null
            break
          }

          case "router": {
            await s.run(`router:${node.id}`, async () => {
              await recordStep(c, node, "succeeded", { input: { condition: node.data.condition } })
            })
            const branch = evalCondition(node.data.condition, c.vars) ? "true" : "false"
            const edge = getBranchEdge(g, node.id, branch)
            cur = edge?.target ?? null
            break
          }

          case "approval": {
            const stepId = await s.run(`record-pending:${node.id}`, async () => {
              const id = await recordStep(c, node, "awaiting_approval", { input: { message: renderTemplate(node.data.message, c.vars) } })
              await supabase.from("workflow_runs").update({ status: "paused" }).eq("id", c.run_id)
              // TODO: dispatch notification (in-app/sms/email) per node.data.channel
              return id
            })
            const evt = await s.waitForEvent(`approval:${node.id}`, {
              event: EVENT_RUN_APPROVAL,
              timeout: `${node.data.timeout_minutes}m`,
              if: `event.data.run_id == "${c.run_id}" && event.data.step_id == "${stepId}"`,
            })
            const decision = evt?.data?.decision === "approve" ? "approve" : "reject"
            await s.run(`record-decision:${node.id}`, async () => {
              await recordStep(c, node, decision === "approve" ? "succeeded" : "skipped", { output: { decision, note: evt?.data?.note } }, stepId)
              await supabase.from("workflow_runs").update({ status: "running" }).eq("id", c.run_id)
            })
            if (decision === "reject") return // halt this branch
            cur = nextLinear(g, node.id)
            break
          }

          case "loop": {
            const stepId = await s.run(`record-loop-start:${node.id}`, async () => {
              return await recordStep(c, node, "running", { input: { mode: node.data.mode, max_iterations: node.data.max_iterations } })
            })
            const children = getLoopChildren(g, node.id)
            const loopEntry = children.find(ch => !g.edges.some(e => e.target === ch.id && children.some(cc => cc.id === e.source)))
            // ^ entry = child with no incoming edge from another child

            const max = Math.min(node.data.max_iterations, lim.max_loop_iters)
            let i = 0
            while (i < max) {
              checkLoopIterations(i, max)
              if (loopEntry) {
                const childCtx: StepContext = { ...c, parent_step_id: stepId, iteration: i }
                // Walk the loop body. We treat the loop body as ending when we
                // hit an edge that exits the loop (target.parentNode !== loopId).
                await walkLoopBody(loopEntry.id, g, childCtx, lim, s, node.id)
              }
              i++
              if (node.data.mode === "until") {
                if (node.data.condition && evalCondition(node.data.condition, c.vars)) break
              } else if (node.data.mode === "while") {
                if (node.data.condition && !evalCondition(node.data.condition, c.vars)) break
              } else if (node.data.mode === "for_each") {
                const collection = node.data.collection_var ? c.vars[node.data.collection_var] : null
                if (!Array.isArray(collection) || i >= collection.length) break
              }
            }
            await s.run(`record-loop-end:${node.id}`, async () => {
              await recordStep(c, node, "succeeded", { output: { iterations: i } }, stepId)
              c.vars["__last_loop_iterations"] = i
            })
            cur = nextLinear(g, node.id)
            break
          }
        }
      }
    }

    /** Walk inside a loop body until we exit the loop's parent boundary. */
    async function walkLoopBody(
      start_node_id: string,
      g: WorkflowGraph,
      c: StepContext,
      lim: typeof limits,
      s: typeof step,
      loop_id: string,
    ): Promise<void> {
      let cur: string | null = start_node_id
      while (cur) {
        const node = getNode(g, cur)
        if (!node) return
        if (node.parentNode !== loop_id) return // exited the loop body

        // Reuse the same per-node logic by recursing into walkFromNode for
        // a single node, then breaking. Simpler: replicate the agent/router
        // dispatch since loop bodies only contain agent/router nodes in v1.
        if (node.type === "agent") {
          const stepId = await s.run(`record-start:${node.id}:${c.iteration}`, async () => {
            return await recordStep(c, node, "running", { input: { vars: c.vars } })
          })
          const result = await s.run(`agent:${node.id}:${c.iteration}`, async () => {
            const prompt = renderTemplate(node.data.prompt, c.vars)
            const r = await callAgentRunner(node.data.agent_slug, prompt, c.vars, c.run_id, c.dry_run)
            c.vars[node.data.output_var] = r.output
            return r
          })
          await s.run(`record-end:${node.id}:${c.iteration}`, async () => {
            await recordStep(c, node, "succeeded", { output: result.output, cost_usd: result.cost_usd, tokens: result.tokens, log_url: result.log_url }, stepId)
            await bumpRunCost(c.run_id, result.cost_usd, result.tokens)
          })
          cur = nextLoopBodyEdge(g, node.id, loop_id, c.vars)
        } else if (node.type === "router") {
          await s.run(`router:${node.id}:${c.iteration}`, async () => {
            await recordStep(c, node, "succeeded", { input: { condition: node.data.condition } })
          })
          const branch = evalCondition(node.data.condition, c.vars) ? "true" : "false"
          const edge = getBranchEdge(g, node.id, branch)
          // If the branch exits the loop, return from the body and let the
          // outer loop check its termination condition next.
          if (!edge) return
          const target = getNode(g, edge.target)
          if (!target || target.parentNode !== loop_id) return
          cur = edge.target
        } else {
          // approval/loop/orchestrator inside loops are out of scope for v1
          return
        }
      }
    }
  },
)

function nextLinear(g: WorkflowGraph, node_id: string): string | null {
  const out = getOutgoing(g, node_id)[0]
  return out?.target ?? null
}

function nextLoopBodyEdge(g: WorkflowGraph, node_id: string, loop_id: string, vars: Record<string, unknown>): string | null {
  // Pick the first outgoing edge whose target is still inside the loop body.
  for (const e of getOutgoing(g, node_id)) {
    const tgt = getNode(g, e.target)
    if (tgt && tgt.parentNode === loop_id) return e.target
  }
  return null
}

// ─── Companion function: generate plain-English summary post-run ────────────

export const summarizeRun = inngest.createFunction(
  { id: "summarize-run", name: "Summarize a finished run", retries: 2 },
  { event: "workflow/run.summarize" },
  async ({ event, step }) => {
    const run_id = (event.data as { run_id: string }).run_id
    const run = await step.run("load", async () => {
      const { data } = await supabase.from("workflow_runs").select("*, workflows!inner(name)").eq("id", run_id).single()
      return data
    })
    if (!run || run.summary) return // already summarized
    const steps = await step.run("load-steps", async () => {
      const { data } = await supabase.from("workflow_steps").select("node_id, node_type, status, iteration, started_at, finished_at, cost_usd").eq("run_id", run_id).order("started_at")
      return data || []
    })
    const summary = await step.run("call-claude", async () => {
      const prompt = `Summarize this workflow run in 2-3 sentences for a non-technical owner. Mention: how many steps ran, did it succeed/fail/get-budget-capped, how long, total cost, and one interesting fact (e.g. "the test loop ran 4 times before passing"). Plain English. No jargon.\n\nWorkflow: ${(run as { workflows?: { name?: string } }).workflows?.name}\nStatus: ${run.status}\nCost: $${Number(run.cost_usd).toFixed(2)}\nDuration: ${run.finished_at && run.started_at ? Math.round((+new Date(run.finished_at) - +new Date(run.started_at)) / 1000) : "?"}s\nSteps:\n${JSON.stringify(steps, null, 2)}`
      const r = await callAgentRunner("__summarizer__", prompt, {}, run_id, false).catch(() => null)
      if (!r) {
        // Fallback: assemble a deterministic one-liner so the field is never blank.
        const succeeded = steps.filter(s => s.status === "succeeded").length
        const failed = steps.filter(s => s.status === "failed").length
        return `${succeeded} step${succeeded === 1 ? "" : "s"} ran successfully${failed > 0 ? `, ${failed} failed` : ""}. Status: ${run.status}. Cost: $${Number(run.cost_usd).toFixed(2)}.`
      }
      return typeof r.output === "string" ? r.output : (r.output as { text?: string }).text || JSON.stringify(r.output).slice(0, 500)
    })
    await step.run("save", async () => {
      await supabase.from("workflow_runs").update({ summary }).eq("id", run_id)
    })
    return { ok: true, summary }
  },
)
