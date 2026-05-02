// Telegram webhook — entrypoint for the Jarvis remote-Claude flow.
//
// Phase 1 scope:
//   • Validate the X-Telegram-Bot-Api-Secret-Token header (constant-time).
//   • Authorize the chat id against TELEGRAM_CHAT_ID / TELEGRAM_ALLOWED_CHAT_IDS.
//   • For text messages: queue a run of the `quick-ask` workflow with the text
//     as the `message` input, plus telegram metadata. Reply quickly so Telegram
//     doesn't infinite-retry.
//   • For callback_query (button taps): just answer the callback so the spinner
//     in Dylan's app stops; real button-routing comes in Phase 2.
//
// Phase 2 addition (this file):
//   • Parse callback_query.data as `<action>:<run_id>` and dispatch to the
//     right runs endpoint logic INTERNALLY (no HTTP self-call — we share a
//     Supabase client + Inngest client with /api/runs/[id]/{approve,control}
//     so we can fire the same events those routes do without a network hop).
//   • Action set: approve | cancel | abort | pause | resume.
//   • Approve/cancel need a `step_id` (the runWorkflow approval gate filters
//     by both run_id AND step_id), so we look up the most recent
//     `awaiting_approval` row in `workflow_steps` for that run.
//   • A `cancel` is treated as reject + abort (rejects the gate so the
//     paused branch halts, and aborts the run so any other branches stop).
//   • Result feedback is sent back as a threaded reply on the original
//     button message so the chat reads naturally on phone.
//
// Reliability rules (Telegram quirks):
//   • Always return 200 on caught errors so Telegram doesn't retry forever.
//     Failed-secret / failed-auth get 401 / 403 (those won't retry).
//   • Reply must come back fast — we don't run the workflow inline, we just
//     queue it via Inngest and tell Dylan it's running.
//   • Silent rejection of unauthorized chats so we don't leak the bot's
//     existence to a stranger who guessed the username.
//
// Bot token NOTE: answerCallbackQuery is a tiny call we make directly here
// rather than expanding @/lib/telegram for a Phase-1-only feature. If Phase 2
// needs more callback-query plumbing we'll move it into the lib.
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  sendTelegram,
  validateWebhookSecret,
  isAuthorizedChatId,
  type TelegramUpdate,
} from "@/lib/telegram"
import {
  triggerWorkflowBySlug,
  WorkflowNotFoundError,
} from "@/lib/workflows/run-helper"
import { runWorkflowSync } from "@/lib/workflows/run-sync"
import { BudgetExceededError } from "@/lib/workflow/cost-guards"
import { getSecret } from "@/lib/secrets"
import {
  inngest,
  EVENT_RUN_APPROVAL,
  EVENT_RUN_PAUSED,
  EVENT_RUN_RESUMED,
  EVENT_RUN_ABORTED,
} from "@/lib/inngest/client"
import { saveToVault } from "@/lib/vault/save"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
// Allow up to 2 minutes per request — the synchronous workflow executor calls
// the agent-runner which can take 30-60s for a single Claude reply. Without
// this, the function defaults to 10s (Hobby) / 60s (Pro) and gets killed
// mid-flight, leaving runs stuck in `running` and Dylan with no reply.
export const maxDuration = 120

const QUICK_ASK_SLUG = "quick-ask"
const SECRET_HEADER = "x-telegram-bot-api-secret-token"

// Workflows that are SAFE to run inside Vercel's request budget (single agent
// node, finishes in <60s). Anything else fire-and-forgets to the VPS workflow
// executor at /workflows/run on the agent-runner.
const SYNC_SAFE_SLUGS = new Set(["quick-ask", "Quick Ask"])

// ──────────────────────────────────────────────────────────────────────────
// Slash-command parser
// ──────────────────────────────────────────────────────────────────────────

type ParsedCommand =
  | { kind: "static"; text: string }
  | {
      kind: "workflow"
      slug: string // matches `name` in the workflows table (fuzzy-matched downstream)
      message: string
      label: string // for the ack message ("Quick Ask", "Build Feature", …)
      emoji: string
    }
  | { kind: "terminal_list" }
  | { kind: "terminal_spawn"; task: string }
  | { kind: "terminal_kill"; id: string }
  | { kind: "clear_conversation"; tone: "clear" | "exit" }

function parseCommand(rawText: string): ParsedCommand {
  const text = rawText.trim()

  // /start — friendly welcome
  if (/^\/start(?:\s|$|@)/i.test(text)) {
    return {
      kind: "static",
      text: [
        "🤖 *Hey, I'm Jarvis.*",
        "",
        "I run on your VPS using your Claude Code subscription. Talk to me anytime — phone off your computer, I keep working.",
        "",
        "*Slash commands:*",
        "/build — build a feature end-to-end (plan → build → test → PR)",
        "/fix — investigate + propose a fix for a bug",
        "/test — run a page's Testing Plan and report",
        "/health — fire the daily health check now",
        "/runs — link to recent runs in the dashboard",
        "/terminals — list active VPS terminals",
        "/spawn <task> — spawn a new persistent terminal",
        "/kill <id> — stop a terminal",
        "/help — full command list",
        "",
        "*Or just talk to me:*",
        "• \"what's the latest commit on main?\"",
        "• \"summarize my open PRs\"",
        "• \"what does the deadman cron do?\"",
        "",
        "_Quick replies: 10-30s. Long workflows ping you on stage transitions._ ✅",
      ].join("\n"),
    }
  }

  // /help — full command list
  if (/^\/help(?:\s|$|@)/i.test(text)) {
    return {
      kind: "static",
      text: [
        "*Jarvis commands*",
        "",
        "💬 *Quick Ask* (default — just text me, no prefix)",
        "Single-shot Claude reply. Reads code, runs git, looks things up.",
        "",
        "🏗️ */build <description>*",
        "Plan → structure → build → test → open PR. Multi-step.",
        "_Example:_ `/build inbox watcher for IG replies`",
        "",
        "🔍 */fix <bug description>*",
        "Read repo → reproduce → root cause → propose fix → PR.",
        "_Example:_ `/fix lead pipeline isn't moving on reply`",
        "",
        "🧪 */test <page path>*",
        "Run the page's Testing Plan and report regressions.",
        "_Example:_ `/test /agency/leads`",
        "",
        "🏥 */health*",
        "Manually fire the Daily Health Check.",
        "",
        "📋 */runs*",
        "Link to your recent runs in the dashboard.",
        "",
        "🖥️ */terminals*",
        "List active VPS terminals (persistent claude sessions).",
        "",
        "🚀 */spawn <task>*",
        "Spawn a new persistent terminal working on the task.",
        "_Example:_ `/spawn add a regex tester component to /agency/tools`",
        "",
        "🛑 */kill <id>*",
        "Stop a terminal. ID = first 8 chars from `/terminals`.",
        "",
        "🧹 */clear*",
        "Save recent chat to the Memory Vault and wipe the buffer.",
        "",
        "👋 */exit*",
        "Same as /clear with a goodbye.",
        "",
        "*Web workspace:* outreach-github.vercel.app/agency/terminals",
      ].join("\n"),
    }
  }

  // /runs — link to dashboard
  if (/^\/runs(?:\s|$|@)/i.test(text)) {
    return {
      kind: "static",
      text:
        "📋 *Recent runs:* https://outreach-github.vercel.app/agency/memory#agent-workflows" +
        "\n\nClick any run to see the live trace + cost + agent reply.",
    }
  }

  // Workflow commands
  const buildMatch = text.match(/^\/build(?:@\w+)?(?:\s+([\s\S]+))?$/i)
  if (buildMatch) {
    const arg = (buildMatch[1] || "").trim()
    if (!arg) {
      return {
        kind: "static",
        text:
          "Usage: `/build <description of the feature>`\n\n_Example:_ `/build a /agency/inbox-watcher page that polls IG every 15 min`",
      }
    }
    return {
      kind: "workflow",
      slug: "Build Feature End-to-End",
      message: arg,
      label: "Build Feature",
      emoji: "🏗️",
    }
  }

  const fixMatch = text.match(/^\/(?:fix|investigate)(?:@\w+)?(?:\s+([\s\S]+))?$/i)
  if (fixMatch) {
    const arg = (fixMatch[1] || "").trim()
    if (!arg) {
      return {
        kind: "static",
        text: "Usage: `/fix <bug description>`\n\n_Example:_ `/fix lead pipeline isn't moving when reply comes in`",
      }
    }
    return {
      kind: "workflow",
      slug: "Investigate Bug",
      message: arg,
      label: "Investigate Bug",
      emoji: "🔍",
    }
  }

  const testMatch = text.match(/^\/test(?:@\w+)?(?:\s+([\s\S]+))?$/i)
  if (testMatch) {
    const arg = (testMatch[1] || "").trim()
    if (!arg) {
      return {
        kind: "static",
        text: "Usage: `/test <page path>`\n\n_Example:_ `/test /agency/leads`",
      }
    }
    return {
      kind: "workflow",
      slug: "Test This Page",
      message: arg,
      label: "Test Page",
      emoji: "🧪",
    }
  }

  if (/^\/health(?:\s|$|@)/i.test(text)) {
    return {
      kind: "workflow",
      slug: "Daily Health Check",
      message: "Run the daily health check now and report.",
      label: "Health Check",
      emoji: "🏥",
    }
  }

  // /terminals — list active terminals
  if (/^\/terminals(?:\s|$|@)/i.test(text)) {
    return { kind: "terminal_list" }
  }

  // /spawn <task description> — spawn a new terminal with the task
  const spawnMatch = text.match(/^\/spawn(?:@\w+)?(?:\s+([\s\S]+))?$/i)
  if (spawnMatch) {
    const arg = (spawnMatch[1] || "").trim()
    if (!arg) {
      return {
        kind: "static",
        text:
          "Usage: `/spawn <task>`\n\n_Example:_ `/spawn write a regex tester component`\n\nSpawns a new persistent terminal on the VPS, claude starts working on the task. Sibling-aware so it won't fight other terminals.",
      }
    }
    return { kind: "terminal_spawn", task: arg }
  }

  // /kill <id> — stop a terminal by 8-char id prefix or full uuid
  const killMatch = text.match(/^\/kill(?:@\w+)?(?:\s+([\s\S]+))?$/i)
  if (killMatch) {
    const arg = (killMatch[1] || "").trim()
    if (!arg) {
      return {
        kind: "static",
        text: "Usage: `/kill <id>`\n\nID is the first 8 chars shown in `/terminals` — e.g. `/kill a1b2c3d4`.",
      }
    }
    return { kind: "terminal_kill", id: arg }
  }

  // /clear — wipe conversation history (save to vault first)
  if (/^\/clear(?:\s|$|@)/i.test(text)) {
    return { kind: "clear_conversation", tone: "clear" }
  }

  // /exit — same as /clear but with a goodbye tone
  if (/^\/exit(?:\s|$|@)/i.test(text)) {
    return { kind: "clear_conversation", tone: "exit" }
  }

  // Unknown slash command
  if (text.startsWith("/")) {
    const tried = text.split(/\s/)[0]
    return {
      kind: "static",
      text: `Unknown command \`${tried}\`. Send /help for the list.`,
    }
  }

  // Default: free-text Quick Ask
  return {
    kind: "workflow",
    slug: QUICK_ASK_SLUG,
    message: text,
    label: "Quick Ask",
    emoji: "💬",
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Terminal-server proxy (used by /terminals, /spawn, /kill commands)
// ──────────────────────────────────────────────────────────────────────────

interface TerminalSession {
  id: string
  title: string
  branch?: string
  status?: string
  created_at: string
  last_activity_at?: string
  cost_usd?: number
  cost_cap_usd?: number
  paused_reason?: string | null
}

async function callTerminalServer<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const url = ((await getSecret("TERMINAL_RUNNER_URL")) || "").replace(/\/+$/, "")
  const token = (await getSecret("TERMINAL_RUNNER_TOKEN")) || ""
  if (!url) return { ok: false, error: "TERMINAL_RUNNER_URL not configured" }
  if (!token) return { ok: false, error: "TERMINAL_RUNNER_TOKEN not configured" }
  try {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (data as { error?: string }).error || `HTTP ${res.status}` }
    }
    return { ok: true, data: data as T }
  } catch (e) {
    return { ok: false, error: `terminal-server unreachable: ${(e as Error).message}` }
  }
}

function formatTerminalsList(sessions: TerminalSession[], cap?: { active: number; soft_max: number }): string {
  if (sessions.length === 0) {
    return "🖥️ *No terminals running.*\n\nStart one with `/spawn <task>` or open the dashboard at outreach-github.vercel.app/agency/terminals."
  }
  const cap_line = cap ? `${cap.active} of ${cap.soft_max} (VPS-aware cap)\n\n` : ""
  const lines = sessions.map((s) => {
    const id8 = s.id.slice(0, 8)
    const status = s.status === "paused" ? "⏸" : s.status === "crashed" ? "💥" : "🟢"
    const cost = s.cost_usd ? ` · $${Number(s.cost_usd).toFixed(2)}` : ""
    return `${status} \`${id8}\` *${s.title}*${cost}\n  └ ${s.branch || ""}`
  })
  return `🖥️ *${sessions.length} terminal${sessions.length === 1 ? "" : "s"}*${cap ? ` — ${cap_line}` : "\n\n"}${lines.join("\n")}\n\n_Stop one with_ \`/kill <id>\``
}

// ──────────────────────────────────────────────────────────────────────────
// /clear and /exit — save recent telegram exchanges to the Memory Vault then
// "wipe" Dylan's conversation buffer. We don't actually keep a session-state
// row right now; what we DO have is the history of workflow_runs triggered
// from his chat_id, which is the de-facto conversation log. We snapshot the
// most recent N runs into Conversations/telegram-<chat>-<ts>.md so the next
// session can be fresh without losing context.
// ──────────────────────────────────────────────────────────────────────────

interface ConversationRun {
  id: string
  created_at: string
  status: string
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  summary: string | null
}

const CONVERSATION_HISTORY_LIMIT = 20

function pickMessage(input: Record<string, unknown> | null): string {
  if (!input) return ""
  const m = input.message
  if (typeof m === "string") return m
  return ""
}

function pickReply(run: ConversationRun): string {
  if (run.summary) return run.summary
  const out = run.output
  if (!out) return `(run ${run.status})`
  if (typeof out === "string") return out
  for (const k of ["reply", "answer", "text", "draft", "content", "result"]) {
    const v = (out as Record<string, unknown>)[k]
    if (typeof v === "string" && v.trim()) return v
  }
  // Strip _meta and stringify what's left as a fallback.
  try {
    const { _meta: _omit, ...rest } = out as { _meta?: unknown } & Record<string, unknown>
    void _omit
    const s = JSON.stringify(rest)
    return s === "{}" ? `(run ${run.status})` : s.slice(0, 500)
  } catch {
    return `(run ${run.status})`
  }
}

function fmtDateForFilename(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
}

async function snapshotConversationToVault(
  chatId: number | string,
): Promise<{ saved: boolean; count: number; path?: string; error?: string }> {
  // Pull recent runs that originated from this chat. The chat_id sits inside
  // input._meta.telegram_chat_id (mixed string/number depending on caller —
  // we coerce to string for the OR query).
  const cid = String(chatId)
  // PostgREST json filter — works for both string and numeric chat ids that
  // got serialized into input._meta.
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("id, created_at, status, input, output, summary")
    .or(`input->_meta->>telegram_chat_id.eq.${cid},input->_meta->telegram_chat_id.eq.${cid}`)
    .order("created_at", { ascending: false })
    .limit(CONVERSATION_HISTORY_LIMIT)

  if (error) {
    return { saved: false, count: 0, error: `db query failed: ${error.message}` }
  }
  const runs = (data || []) as ConversationRun[]
  if (runs.length === 0) {
    return { saved: false, count: 0 }
  }

  const now = new Date()
  const pathSlug = `telegram-${cid}-${fmtDateForFilename(now)}.md`
  const path = `Conversations/${pathSlug}`

  const lines: string[] = []
  lines.push(`# Telegram conversation — chat ${cid} — ${now.toISOString()}`)
  lines.push("")
  lines.push(`Snapshot of the most recent ${runs.length} run${runs.length === 1 ? "" : "s"} from this chat, taken when the user ran /clear or /exit.`)
  lines.push("")
  // Oldest first reads naturally as a transcript.
  for (const run of runs.slice().reverse()) {
    const ts = run.created_at
    const msg = pickMessage(run.input).trim() || "(no message)"
    const reply = pickReply(run).trim() || "(no reply)"
    lines.push(`### ${ts} · run \`${run.id.slice(0, 8)}\` · ${run.status}`)
    lines.push("")
    lines.push(`**You:** ${msg}`)
    lines.push("")
    lines.push(`**Jarvis:** ${reply}`)
    lines.push("")
    lines.push("---")
    lines.push("")
  }

  const result = await saveToVault(path, lines.join("\n"))
  if (!result.ok) {
    return { saved: false, count: runs.length, error: result.error }
  }
  return { saved: true, count: runs.length, path }
}

// ──────────────────────────────────────────────────────────────────────────
// Multi-step fire-and-forget to the VPS workflow executor
// ──────────────────────────────────────────────────────────────────────────

async function fireMultiStepToVps(args: {
  run_id: string
  workflow_id: string
  input: Record<string, unknown>
}): Promise<{ ok: boolean; error?: string }> {
  const url = await getSecret("AGENT_RUNNER_URL")
  const token = await getSecret("AGENT_RUNNER_TOKEN")
  if (!url) return { ok: false, error: "AGENT_RUNNER_URL not configured" }
  try {
    const res = await fetch(`${url}/workflows/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(args),
      // Short timeout — the VPS responds 202 ACCEPTED immediately and runs in
      // background, so we only need to confirm the request was queued.
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return { ok: false, error: `VPS returned ${res.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// Module-level Supabase client — same pattern as /api/runs/[id]/control so
// callbacks here update workflow_runs the exact same way that route does.
// Routes are `dynamic = "force-dynamic"` so this is constructed per cold-start
// at most, not per request.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// RFC 4122-ish UUID. We don't care about version digits — we just want to
// reject obvious garbage (e.g. someone pasting a stale button into a fork)
// before we hit Supabase.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type CallbackAction = "approve" | "cancel" | "abort" | "pause" | "resume"
const VALID_ACTIONS: ReadonlySet<string> = new Set([
  "approve",
  "cancel",
  "abort",
  "pause",
  "resume",
])

function parseCallbackData(
  data: string | undefined | null,
): { action: CallbackAction; runId: string } | null {
  if (typeof data !== "string" || !data.includes(":")) return null
  const idx = data.indexOf(":")
  const action = data.slice(0, idx).trim().toLowerCase()
  const runId = data.slice(idx + 1).trim()
  if (!VALID_ACTIONS.has(action)) return null
  if (!UUID_RE.test(runId)) return null
  return { action: action as CallbackAction, runId }
}

async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  // Tiny inline call — see top-of-file note about why this isn't in the lib.
  let token: string | null = null
  try {
    token = await getSecret("TELEGRAM_BOT_TOKEN")
  } catch {
    token = process.env.TELEGRAM_BOT_TOKEN || null
  }
  if (!token) {
    console.error("[telegram-webhook] answerCallbackQuery skipped — no TELEGRAM_BOT_TOKEN")
    return
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    })
  } catch (e) {
    console.error("[telegram-webhook] answerCallbackQuery threw:", (e as Error).message)
  }
}

/**
 * Look up the currently-pending `awaiting_approval` step for a run.
 *
 * runWorkflow's approval gate filters its `step.waitForEvent` by both run_id
 * AND step_id, so a callback that only carries `approve:<runId>` needs us to
 * resolve which step is actually waiting. We pick the most recently started
 * row in `workflow_steps` with status `awaiting_approval` — there should
 * normally be at most one, but if a workflow has parallel approval branches
 * the user is approving the latest prompt they saw.
 *
 * Returns null if no pending approval exists (e.g. button tapped twice, or
 * the run already moved past the gate via timeout).
 */
async function findPendingApprovalStep(runId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("workflow_steps")
    .select("id")
    .eq("run_id", runId)
    .eq("status", "awaiting_approval")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>()
  if (error) {
    console.error("[telegram-webhook] findPendingApprovalStep failed:", error.message)
    return null
  }
  return data?.id ?? null
}

/**
 * Dispatch a callback action against a run. Mirrors the side-effects of
 * /api/runs/[id]/approve and /api/runs/[id]/control without going over HTTP.
 *
 * Returns a short human-readable status string for the threaded Telegram
 * reply, or throws on any unrecoverable error (caught upstream so we still
 * 200 to Telegram and surface the failure as a chat message).
 */
async function dispatchRunAction(
  action: CallbackAction,
  runId: string,
): Promise<string> {
  if (action === "approve" || action === "cancel") {
    const stepId = await findPendingApprovalStep(runId)
    if (!stepId) {
      // Either already decided or no gate exists. For `cancel` we still want
      // to abort the run as a fallback — Dylan tapped Cancel for a reason.
      if (action === "cancel") {
        await inngest.send({ name: EVENT_RUN_ABORTED, data: { run_id: runId } })
        await supabase
          .from("workflow_runs")
          .update({ status: "aborted", finished_at: new Date().toISOString() })
          .eq("id", runId)
        return `Cancelled — Run #${runId} (no pending approval, aborted instead)`
      }
      return `No pending approval for Run #${runId} (already decided?)`
    }

    const decision: "approve" | "reject" = action === "approve" ? "approve" : "reject"
    await inngest.send({
      name: EVENT_RUN_APPROVAL,
      data: { run_id: runId, step_id: stepId, decision, note: `via Telegram (${action})` },
    })

    // For `cancel`, also fire abort so any sibling branches halt — a reject
    // alone only kills the branch the gate was on.
    if (action === "cancel") {
      await inngest.send({ name: EVENT_RUN_ABORTED, data: { run_id: runId } })
      await supabase
        .from("workflow_runs")
        .update({ status: "aborted", finished_at: new Date().toISOString() })
        .eq("id", runId)
      return `Cancelled — Run #${runId}`
    }

    return `Approved — Run #${runId}`
  }

  // pause / resume / abort — same shape as /api/runs/[id]/control.
  const eventName =
    action === "pause"  ? EVENT_RUN_PAUSED  :
    action === "resume" ? EVENT_RUN_RESUMED :
                          EVENT_RUN_ABORTED

  await inngest.send({ name: eventName, data: { run_id: runId } })

  if (action === "abort") {
    await supabase
      .from("workflow_runs")
      .update({ status: "aborted", finished_at: new Date().toISOString() })
      .eq("id", runId)
    return `Aborted — Run #${runId}`
  }
  if (action === "pause") {
    await supabase.from("workflow_runs").update({ status: "paused" }).eq("id", runId)
    return `Paused — Run #${runId}`
  }
  // resume — let runWorkflow flip status back to running on its own.
  return `Resumed — Run #${runId}`
}

export async function POST(req: NextRequest) {
  try {
    // 1. Validate secret (constant-time inside the lib).
    const secretHeader = req.headers.get(SECRET_HEADER)
    if (!(await validateWebhookSecret(secretHeader))) {
      console.error("[telegram-webhook] rejected: bad secret token")
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
    }

    // 2. Parse update body.
    const update = (await req.json().catch(() => null)) as TelegramUpdate | null
    if (!update || typeof update !== "object") {
      // Bad JSON. Return 200 anyway so Telegram doesn't retry; nothing we can
      // do with garbage we can't parse.
      console.error("[telegram-webhook] rejected: invalid JSON body")
      return NextResponse.json({ ok: true, ignored: "bad-json" })
    }

    // 3. Authorize chat id (silent rejection on miss).
    const chatId =
      update.message?.chat?.id ??
      update.callback_query?.message?.chat?.id ??
      null

    if (chatId == null) {
      // Some update kinds (channel posts, edited messages, etc.) don't carry
      // a chat we care about. Quietly ack.
      console.warn("[telegram-webhook] update has no usable chat id; ignoring", {
        update_id: update.update_id,
      })
      return NextResponse.json({ ok: true, ignored: "no-chat-id" })
    }

    if (!(await isAuthorizedChatId(chatId))) {
      console.warn("[telegram-webhook] rejected: chat_id not in allowlist", {
        chat_id: chatId,
        update_id: update.update_id,
      })
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 })
    }

    // 4a. Callback query (button tap) — Phase 2 routes by `<action>:<run_id>`.
    if (update.callback_query) {
      const cq = update.callback_query
      console.log("[telegram-webhook] callback_query received", {
        id: cq.id,
        from: cq.from?.username || cq.from?.id,
        data: cq.data,
      })

      // Always ack first — Telegram only spins for ~10s and we don't want a
      // slow Inngest send to leave the button greyed out.
      await answerCallbackQuery(cq.id)

      const parsed = parseCallbackData(cq.data)
      const replyToMessageId = cq.message?.message_id

      if (!parsed) {
        // Unknown / malformed callback_data — log it but don't spam the chat
        // with errors for every button shape we might add later.
        console.warn("[telegram-webhook] callback_query data unparseable", {
          data: cq.data,
        })
        return NextResponse.json({ ok: true, kind: "callback_query", ignored: "bad-data" })
      }

      try {
        const status = await dispatchRunAction(parsed.action, parsed.runId)
        await sendTelegram(status, {
          chatId,
          parseMode: "Markdown",
          replyToMessageId,
          disableWebPagePreview: true,
        })
        return NextResponse.json({
          ok: true,
          kind: "callback_query",
          action: parsed.action,
          run_id: parsed.runId,
        })
      } catch (err) {
        const msg = (err as Error).message || "unknown error"
        console.error("[telegram-webhook] dispatchRunAction failed", {
          action: parsed.action,
          run_id: parsed.runId,
          error: msg,
        })
        await sendTelegram(`Action failed: ${msg}`, {
          chatId,
          parseMode: "Markdown",
          replyToMessageId,
          disableWebPagePreview: true,
        })
        // 200 — Telegram retrying won't fix it and we already told Dylan.
        return NextResponse.json({ ok: false, kind: "callback_query", error: msg })
      }
    }

    // 4b. Text message → parse slash command, route to workflow.
    const message = update.message
    const text = message?.text?.trim()
    if (!message || !text) {
      // Non-text messages (stickers, photos, etc.).
      console.log("[telegram-webhook] non-text message ignored", {
        update_id: update.update_id,
      })
      return NextResponse.json({ ok: true, ignored: "non-text" })
    }

    const cmd = parseCommand(text)

    // Static replies — /start, /help, /runs, unknown command, "usage:" hints.
    if (cmd.kind === "static") {
      await sendTelegram(cmd.text, {
        chatId,
        parseMode: "Markdown",
        replyToMessageId: message.message_id,
        disableWebPagePreview: true,
      })
      return NextResponse.json({ ok: true, kind: "static" })
    }

    // /terminals — list active sessions on the VPS
    if (cmd.kind === "terminal_list") {
      const r = await callTerminalServer<{
        sessions: TerminalSession[]
        capacity?: { active: number; hard_max: number; soft_max: number }
      }>("GET", "/sessions")
      const text = r.ok
        ? formatTerminalsList(r.data.sessions || [], r.data.capacity)
        : `❌ Couldn't reach the VPS terminal-server.\n\n\`${r.error}\``
      await sendTelegram(text, {
        chatId,
        parseMode: "Markdown",
        replyToMessageId: message.message_id,
        disableWebPagePreview: true,
      })
      return NextResponse.json({ ok: true, kind: "terminal_list" })
    }

    // /spawn — create a new terminal with the task as the initial prompt
    if (cmd.kind === "terminal_spawn") {
      const r = await callTerminalServer<{ id: string; title: string; branch: string }>("POST", "/sessions", {
        title: cmd.task.slice(0, 50),
        initial_prompt: cmd.task,
        inject_sibling_prompt: true,
        telegram_chat_id: String(chatId),
      })
      const text = r.ok
        ? `🚀 *Terminal spawned* \`${r.data.id.slice(0, 8)}\`\n\n_${cmd.task.slice(0, 200)}_\n\nBranch: \`${r.data.branch}\`\nWatch live: outreach-github.vercel.app/agency/terminals\n\nI'll ping you on cost cap, wallclock cap, or crash.`
        : `❌ Couldn't spawn a terminal.\n\n\`${r.error}\``
      await sendTelegram(text, {
        chatId,
        parseMode: "Markdown",
        replyToMessageId: message.message_id,
        disableWebPagePreview: true,
      })
      return NextResponse.json({ ok: true, kind: "terminal_spawn" })
    }

    // /kill <id> — stop a terminal by id prefix
    if (cmd.kind === "terminal_kill") {
      // Accept 8-char prefix. Resolve to full id by listing.
      let fullId = cmd.id
      if (cmd.id.length < 36) {
        const list = await callTerminalServer<{ sessions: TerminalSession[] }>("GET", "/sessions")
        if (list.ok) {
          const match = (list.data.sessions || []).find((s) => s.id.startsWith(cmd.id))
          if (!match) {
            await sendTelegram(`No terminal matches \`${cmd.id}\`. Run /terminals to see active ones.`, {
              chatId,
              parseMode: "Markdown",
              replyToMessageId: message.message_id,
            })
            return NextResponse.json({ ok: true, kind: "terminal_kill", err: "not_found" })
          }
          fullId = match.id
        }
      }
      const r = await callTerminalServer<{ ok: boolean }>("DELETE", `/sessions/${fullId}`)
      const text = r.ok
        ? `🛑 Terminal \`${fullId.slice(0, 8)}\` stopped. Branch preserved; transcript saved to Memory Vault.`
        : `❌ Couldn't stop terminal.\n\n\`${r.error}\``
      await sendTelegram(text, {
        chatId,
        parseMode: "Markdown",
        replyToMessageId: message.message_id,
      })
      return NextResponse.json({ ok: true, kind: "terminal_kill" })
    }

    // /clear — save recent conversation to vault, then "wipe" the buffer.
    // /exit — same as /clear, but with a goodbye tone.
    if (cmd.kind === "clear_conversation") {
      const snapshot = await snapshotConversationToVault(chatId)
      const isExit = cmd.tone === "exit"
      const headline = isExit
        ? "👋 *Goodbye for now.*"
        : "🧹 *Conversation history cleared.*"
      const detail = snapshot.saved
        ? `Saved the last ${snapshot.count} exchange${snapshot.count === 1 ? "" : "s"} to the Memory Vault at \`${snapshot.path}\` so we can pick this back up later.`
        : snapshot.count === 0
          ? "Nothing to save — no past runs from this chat."
          : `Tried to save your recent exchanges but the Memory Vault said: \`${snapshot.error}\`. The conversation is still cleared.`
      const closing = isExit
        ? "Send any message to start a fresh session."
        : "I'll start fresh on the next message."
      await sendTelegram(`${headline}\n\n${detail}\n\n${closing}`, {
        chatId,
        parseMode: "Markdown",
        replyToMessageId: message.message_id,
        disableWebPagePreview: true,
      })
      return NextResponse.json({
        ok: true,
        kind: "clear_conversation",
        tone: cmd.tone,
        saved: snapshot.saved,
        count: snapshot.count,
        path: snapshot.path,
      })
    }

    // Workflow execution.
    try {
      const meta = {
        source: "telegram" as const,
        telegram_chat_id: chatId,
        telegram_message_id: message.message_id,
        telegram_username: message.from?.username || null,
        received_at: new Date().toISOString(),
      }
      const { run_id, workflow_id } = await triggerWorkflowBySlug(
        cmd.slug,
        { message: cmd.message },
        meta,
      )

      // Pick sync vs VPS based on the workflow's complexity.
      const isSyncSafe = SYNC_SAFE_SLUGS.has(cmd.slug.toLowerCase()) ||
        SYNC_SAFE_SLUGS.has(cmd.slug)

      // ack message — different shape for quick vs multi-step so Dylan knows
      // what to expect.
      const ackText = isSyncSafe
        ? `${cmd.emoji} *${cmd.label}* — running. I'll reply when done.\n\n_Run #${run_id.slice(0, 8)}_`
        : `${cmd.emoji} *${cmd.label}* — running on the VPS. I'll ping you on stage transitions and when it's done. Multi-step flows take a few minutes.\n\n_Run #${run_id.slice(0, 8)}_`

      await sendTelegram(ackText, {
        chatId,
        parseMode: "Markdown",
        replyToMessageId: message.message_id,
        disableWebPagePreview: true,
      })

      if (isSyncSafe) {
        // In-process sync executor — works for single-agent workflows.
        try {
          await runWorkflowSync({
            run_id,
            workflow_id,
            input: { message: cmd.message, _meta: meta },
          })
        } catch (e) {
          console.error("[telegram-webhook] sync run threw:", (e as Error).message)
        }
      } else {
        // Multi-step — fire-and-forget to the VPS executor. Vercel's
        // serverless function lifetime can't cover 5-30 min builds.
        const vpsResult = await fireMultiStepToVps({
          run_id,
          workflow_id,
          input: { message: cmd.message, _meta: meta },
        })
        if (!vpsResult.ok) {
          console.error("[telegram-webhook] VPS dispatch failed:", vpsResult.error)
          await sendTelegram(
            `❌ Couldn't start the workflow on the VPS: ${vpsResult.error || "unknown error"}.\n\n_Run #${run_id.slice(0, 8)} marked failed._`,
            { chatId, parseMode: "Markdown", replyToMessageId: message.message_id },
          )
          await supabase
            .from("workflow_runs")
            .update({ status: "failed", error: `VPS dispatch failed: ${vpsResult.error}`, finished_at: new Date().toISOString() })
            .eq("id", run_id)
        }
      }

      return NextResponse.json({ ok: true, run_id, slug: cmd.slug })
    } catch (err) {
      if (err instanceof WorkflowNotFoundError) {
        console.error("[telegram-webhook] quick-ask workflow not seeded", { slug: err.slug })
        await sendTelegram(
          "Workflow not seeded yet — check with the team.",
          {
            chatId,
            parseMode: "Markdown",
            replyToMessageId: message.message_id,
          },
        )
        return NextResponse.json(
          { ok: false, error: "workflow-not-found" },
          { status: 503 },
        )
      }

      if (err instanceof BudgetExceededError) {
        console.error("[telegram-webhook] budget exceeded", err.details)
        await sendTelegram(
          `Daily budget cap hit — try again tomorrow. (${err.message})`,
          {
            chatId,
            parseMode: "Markdown",
            replyToMessageId: message.message_id,
          },
        )
        // 200 — Telegram retrying won't help and we already replied to Dylan.
        return NextResponse.json({ ok: false, error: "budget" })
      }

      throw err
    }
  } catch (e) {
    // Last-resort safety net. Log, attempt a single chat reply (best-effort,
    // outside its own try so a Telegram outage can't re-throw), then return
    // 200 so Telegram doesn't infinite-retry.
    //
    // Why we DO reply now (vs the original silent-200 design):
    //   The original concern was a feedback loop — but that only fires if the
    //   reply ITSELF triggers an update with a chat id we authorized. Since
    //   sendTelegram doesn't echo the bot's own messages back as updates
    //   (Telegram never sends bot-authored messages to the bot's webhook),
    //   that loop can't form. The cost of silence has been Dylan messaging
    //   the bot, getting nothing, and not knowing if he should retry.
    const err = e as Error
    console.error("[telegram-webhook] unhandled error:", err.message, e)

    // Try to recover the chat id we already validated, so we can reply.
    // If we never made it past the auth gate, chatId is undefined — fine,
    // sendTelegram will fall back to TELEGRAM_CHAT_ID.
    let chatId: number | string | undefined
    let replyToMessageId: number | undefined
    try {
      // We may not have parsed `update` yet if this caught from JSON parsing
      // earlier. The locals from the try block aren't in scope here, so we
      // best-effort re-read from req — if that also throws, we just send to
      // TELEGRAM_CHAT_ID with no reply target.
      const cloned = req.clone()
      const update = (await cloned.json().catch(() => null)) as TelegramUpdate | null
      chatId =
        update?.message?.chat?.id ??
        update?.callback_query?.message?.chat?.id ??
        undefined
      replyToMessageId = update?.message?.message_id
    } catch {
      // ignore — we'll fall back to default chat id
    }

    try {
      await sendTelegram(
        `⚠️ Jarvis hit an unexpected error.\n\n\`${err.message.slice(0, 250)}\`\n\nThis is logged on Vercel. If it keeps happening, check /agency/jarvis.`,
        {
          chatId,
          parseMode: "Markdown",
          replyToMessageId,
          disableWebPagePreview: true,
        },
      )
    } catch (notifyErr) {
      console.error("[telegram-webhook] error-reply itself failed:", (notifyErr as Error).message)
    }

    return NextResponse.json({ ok: true, error: "internal" })
  }
}
