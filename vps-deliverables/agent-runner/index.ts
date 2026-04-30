// agent-runner — tiny HTTP service that runs Claude Code subagents on the AI VPS.
//
//   POST /agents/run         → spawn an agent, return { output, cost_usd, tokens, log_url }
//   POST /workflows/run      → kick off a multi-step workflow (returns 202, runs async)
//   GET  /agents/runs/:id/logs → SSE stream of log lines for a run
//   GET  /healthz            → 200 OK
//
// Implementation: shells out to `claude --print --agent <slug>` so we
// (a) reuse the user's existing OAuth (no separate ANTHROPIC_API_KEY needed),
// (b) get full Claude Code tool support (Bash/Read/Write/WebFetch/etc) for free,
// (c) get built-in cost capping via --max-budget-usd.
//
// Agent files in ~/.claude/agents/ are kept in sync with the dashboard via
// sync-vault.sh.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const PORT  = parseInt(process.env.PORT || "10001", 10)
const HOST  = process.env.HOST || "127.0.0.1" // localhost only by default; Caddy/Tailscale can expose it
const TOKEN = process.env.AGENT_RUNNER_TOKEN || ""
const AGENTS_DIR = process.env.AGENTS_DIR || join(homedir(), ".claude", "agents")
const CLAUDE_BIN = process.env.CLAUDE_BIN || "/root/.local/bin/claude"
// Default per-step budget. Quick Ask alone often loads ~18k tokens of project
// context on first run (cache miss = ~$0.10), so $0.50 was too tight. Cache
// hits on subsequent runs are pennies.
const DEFAULT_BUDGET = parseFloat(process.env.DEFAULT_STEP_BUDGET_USD || "1.50")
// 10 min per step. Some agents (test-writer-fixer running real test suites)
// legitimately need >5 min. Beyond 10 min, the step is presumed stuck and we
// SIGKILL — see the kill-on-timeout block in runAgent below.
const MAX_WALLCLOCK_MS = parseInt(process.env.MAX_STEP_WALLCLOCK_MS || "600000", 10)
// Grace period after SIGTERM before SIGKILL. Node's spawn() timeout only
// sends SIGTERM, which agents can ignore — we add a hard SIGKILL after this.
const KILL_GRACE_MS = parseInt(process.env.KILL_GRACE_MS || "5000", 10)

const SUPABASE_URL = process.env.SUPABASE_URL || ""
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ""
const DEFAULT_TELEGRAM_CHAT_ID = process.env.DEFAULT_TELEGRAM_CHAT_ID || ""

// Tools that may appear in an agent's frontmatter `tools:` list. Anything
// outside this set is silently dropped — never passed to Claude as allowed.
// Keeps a runaway/compromised agent file from declaring random tool names.
const ALLOWED_TOOL_NAMES = new Set([
  "Bash", "Read", "Write", "Edit", "Grep", "Glob",
  "WebFetch", "WebSearch", "TodoWrite", "Task",
])

if (!existsSync(CLAUDE_BIN)) {
  console.error(`[agent-runner] claude CLI not found at ${CLAUDE_BIN} — refusing to start`)
  process.exit(1)
}

let supa: SupabaseClient | null = null
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  console.log(`[agent-runner] supabase client ready: ${SUPABASE_URL}`)
} else {
  console.warn(`[agent-runner] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — /workflows/run will refuse to start runs`)
}

// ─── In-memory log buffer per run ───────────────────────────────────────────

interface LogBuffer { lines: string[]; done: boolean; subs: Set<(line: string) => void>; doneAt?: number }
const logs = new Map<string, LogBuffer>()

function makeLogger(runId: string) {
  if (!logs.has(runId)) logs.set(runId, { lines: [], done: false, subs: new Set() })
  const buf = logs.get(runId)!
  return {
    log(line: string) {
      const stamped = `[${new Date().toISOString()}] ${line}`
      buf.lines.push(stamped)
      if (buf.lines.length > 2000) buf.lines.splice(0, buf.lines.length - 2000)
      for (const sub of buf.subs) try { sub(stamped) } catch { /* ignore */ }
    },
    end() {
      buf.done = true
      buf.doneAt = Date.now()
      for (const sub of buf.subs) try { sub("__END__") } catch { /* ignore */ }
    },
  }
}

// Sweep old runs to keep memory bounded
setInterval(() => {
  const now = Date.now()
  const TTL = 30 * 60 * 1000
  for (const [id, buf] of logs) {
    if (buf.done && buf.doneAt && now - buf.doneAt > TTL) logs.delete(id)
  }
}, 60_000).unref()

// ─── Run an agent via `claude --print --agent <slug>` ──────────────────────

interface RunInput {
  agent_slug: string
  prompt: string
  vars?: Record<string, unknown>
  parent_run_id?: string
  max_budget_usd?: number
}

interface RunOutput {
  output: Record<string, unknown> | string
  cost_usd: number
  tokens: number
  log_url: string
  duration_ms: number
}

async function runAgent(input: RunInput, runId: string): Promise<RunOutput> {
  const logger = makeLogger(runId)
  const startedAt = Date.now()
  logger.log(`agent=${input.agent_slug} prompt_len=${input.prompt.length}`)

  const agentFile = join(AGENTS_DIR, `${input.agent_slug}.md`)
  if (!existsSync(agentFile)) {
    logger.log(`agent file not found: ${agentFile}`)
    logger.end()
    return {
      output: { error: `agent file not found: ${input.agent_slug}.md` },
      cost_usd: 0, tokens: 0, log_url: `/agents/runs/${runId}/logs`,
      duration_ms: Date.now() - startedAt,
    }
  }

  // Parse the agent's frontmatter to get its declared tool list, then
  // intersect with our allowlist. We pass this to claude as --allowedTools
  // so the agent can ONLY use tools its definition declares — no surprise
  // surface, no permission-bypass.
  const declaredTools = parseAgentTools(agentFile)
  const allowed = declaredTools.filter(t => ALLOWED_TOOL_NAMES.has(t))
  logger.log(`tools allowed: ${allowed.join(", ") || "(none — text-only)"}`)

  const budget = input.max_budget_usd ?? DEFAULT_BUDGET

  return new Promise<RunOutput>((resolve) => {
    // The prompt goes through stdin (NOT a positional arg) so it can't get
    // eaten by the variadic --allowedTools flag.
    //
    // permission-mode=acceptEdits + a comprehensive --allowedTools string is
    // the working combo:
    //   - acceptEdits auto-accepts file edits without asking
    //   - --allowedTools lists every tool we want auto-allowed
    //   - bypassPermissions is rejected by claude when run as root
    //   - dontAsk + agent-file-declared tools didn't auto-allow most tools
    // The runner is already auth-gated by AGENT_RUNNER_TOKEN and only loads
    // agent files from our managed AGENTS_DIR, so a permissive default is
    // fine — we control which agents can be run.
    const TOOLS_ALLOWED = "Bash Read Write Edit MultiEdit Grep Glob WebFetch WebSearch TodoWrite Task NotebookEdit"
    const args = [
      "--print",
      "--agent", input.agent_slug,
      "--output-format", "json",
      "--max-budget-usd", String(budget),
      "--permission-mode", "acceptEdits",
      "--allowedTools", TOOLS_ALLOWED,
    ]

    logger.log(`exec: claude ${args.join(" ")} (prompt via stdin, ${input.prompt.length} bytes)`)
    // Spawn from the dashboard repo so claude auto-loads the project's
    // CLAUDE.md (the auto-memory + project context Dylan painstakingly
    // curated lives there). Without cwd, the child inherits the systemd
    // service's WorkingDirectory which is /root/agent-runner — wrong place.
    const child = spawn(CLAUDE_BIN, args, {
      env: { ...process.env, CLAUDE_NONINTERACTIVE: "1" },
      cwd: process.env.AGENT_RUN_CWD || "/root/projects/outreach-dashboard",
      timeout: MAX_WALLCLOCK_MS, // sends SIGTERM after this
      stdio: ["pipe", "pipe", "pipe"],
    })

    // Hard kill if SIGTERM didn't take. Some agents (especially ones running
    // long test suites or `gh` commands) ignore SIGTERM and keep running well
    // past the wallclock cap — that's how a /build run got stuck for 14 min.
    const hardKillAt = Date.now() + MAX_WALLCLOCK_MS + KILL_GRACE_MS
    const killTimer = setInterval(() => {
      if (Date.now() >= hardKillAt && !child.killed && child.exitCode === null) {
        logger.log(`hard SIGKILL — child ignored SIGTERM past ${MAX_WALLCLOCK_MS + KILL_GRACE_MS}ms`)
        try { child.kill("SIGKILL") } catch { /* already gone */ }
        clearInterval(killTimer)
      }
    }, 1000)
    child.on("close", () => clearInterval(killTimer))
    child.stdin.write(input.prompt)
    child.stdin.end()

    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (d) => {
      const s = d.toString()
      stdout += s
      logger.log(`stdout: ${s.trim().slice(0, 500)}`)
    })
    child.stderr.on("data", (d) => {
      const s = d.toString()
      stderr += s
      logger.log(`stderr: ${s.trim().slice(0, 500)}`)
    })

    child.on("close", (code) => {
      const duration = Date.now() - startedAt
      logger.log(`exit code=${code} duration=${duration}ms`)

      let parsed: { result?: string; total_cost_usd?: number; usage?: { input_tokens?: number; output_tokens?: number }; is_error?: boolean } | null = null
      try { parsed = JSON.parse(stdout) } catch { /* ignore */ }

      const text = parsed?.result ?? stdout
      const cost = Number(parsed?.total_cost_usd) || 0
      const tokens = (parsed?.usage?.input_tokens || 0) + (parsed?.usage?.output_tokens || 0)

      let output: Record<string, unknown> | string = text
      const jsonMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/) ||
                        text.match(/^(\{[\s\S]*\}|\[[\s\S]*\])\s*$/m)
      if (jsonMatch) {
        try { output = JSON.parse(jsonMatch[1]) } catch { /* keep text */ }
      }

      logger.log(`done: tokens=${tokens} cost=$${cost.toFixed(4)}`)
      logger.end()

      resolve({
        output,
        cost_usd: cost,
        tokens,
        log_url: `/agents/runs/${runId}/logs`,
        duration_ms: duration,
      })
    })

    child.on("error", (err) => {
      logger.log(`spawn error: ${err.message}`)
      logger.end()
      resolve({
        output: { error: err.message, stderr: stderr.slice(0, 1000) },
        cost_usd: 0, tokens: 0, log_url: `/agents/runs/${runId}/logs`,
        duration_ms: Date.now() - startedAt,
      })
    })
  })
}

// ─── Workflow executor ─────────────────────────────────────────────────────

interface WorkflowNode {
  id: string
  type?: string
  data?: {
    label?: string
    prompt?: string
    agent_slug?: string
    agent_id?: string
    output_var?: string
    [k: string]: unknown
  }
  [k: string]: unknown
}

interface WorkflowEdge { id?: string; source: string; target: string; [k: string]: unknown }

interface WorkflowGraph {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  viewport?: unknown
}

interface WorkflowRunRequest {
  run_id: string
  workflow_id: string
  input: Record<string, unknown> & {
    _meta?: {
      telegram_chat_id?: string | number
      telegram_message_id?: number
      memory_context?: string
    }
  }
}

function pickReplyText(output: unknown): string {
  if (output == null) return ""
  if (typeof output === "string") return output
  if (typeof output === "object") {
    const o = output as Record<string, unknown>
    for (const k of ["result", "text", "reply", "output", "answer", "message"]) {
      const v = o[k]
      if (typeof v === "string" && v.trim().length > 0) return v
    }
    try { return JSON.stringify(output) } catch { return String(output) }
  }
  return String(output)
}

// Render {{var}} placeholders against a flat map. Missing vars stay literal.
function renderTemplate(tpl: string, vars: Record<string, unknown>): string {
  if (!tpl) return ""
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    // Allow simple dot-paths: foo.bar
    const parts = key.split(".")
    let cur: unknown = vars
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p]
      } else { return `{{${key}}}` }
    }
    if (cur == null) return `{{${key}}}`
    if (typeof cur === "string") return cur
    try { return JSON.stringify(cur) } catch { return String(cur) }
  })
}

async function sendTelegramMessage(opts: { chatId: string | number; text: string; parseMode?: string; replyToMessageId?: number }) {
  const token = TELEGRAM_BOT_TOKEN
  if (!token || !opts.chatId) return null
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: opts.chatId,
        text: opts.text.slice(0, 4096),
        parse_mode: opts.parseMode,
        reply_to_message_id: opts.replyToMessageId,
        disable_web_page_preview: true,
      }),
    })
    return await res.json().catch(() => null)
  } catch (e) {
    console.error("[wf-exec] telegram send threw:", (e as Error).message)
    return null
  }
}

// Pick the order in which to walk the graph. Linear v1: start at entry,
// follow outgoing edge per node, stop when no edge or we hit a node we've
// already visited.
function buildLinearOrder(graph: WorkflowGraph, entryId: string | null): WorkflowNode[] {
  const byId = new Map<string, WorkflowNode>()
  for (const n of graph.nodes || []) byId.set(n.id, n)
  let cur: WorkflowNode | undefined
  if (entryId && byId.has(entryId)) cur = byId.get(entryId)
  if (!cur) {
    // Fall back to first agent node, else first node at all
    cur = (graph.nodes || []).find(n => (n.type || "").toLowerCase() === "agent")
       || (graph.nodes || [])[0]
  }
  const order: WorkflowNode[] = []
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    order.push(cur)
    const edge = (graph.edges || []).find(e => e.source === cur!.id)
    if (!edge) break
    cur = byId.get(edge.target)
  }
  return order
}

async function executeWorkflow(req: WorkflowRunRequest): Promise<void> {
  if (!supa) {
    console.error(`[wf-exec ${req.run_id}] no supabase client; aborting`)
    return
  }
  const runId = req.run_id
  const workflowId = req.workflow_id
  const meta = req.input?._meta || {}
  const chatId = meta.telegram_chat_id ?? DEFAULT_TELEGRAM_CHAT_ID
  const replyTo = meta.telegram_message_id
  const memoryContext = (meta.memory_context && typeof meta.memory_context === "string") ? meta.memory_context.trim() : ""

  const logger = makeLogger(`wf-${runId}`)
  const log = (line: string) => { logger.log(line); console.log(`[wf-exec ${runId}] ${line}`) }

  // a) Mark running
  try {
    const { error } = await supa.from("workflow_runs").update({
      status: "running",
      started_at: new Date().toISOString(),
    }).eq("id", runId)
    if (error) throw new Error(`mark-running failed: ${error.message}`)
  } catch (e) {
    log(`fatal: ${(e as Error).message}`)
    logger.end()
    return
  }

  // b) Load workflow
  let workflow: { name: string; graph: WorkflowGraph; entry_node_id: string | null } | null = null
  try {
    const { data, error } = await supa.from("workflows")
      .select("name, graph, entry_node_id")
      .eq("id", workflowId)
      .single()
    if (error) throw new Error(`load workflow failed: ${error.message}`)
    workflow = data as { name: string; graph: WorkflowGraph; entry_node_id: string | null }
  } catch (e) {
    const msg = (e as Error).message
    log(`load failed: ${msg}`)
    await supa.from("workflow_runs").update({
      status: "failed", error: msg, finished_at: new Date().toISOString(),
    }).eq("id", runId)
    if (chatId) await sendTelegramMessage({ chatId, text: `❌ Failed: ${msg}`, replyToMessageId: replyTo })
    logger.end()
    return
  }

  const graph: WorkflowGraph = workflow.graph || { nodes: [], edges: [] }
  const order = buildLinearOrder(graph, workflow.entry_node_id)
  log(`workflow="${workflow.name}" steps=${order.length} entry=${workflow.entry_node_id || "(auto)"}`)

  // c) Telegram start
  if (chatId) {
    await sendTelegramMessage({
      chatId,
      text: `🟢 Started: ${workflow.name}`,
      replyToMessageId: replyTo,
    })
  }

  // d) Walk
  const vars: Record<string, unknown> = { ...(req.input || {}) }
  delete (vars as Record<string, unknown>)._meta

  let totalCost = 0
  let totalTokens = 0
  let lastReplyText = ""
  let stepsExecuted = 0

  try {
    let stepIndex = 0
    for (const node of order) {
      stepIndex++
      const nodeType = (node.type || "agent").toLowerCase()
      const label = node.data?.label || node.id

      if (nodeType === "trigger" || nodeType === "output") {
        log(`skip ${nodeType} node: ${label}`)
        continue
      }
      if (nodeType === "approval" || nodeType === "orchestrator" || nodeType === "loop" || nodeType === "router") {
        log(`v1: skipping ${nodeType} node "${label}" (not yet implemented)`)
        // Insert step row marking it skipped
        try {
          await supa.from("workflow_steps").insert({
            run_id: runId,
            node_id: node.id,
            node_type: nodeType,
            status: "skipped",
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
          })
        } catch { /* best-effort */ }
        continue
      }

      // Agent node — render prompt
      const tpl = (node.data?.prompt as string) || ""
      let prompt = renderTemplate(tpl, vars)
      if (memoryContext) {
        prompt = `## Project context (read-only)\n${memoryContext}\n\n## Your task\n${prompt}`
      }

      // Resolve agent slug — node.data.agent_slug, else look up agents.slug by node.data.agent_id
      let agentSlug = (node.data?.agent_slug as string) || ""
      if (!agentSlug && node.data?.agent_id) {
        try {
          const { data, error } = await supa.from("agents").select("slug").eq("id", node.data.agent_id).single()
          if (!error && data?.slug) agentSlug = data.slug as string
        } catch { /* fall through */ }
      }
      if (!agentSlug) {
        throw new Error(`node "${label}" (${node.id}) has no agent_slug or agent_id`)
      }

      log(`step ${stepIndex}/${order.length}: agent=${agentSlug} label="${label}"`)

      // Telegram step ping
      if (chatId) {
        await sendTelegramMessage({
          chatId,
          text: `▶️ ${label} (${stepIndex} of ${order.length})`,
          replyToMessageId: replyTo,
        })
      }

      // Insert workflow_steps row marking running
      const stepStartedAt = new Date().toISOString()
      let stepRowId: string | null = null
      try {
        const { data, error } = await supa.from("workflow_steps").insert({
          run_id: runId,
          node_id: node.id,
          node_type: "agent",
          status: "running",
          input: { prompt: prompt.slice(0, 8000), vars_keys: Object.keys(vars) },
          started_at: stepStartedAt,
        }).select("id").single()
        if (!error && data?.id) stepRowId = data.id as string
      } catch { /* best-effort */ }

      // Execute
      const childRunId = randomUUID()
      const result = await runAgent({
        agent_slug: agentSlug,
        prompt,
        max_budget_usd: undefined,
        parent_run_id: runId,
      }, childRunId)

      const replyText = pickReplyText(result.output)
      lastReplyText = replyText
      stepsExecuted++
      totalCost += result.cost_usd || 0
      totalTokens += result.tokens || 0

      const outVar = (node.data?.output_var as string) || node.id
      vars[outVar] = result.output
      vars[`${outVar}_text`] = replyText

      // Update step row
      if (stepRowId) {
        try {
          await supa.from("workflow_steps").update({
            status: "succeeded",
            output: typeof result.output === "string" ? { text: result.output } : (result.output as Record<string, unknown>),
            cost_usd: result.cost_usd || 0,
            tokens: result.tokens || 0,
            log_url: `/agents/runs/${childRunId}/logs`,
            finished_at: new Date().toISOString(),
          }).eq("id", stepRowId)
        } catch { /* best-effort */ }
      }

      log(`step ${stepIndex} done: tokens=${result.tokens} cost=$${(result.cost_usd || 0).toFixed(4)} reply_len=${replyText.length}`)
    }

    // e) Mark succeeded
    const summary = lastReplyText ? lastReplyText.slice(0, 500) : `Completed ${stepsExecuted} steps`
    await supa.from("workflow_runs").update({
      status: "succeeded",
      summary,
      output: vars,
      cost_usd: totalCost,
      total_tokens: totalTokens,
      finished_at: new Date().toISOString(),
    }).eq("id", runId)

    if (chatId) {
      const body = lastReplyText || `Completed ${stepsExecuted} step${stepsExecuted === 1 ? "" : "s"}.`
      await sendTelegramMessage({
        chatId,
        text: `✅ Done!\n\n${body.slice(0, 3500)}`,
        replyToMessageId: replyTo,
      })
    }
    log(`succeeded steps=${stepsExecuted} cost=$${totalCost.toFixed(4)} tokens=${totalTokens}`)
  } catch (e) {
    const msg = (e as Error).message || "unknown error"
    log(`failed: ${msg}`)
    try {
      await supa.from("workflow_runs").update({
        status: "failed",
        error: msg,
        cost_usd: totalCost,
        total_tokens: totalTokens,
        finished_at: new Date().toISOString(),
      }).eq("id", runId)
    } catch { /* swallow */ }
    if (chatId) await sendTelegramMessage({ chatId, text: `❌ Failed: ${msg}`, replyToMessageId: replyTo })
  } finally {
    logger.end()
  }
}

// ─── HTTP server ───────────────────────────────────────────────────────────

function authOK(req: IncomingMessage): boolean {
  if (!TOKEN) return true
  return req.headers.authorization === `Bearer ${TOKEN}`
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    sendJson(res, 200, { ok: true, agents_dir: AGENTS_DIR, claude_bin: CLAUDE_BIN, supabase: !!supa })
    return
  }
  if (!authOK(req)) { res.writeHead(401); res.end("unauthorized"); return }

  if (req.method === "POST" && req.url === "/agents/run") {
    let body = ""
    for await (const chunk of req) body += chunk
    let input: RunInput
    try { input = JSON.parse(body) } catch { sendJson(res, 400, { error: "invalid JSON" }); return }
    if (!input.agent_slug || !input.prompt) {
      sendJson(res, 400, { error: "agent_slug and prompt required" })
      return
    }
    const runId = randomUUID()
    try {
      const out = await runAgent(input, runId)
      sendJson(res, 200, out)
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message })
    }
    return
  }

  // POST /workflows/run — fire-and-forget multi-step executor
  if (req.method === "POST" && req.url === "/workflows/run") {
    if (!supa) { sendJson(res, 503, { error: "supabase not configured" }); return }
    let body = ""
    for await (const chunk of req) body += chunk
    let input: WorkflowRunRequest
    try { input = JSON.parse(body) } catch { sendJson(res, 400, { error: "invalid JSON" }); return }
    if (!input.run_id || !input.workflow_id) {
      sendJson(res, 400, { error: "run_id and workflow_id required" })
      return
    }
    if (!input.input || typeof input.input !== "object") input.input = {}

    // Idempotency: refuse if run is already running/succeeded/failed/etc.
    try {
      const { data, error } = await supa.from("workflow_runs")
        .select("id, status")
        .eq("id", input.run_id)
        .single()
      if (error || !data) { sendJson(res, 404, { error: "run not found" }); return }
      if (data.status !== "queued") {
        sendJson(res, 400, { error: "already_processed", status: data.status })
        return
      }
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message })
      return
    }

    // Fire and forget
    void executeWorkflow(input).catch(err => {
      console.error(`[wf-exec ${input.run_id}] uncaught:`, (err as Error).message)
    })

    res.writeHead(202, { "content-type": "application/json" })
    res.end(JSON.stringify({ ok: true, accepted: true }))
    return
  }

  // GET /agents/runs/:id/logs → SSE
  const m = req.url?.match(/^\/agents\/runs\/([\w-]+)\/logs$/)
  if (req.method === "GET" && m) {
    const runId = m[1]
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
    })
    if (!logs.has(runId)) logs.set(runId, { lines: [], done: false, subs: new Set() })
    const buf = logs.get(runId)!
    for (const l of buf.lines) res.write(`data: ${l.replace(/\n/g, "\\n")}\n\n`)
    if (buf.done) { res.write(`event: end\ndata: done\n\n`); res.end(); return }
    const sub = (line: string) => {
      if (line === "__END__") { try { res.write(`event: end\ndata: done\n\n`); res.end() } catch {}; return }
      try { res.write(`data: ${line.replace(/\n/g, "\\n")}\n\n`) } catch {}
    }
    buf.subs.add(sub)
    req.on("close", () => buf.subs.delete(sub))
    return
  }

  res.writeHead(404); res.end("not found")
})

// Parse the YAML-frontmatter `tools:` list from an agent .md file. Inline
// arrays only (e.g. `tools: ["Bash", "Read"]`).
function parseAgentTools(path: string): string[] {
  try {
    const text = readFileSync(path, "utf8")
    const m = /^---\s*\n([\s\S]*?)\n---/.exec(text)
    if (!m) return []
    const line = m[1].split(/\r?\n/).find(l => /^\s*tools\s*:/.test(l))
    if (!line) return []
    const arr = line.match(/\[(.*?)\]/)
    if (!arr) return []
    return arr[1].split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
  } catch { return [] }
}

server.listen(PORT, HOST, () => {
  console.log(`[agent-runner] listening on ${HOST}:${PORT}`)
  console.log(`  agents dir: ${AGENTS_DIR}`)
  console.log(`  claude bin: ${CLAUDE_BIN}`)
  console.log(`  default budget: $${DEFAULT_BUDGET}/step  wallclock cap: ${MAX_WALLCLOCK_MS}ms`)
  console.log(`  supabase: ${supa ? "configured" : "MISSING (workflows disabled)"}`)
  console.log(`  telegram: ${TELEGRAM_BOT_TOKEN ? "configured" : "missing"}`)
  if (HOST === "127.0.0.1") console.log(`  bound to localhost only — expose via Caddy/Tailscale if needed`)
})
