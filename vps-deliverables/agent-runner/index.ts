// agent-runner — tiny HTTP service that runs Claude agents on the AI VPS.
//
// Called per step by the Inngest workflow function in the dashboard.
//   POST /agents/run         → spawn an agent, return { output, cost_usd, tokens, log_url }
//   GET  /agents/runs/:id/logs → SSE stream of log lines for a run
//   GET  /healthz            → 200 OK
//
// Reads agent definitions from ~/.claude/agents/{slug}.md (the same files
// Claude Code uses as subagents in terminal sessions). YAML-frontmatter
// markdown — frontmatter is the recipe, body is the system prompt.
//
// Tool support (v1): Bash + Read + Write only. Enough for the canonical
// test→fix→retest loop. Extend in tools.ts as needed.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import Anthropic from "@anthropic-ai/sdk"

const PORT  = parseInt(process.env.PORT || "10001", 10)
const TOKEN = process.env.AGENT_RUNNER_TOKEN || ""
const AGENTS_DIR = process.env.AGENTS_DIR || join(homedir(), ".claude", "agents")
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ""
const MAX_WALLCLOCK_MS = 5 * 60 * 1000 // 5 min hard cap per step

if (!ANTHROPIC_KEY) {
  console.error("[agent-runner] ANTHROPIC_API_KEY not set — refusing to start")
  process.exit(1)
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

// ─── In-memory log buffer per run ───────────────────────────────────────────
// Production would push to durable storage; in-memory is fine for short SSE
// streams (logs are also persisted in workflow_steps.log_url eventually).

interface LogBuffer {
  lines: string[]
  done: boolean
  subs: Set<(line: string) => void>
}
const logs = new Map<string, LogBuffer>()

function makeLogger(runId: string) {
  if (!logs.has(runId)) logs.set(runId, { lines: [], done: false, subs: new Set() })
  const buf = logs.get(runId)!
  return {
    log(line: string) {
      const stamped = `[${new Date().toISOString()}] ${line}`
      buf.lines.push(stamped)
      for (const sub of buf.subs) try { sub(stamped) } catch { /* ignore */ }
    },
    end() {
      buf.done = true
      for (const sub of buf.subs) try { sub("__END__") } catch { /* ignore */ }
    },
    buf,
  }
}

// ─── Frontmatter parser (same shape as the dashboard's parser) ─────────────

interface AgentFile {
  slug: string
  system_prompt: string
  model: string
  tools: string[]
  max_tokens: number
  description?: string
}

async function loadAgent(slug: string): Promise<AgentFile> {
  const path = join(AGENTS_DIR, `${slug}.md`)
  if (!existsSync(path)) throw new Error(`agent file not found: ${path}`)
  const text = await readFile(path, "utf8")
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text)
  const fm: Record<string, unknown> = {}
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([\w_]+)\s*:\s*(.*)$/.exec(line.trim())
      if (!kv) continue
      const v = kv[2].trim()
      if (/^\[.*\]$/.test(v)) {
        fm[kv[1]] = v.slice(1, -1).split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
      } else if (v === "true" || v === "false") fm[kv[1]] = v === "true"
      else if (/^\d+$/.test(v)) fm[kv[1]] = parseInt(v, 10)
      else fm[kv[1]] = v.replace(/^["']|["']$/g, "")
    }
  }
  return {
    slug,
    system_prompt: (m?.[2] || text).trim(),
    model: (fm.model as string) || "sonnet",
    tools: Array.isArray(fm.tools) ? fm.tools as string[] : [],
    max_tokens: (fm.max_tokens as number) || 8000,
    description: fm.description as string,
  }
}

const MODEL_MAP: Record<string, string> = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
}

// ─── Tool implementations ──────────────────────────────────────────────────

const TOOL_SCHEMAS: Record<string, Anthropic.Messages.Tool> = {
  Bash: {
    name: "Bash",
    description: "Run a shell command. Returns stdout+stderr. 30s timeout.",
    input_schema: {
      type: "object",
      properties: { command: { type: "string", description: "The shell command to run" } },
      required: ["command"],
    },
  },
  Read: {
    name: "Read",
    description: "Read a file from disk.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Absolute path" } },
      required: ["path"],
    },
  },
  Write: {
    name: "Write",
    description: "Write text to a file (overwrites if exists).",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
}

async function execTool(name: string, input: Record<string, unknown>, log: (l: string) => void): Promise<string> {
  log(`tool: ${name} ${JSON.stringify(input).slice(0, 200)}`)
  if (name === "Bash") {
    const cmd = String(input.command || "")
    return await new Promise<string>(resolve => {
      const child = spawn("bash", ["-c", cmd], { timeout: 30_000 })
      let out = ""
      child.stdout.on("data", d => out += d.toString())
      child.stderr.on("data", d => out += d.toString())
      child.on("close", code => resolve(`exit ${code ?? "?"}\n${out.slice(0, 12000)}`))
      child.on("error", err => resolve(`error: ${err.message}`))
    })
  }
  if (name === "Read") {
    try { return (await readFile(String(input.path), "utf8")).slice(0, 50000) }
    catch (e) { return `read error: ${(e as Error).message}` }
  }
  if (name === "Write") {
    try { await writeFile(String(input.path), String(input.content || "")); return "ok" }
    catch (e) { return `write error: ${(e as Error).message}` }
  }
  return `unknown tool: ${name}`
}

// ─── Run an agent ──────────────────────────────────────────────────────────

interface RunInput {
  agent_slug: string
  prompt: string
  vars?: Record<string, unknown>
  parent_run_id?: string
}

interface RunOutput {
  output: Record<string, unknown> | string
  cost_usd: number
  tokens: number
  log_url: string
}

async function runAgent(input: RunInput, runId: string): Promise<RunOutput> {
  const logger = makeLogger(runId)
  logger.log(`agent=${input.agent_slug} prompt_len=${input.prompt.length}`)

  let agent: AgentFile
  try { agent = await loadAgent(input.agent_slug) }
  catch (e) {
    logger.log(`load error: ${(e as Error).message}`)
    logger.end()
    return { output: { error: (e as Error).message }, cost_usd: 0, tokens: 0, log_url: `/agents/runs/${runId}/logs` }
  }

  const tools = agent.tools.map(t => TOOL_SCHEMAS[t]).filter(Boolean)
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: input.prompt }]
  let totalIn = 0, totalOut = 0
  const startedAt = Date.now()
  let lastText = ""

  while (true) {
    if (Date.now() - startedAt > MAX_WALLCLOCK_MS) {
      logger.log(`wall-clock cap (${MAX_WALLCLOCK_MS / 1000}s) hit — aborting`)
      break
    }
    const resp = await anthropic.messages.create({
      model: MODEL_MAP[agent.model] || MODEL_MAP.sonnet,
      max_tokens: agent.max_tokens,
      system: agent.system_prompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    })
    totalIn += resp.usage.input_tokens
    totalOut += resp.usage.output_tokens
    logger.log(`turn: in=${resp.usage.input_tokens} out=${resp.usage.output_tokens} stop=${resp.stop_reason}`)

    // collect text + handle tool_use
    const textBlocks = resp.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    if (textBlocks.length) lastText = textBlocks.map(b => b.text).join("\n")

    if (resp.stop_reason !== "tool_use") break

    const toolUses = resp.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use")
    messages.push({ role: "assistant", content: resp.content })
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const result = await execTool(tu.name, tu.input as Record<string, unknown>, logger.log)
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result })
    }
    messages.push({ role: "user", content: toolResults })
  }

  // Cost: use rough public pricing per 1M tokens
  const PRICING: Record<string, { in: number; out: number }> = {
    opus:   { in: 15.0, out: 75.0 },
    sonnet: { in: 3.0,  out: 15.0 },
    haiku:  { in: 0.8,  out: 4.0 },
  }
  const p = PRICING[agent.model] || PRICING.sonnet
  const cost = (totalIn / 1_000_000) * p.in + (totalOut / 1_000_000) * p.out

  // Try to parse JSON from the agent's last response, fall back to raw text
  let output: Record<string, unknown> | string = lastText
  const jsonMatch = lastText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/) || lastText.match(/^(\{[\s\S]*\}|\[[\s\S]*\])\s*$/)
  if (jsonMatch) {
    try { output = JSON.parse(jsonMatch[1]) } catch { /* keep text */ }
  }
  logger.log(`done: tokens=${totalIn + totalOut} cost=$${cost.toFixed(4)}`)
  logger.end()
  return { output, cost_usd: cost, tokens: totalIn + totalOut, log_url: `/agents/runs/${runId}/logs` }
}

// ─── HTTP server ───────────────────────────────────────────────────────────

function authOK(req: IncomingMessage): boolean {
  if (!TOKEN) return true // no token set = open (dev mode)
  return req.headers.authorization === `Bearer ${TOKEN}`
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify({ ok: true, agents_dir: AGENTS_DIR }))
    return
  }
  if (!authOK(req)) {
    res.writeHead(401); res.end("unauthorized"); return
  }

  if (req.method === "POST" && req.url === "/agents/run") {
    const body = await readBody(req)
    const input = JSON.parse(body || "{}") as RunInput
    if (!input.agent_slug || !input.prompt) {
      res.writeHead(400); res.end("agent_slug and prompt required"); return
    }
    const runId = randomUUID()
    try {
      const out = await runAgent(input, runId)
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify(out))
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: (e as Error).message }))
    }
    return
  }

  // GET /agents/runs/:id/logs  (SSE)
  const logsMatch = req.url?.match(/^\/agents\/runs\/([\w-]+)\/logs$/)
  if (req.method === "GET" && logsMatch) {
    const runId = logsMatch[1]
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
    })
    const buf = logs.get(runId) || (() => { logs.set(runId, { lines: [], done: false, subs: new Set() }); return logs.get(runId)! })()
    // Send buffered lines first
    for (const l of buf.lines) res.write(`data: ${l.replace(/\n/g, "\\n")}\n\n`)
    if (buf.done) { res.write(`event: end\ndata: done\n\n`); res.end(); return }
    const sub = (line: string) => {
      if (line === "__END__") {
        try { res.write(`event: end\ndata: done\n\n`); res.end() } catch {}
        return
      }
      try { res.write(`data: ${line.replace(/\n/g, "\\n")}\n\n`) } catch {}
    }
    buf.subs.add(sub)
    req.on("close", () => buf.subs.delete(sub))
    return
  }

  res.writeHead(404); res.end("not found")
})

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ""
    req.on("data", chunk => data += chunk)
    req.on("end", () => resolve(data))
    req.on("error", reject)
  })
}

server.listen(PORT, () => {
  console.log(`[agent-runner] listening on :${PORT} (agents dir: ${AGENTS_DIR})`)
})
