/**
 * Shared Telegram helper library.
 *
 * Used by:
 *  - cron alerts (deadman-check, cookies-health-check, proxy-health-check, …)
 *  - the Jarvis remote-Claude webhook (incoming /jarvis commands → callback buttons)
 *
 * Design notes:
 *  - Reads env at CALL TIME, not module init — Vercel routes import lazily and
 *    we want the secrets system (DB-backed `api_keys` table via getSecret()) to
 *    win when present. process.env is the fallback.
 *  - All API calls go through one `tg()` helper. Network/HTTP errors are logged
 *    with a `[telegram]` prefix and converted to null/{ok:false}; nothing here
 *    throws, so a flaky Telegram outage can't take down a cron.
 *  - Markdown safety is the CALLER'S responsibility — Telegram's MarkdownV2
 *    requires escaping `_*[]()~\`>#+-=|{}.!` and we don't auto-escape because
 *    callers often want literal markdown. Use `parseMode: 'HTML'` if you'd
 *    rather escape `<>&` and let Telegram handle the rest.
 *  - `validateWebhookSecret` does a constant-time compare to avoid timing
 *    side-channels on the webhook handshake.
 */
import { timingSafeEqual } from "node:crypto"
import { getSecret } from "@/lib/secrets"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TelegramButton = { text: string; callback_data: string }

export type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; type: string; username?: string; first_name?: string }
    from?: { id: number; username?: string; first_name?: string }
    date: number
    text?: string
  }
  callback_query?: {
    id: string
    from: { id: number; username?: string; first_name?: string }
    message?: { message_id: number; chat: { id: number } }
    data?: string
  }
}

type SendMessageResult = { message_id: number; chat_id: number }

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function getEnv(name: string): Promise<string | null> {
  // Try the DB-backed secrets store first, fall back to process.env. getSecret
  // already does that fallback internally, so just call it.
  try {
    return await getSecret(name)
  } catch {
    const v = process.env[name]
    return typeof v === "string" && v ? v : null
  }
}

async function tg(method: string, payload: Record<string, unknown>): Promise<any | null> {
  const token = await getEnv("TELEGRAM_BOT_TOKEN")
  if (!token) {
    console.error(`[telegram] ${method} skipped — TELEGRAM_BOT_TOKEN not set`)
    return null
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data: any = await res.json().catch(() => null)
    if (!res.ok || !data || data.ok !== true) {
      console.error(
        `[telegram] ${method} failed: status=${res.status} body=${JSON.stringify(data)}`,
      )
      return null
    }
    return data.result
  } catch (e) {
    console.error(`[telegram] ${method} threw:`, (e as Error).message)
    return null
  }
}

async function resolveChatId(explicit?: string | number): Promise<string | null> {
  if (explicit !== undefined && explicit !== null && String(explicit).length > 0) {
    return String(explicit)
  }
  const fromEnv = await getEnv("TELEGRAM_CHAT_ID")
  return fromEnv ? String(fromEnv) : null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a plain (or formatted) text message. Returns the new message coordinates
 * on success, or null on any failure (logs the error). Never throws.
 *
 * Markdown / MarkdownV2 / HTML escaping is the caller's responsibility.
 */
export async function sendTelegram(
  text: string,
  opts?: {
    chatId?: string | number
    parseMode?: "Markdown" | "MarkdownV2" | "HTML"
    replyToMessageId?: number
    disableWebPagePreview?: boolean
  },
): Promise<SendMessageResult | null> {
  const chat_id = await resolveChatId(opts?.chatId)
  if (!chat_id) {
    console.error("[telegram] sendTelegram skipped — no chat id (env TELEGRAM_CHAT_ID missing)")
    return null
  }

  const payload: Record<string, unknown> = {
    chat_id,
    text,
    parse_mode: opts?.parseMode ?? "Markdown",
  }
  if (opts?.replyToMessageId) payload.reply_to_message_id = opts.replyToMessageId
  if (opts?.disableWebPagePreview) payload.disable_web_page_preview = true

  const result = await tg("sendMessage", payload)
  if (!result) return null
  return {
    message_id: Number(result.message_id),
    chat_id: Number(result.chat?.id ?? chat_id),
  }
}

/**
 * Send a message with an inline keyboard. `rows[i]` is one row of buttons.
 * Each button's `callback_data` must be ≤ 64 bytes (Telegram limit) — caller
 * should keep it short, e.g. `approve:<runId>` or `deny:<runId>`.
 */
export async function sendTelegramButtons(
  text: string,
  rows: TelegramButton[][],
  opts?: {
    chatId?: string | number
    parseMode?: "Markdown" | "MarkdownV2" | "HTML"
  },
): Promise<SendMessageResult | null> {
  const chat_id = await resolveChatId(opts?.chatId)
  if (!chat_id) {
    console.error(
      "[telegram] sendTelegramButtons skipped — no chat id (env TELEGRAM_CHAT_ID missing)",
    )
    return null
  }

  const payload: Record<string, unknown> = {
    chat_id,
    text,
    parse_mode: opts?.parseMode ?? "Markdown",
    reply_markup: { inline_keyboard: rows },
  }

  const result = await tg("sendMessage", payload)
  if (!result) return null
  return {
    message_id: Number(result.message_id),
    chat_id: Number(result.chat?.id ?? chat_id),
  }
}

/**
 * Register a webhook URL with Telegram. The `secretToken` is what Telegram will
 * echo back in the `X-Telegram-Bot-Api-Secret-Token` header on every update —
 * verify it via `validateWebhookSecret`.
 */
export async function setWebhook(
  url: string,
  secretToken: string,
): Promise<{ ok: boolean; description?: string }> {
  const token = await getEnv("TELEGRAM_BOT_TOKEN")
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN not set" }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: secretToken,
        allowed_updates: ["message", "callback_query"],
      }),
    })
    const data: any = await res.json().catch(() => null)
    if (!res.ok || !data || data.ok !== true) {
      console.error(`[telegram] setWebhook failed: ${JSON.stringify(data)}`)
      return { ok: false, description: data?.description || `http ${res.status}` }
    }
    return { ok: true, description: data.description }
  } catch (e) {
    console.error("[telegram] setWebhook threw:", (e as Error).message)
    return { ok: false, description: (e as Error).message }
  }
}

export async function deleteWebhook(): Promise<{ ok: boolean }> {
  const token = await getEnv("TELEGRAM_BOT_TOKEN")
  if (!token) return { ok: false }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
    })
    const data: any = await res.json().catch(() => null)
    return { ok: res.ok && data?.ok === true }
  } catch (e) {
    console.error("[telegram] deleteWebhook threw:", (e as Error).message)
    return { ok: false }
  }
}

/**
 * Returns the raw `getWebhookInfo` payload from Telegram, or null on error.
 * Useful for the /agency/jarvis debug panel.
 */
export async function getWebhookInfo(): Promise<unknown> {
  const token = await getEnv("TELEGRAM_BOT_TOKEN")
  if (!token) return null
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
    const data: any = await res.json().catch(() => null)
    if (!res.ok || !data || data.ok !== true) {
      console.error(`[telegram] getWebhookInfo failed: ${JSON.stringify(data)}`)
      return null
    }
    return data.result
  } catch (e) {
    console.error("[telegram] getWebhookInfo threw:", (e as Error).message)
    return null
  }
}

/**
 * Constant-time compare the request's `X-Telegram-Bot-Api-Secret-Token` header
 * against env TELEGRAM_WEBHOOK_SECRET. Returns false on any length mismatch
 * (timingSafeEqual would throw on differing buffer sizes).
 *
 * NOTE: this reads process.env synchronously rather than getSecret() because
 * webhook validation is hot-path on every Telegram update and can't await a DB
 * round-trip. Make sure TELEGRAM_WEBHOOK_SECRET is set as a Vercel env var.
 */
export function validateWebhookSecret(headerValue: string | null | undefined): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || ""
  if (!expected) {
    console.error("[telegram] validateWebhookSecret: TELEGRAM_WEBHOOK_SECRET not set")
    return false
  }
  if (typeof headerValue !== "string" || headerValue.length === 0) return false

  const a = Buffer.from(headerValue, "utf8")
  const b = Buffer.from(expected, "utf8")
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Allowlist check for incoming webhook updates. Returns true if `chatId`:
 *  - equals env TELEGRAM_CHAT_ID, OR
 *  - is a member of comma-separated env TELEGRAM_ALLOWED_CHAT_IDS.
 *
 * Both are coerced to strings for comparison so numeric vs string IDs work.
 * Reads process.env synchronously (hot path — see validateWebhookSecret note).
 */
export function isAuthorizedChatId(chatId: number | string): boolean {
  const target = String(chatId).trim()
  if (!target) return false

  const allowed = new Set<string>()
  const single = (process.env.TELEGRAM_CHAT_ID || "").trim()
  if (single) allowed.add(single)

  const list = process.env.TELEGRAM_ALLOWED_CHAT_IDS || ""
  for (const raw of list.split(",")) {
    const v = raw.trim()
    if (v) allowed.add(v)
  }

  return allowed.has(target)
}
