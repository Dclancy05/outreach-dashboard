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

    // 4b. Text message → queue Quick Ask.
    const message = update.message
    const text = message?.text?.trim()
    if (!message || !text) {
      // Non-text messages (stickers, photos, etc.) — nothing to do for Phase 1.
      console.log("[telegram-webhook] non-text message ignored", {
        update_id: update.update_id,
      })
      return NextResponse.json({ ok: true, ignored: "non-text" })
    }

    try {
      const meta = {
        source: "telegram" as const,
        telegram_chat_id: chatId,
        telegram_message_id: message.message_id,
        telegram_username: message.from?.username || null,
        received_at: new Date().toISOString(),
      }
      const { run_id, workflow_id } = await triggerWorkflowBySlug(
        QUICK_ASK_SLUG,
        { message: text },
        meta,
      )

      // Reply confirmation — keep it short and threaded to the original msg so
      // the chat reads naturally on phone.
      await sendTelegram(
        `🤖 Got it — running. I'll reply when done.\n\n_Run #${run_id.slice(0, 8)}_`,
        {
          chatId,
          parseMode: "Markdown",
          replyToMessageId: message.message_id,
          disableWebPagePreview: true,
        },
      )

      // Synchronous execution path — Inngest cloud isn't wired, so we walk
      // the workflow graph in-process. Single-agent workflows (Quick Ask)
      // complete inside Vercel's request budget; multi-step ones still need
      // Inngest to be configured via INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY.
      try {
        await runWorkflowSync({
          run_id,
          workflow_id,
          input: { message: text, _meta: meta },
        })
      } catch (e) {
        console.error("[telegram-webhook] sync run threw:", (e as Error).message)
      }

      return NextResponse.json({ ok: true, run_id })
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
