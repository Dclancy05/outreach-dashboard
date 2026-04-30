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
        "*Web compose page:* outreach-github.vercel.app/agency/send",
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
    // Last-resort safety net. Log + 200 so Telegram doesn't infinite-retry.
    // Deliberately do NOT send a reply here — replying on every error risks
    // a feedback loop if the reply itself triggers another update.
    console.error("[telegram-webhook] unhandled error:", (e as Error).message, e)
    return NextResponse.json({ ok: true, error: "internal" })
  }
}
