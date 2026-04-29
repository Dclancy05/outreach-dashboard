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
import { BudgetExceededError } from "@/lib/workflow/cost-guards"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const QUICK_ASK_SLUG = "quick-ask"
const SECRET_HEADER = "x-telegram-bot-api-secret-token"

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

export async function POST(req: NextRequest) {
  try {
    // 1. Validate secret (constant-time inside the lib).
    const secretHeader = req.headers.get(SECRET_HEADER)
    if (!validateWebhookSecret(secretHeader)) {
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

    if (!isAuthorizedChatId(chatId)) {
      console.warn("[telegram-webhook] rejected: chat_id not in allowlist", {
        chat_id: chatId,
        update_id: update.update_id,
      })
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 })
    }

    // 4a. Callback query (button tap) — Phase 1 just acks.
    if (update.callback_query) {
      const cq = update.callback_query
      console.log("[telegram-webhook] callback_query received", {
        id: cq.id,
        from: cq.from?.username || cq.from?.id,
        data: cq.data,
      })
      await answerCallbackQuery(cq.id)
      return NextResponse.json({ ok: true, kind: "callback_query" })
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
      const { run_id } = await triggerWorkflowBySlug(
        QUICK_ASK_SLUG,
        { message: text },
        {
          source: "telegram",
          telegram_chat_id: chatId,
          telegram_message_id: message.message_id,
          telegram_username: message.from?.username || null,
          received_at: new Date().toISOString(),
        },
      )

      // Reply confirmation — keep it short and threaded to the original msg so
      // the chat reads naturally on phone.
      await sendTelegram(
        `🤖 Got it — running. I'll reply when done.\n\n_Run #${run_id}_`,
        {
          chatId,
          parseMode: "Markdown",
          replyToMessageId: message.message_id,
          disableWebPagePreview: true,
        },
      )

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
