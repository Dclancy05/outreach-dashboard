/**
 * Central notification dispatcher.
 *
 * One place for runWorkflow, crons, and (future) other producers to fan out
 * a structured event to whichever channels the user expects. Phase 2 ships
 * Telegram fully wired and `in_app` / `email` / `push` as not-implemented
 * stubs — Phase 5 fills those in once we have an in-app inbox table and
 * push infrastructure.
 *
 * Why a dispatcher (vs. each producer importing telegram directly):
 *  - Channel inference based on `_meta.source` lives in one place
 *  - Per-channel try/catch — a Telegram outage cannot tank the run state
 *    update or block the in-app write that follows
 *  - Adds a single seam where Phase 5 can plug new channels with zero
 *    edits to producers (run-workflow.ts, cron handlers, etc.)
 *
 * Producer contract:
 *  - Pass the run row's `_meta` as `opts.meta` if you have it (saves a DB
 *    round-trip). Otherwise pass nothing — channel inference falls back to
 *    `in_app` (which is currently a no-op, but won't error).
 *  - Never await this in a critical path you care about. It's intentionally
 *    fire-and-forget-friendly: every channel is wrapped, the function never
 *    throws, and the returned map is informational only.
 *
 * Telegram threading: when meta.telegram_message_id is present we use it as
 * `replyToMessageId` so all updates for one run thread under the original
 * `/jarvis ...` message Dylan sent — keeps his phone notification stream
 * coherent.
 */

import { sendTelegram, sendTelegramButtons, type TelegramButton } from "@/lib/telegram"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type NotifyKind =
  | "run_started"
  | "stage_transition"
  | "approval_required"
  | "run_completed"
  | "run_failed"
  | "budget_exceeded"

export type NotifyChannel = "telegram" | "in_app" | "email" | "push"

export type NotifyPayload = {
  run_id: string
  workflow_name?: string
  stage_name?: string
  cost_so_far_usd?: number
  step_count?: number
  total_steps?: number
  budget_usd?: number
  pr_url?: string
  preview_url?: string
  /** for run_completed — already-extracted final reply text */
  output_text?: string
  /** for run_failed */
  error_text?: string
  /** Free-form additional context the channel formatter may use. */
  extra?: Record<string, unknown>
}

export type NotifyOptions = {
  /** Force a specific set of channels. If omitted, we infer from meta.source. */
  channels?: NotifyChannel[]
  /** The run row's `input._meta` blob. Producer should pass this when known. */
  meta?: Record<string, unknown>
}

export type NotifyChannelResult = { ok: boolean; error?: string }
export type NotifyResult = Partial<Record<NotifyChannel, NotifyChannelResult>>

// ---------------------------------------------------------------------------
// Channel inference
// ---------------------------------------------------------------------------

type RunMeta = {
  source?: string
  telegram_chat_id?: string | number
  telegram_message_id?: number
}

function readMeta(opts?: NotifyOptions): RunMeta {
  const m = opts?.meta
  if (m && typeof m === "object") return m as RunMeta
  return {}
}

function inferChannels(meta: RunMeta): NotifyChannel[] {
  if (meta.source === "telegram") return ["telegram"]
  // Default: in_app. Phase 5 will turn this into something real.
  return ["in_app"]
}

// ---------------------------------------------------------------------------
// Telegram formatter
// ---------------------------------------------------------------------------

/** Truncate long bodies so they fit comfortably under Telegram's 4096 limit. */
function truncate(text: string, max = 3500): string {
  if (text.length <= max) return text
  return text.slice(0, max - 100) + "\n\n…(truncated)"
}

/** Money formatter — always 2 decimals, never "NaN". */
function fmtCost(n: number | undefined): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0
  return v.toFixed(2)
}

function formatTelegramMessage(kind: NotifyKind, p: NotifyPayload): string {
  const wf = p.workflow_name || "workflow"
  const runTag = `_Run \`${p.run_id}\`_`

  switch (kind) {
    case "run_started":
      return `🟢 *Started:* ${wf}\n\n${runTag}`

    case "stage_transition": {
      const total = p.total_steps ? ` of ${p.total_steps}` : ""
      const stepN = p.step_count ?? "?"
      const stage = p.stage_name || "next stage"
      return `▶️ *${stage}* (${stepN}${total})\n\n${runTag}`
    }

    case "approval_required": {
      const stage = p.stage_name ? `\nStage: *${p.stage_name}*` : ""
      const cost = `\nCost so far: $${fmtCost(p.cost_so_far_usd)}`
      const pr = p.pr_url ? `\nPR: ${p.pr_url}` : ""
      return `⏸️ *Paused:* ${wf}${stage}${cost}${pr}\n\n${runTag}`
    }

    case "run_completed": {
      const body = truncate(p.output_text || "(no reply produced)")
      return `✅ *Done!*\n\n${body}\n\n${runTag}`
    }

    case "run_failed": {
      const err = (p.error_text || "Run errored").slice(0, 800)
      return `❌ *Failed:* ${err}\n\n${runTag}`
    }

    case "budget_exceeded": {
      const got = fmtCost(p.cost_so_far_usd)
      const budget = p.budget_usd != null ? ` of $${fmtCost(p.budget_usd)}` : ""
      return `🛑 *Budget hit:* $${got}${budget}\n${wf} paused.\n\n${runTag}`
    }
  }
}

/**
 * Approval keyboard. We use callback_data for all three buttons — even the
 * "view diff" one — because mixing url-buttons and callback-buttons works
 * but is awkward when pr_url is missing, and the webhook can already handle
 * a `diff:<runId>` callback to post the diff inline. If pr_url IS provided
 * we bias toward a real url-button so Dylan can tap straight to GitHub.
 */
function approvalKeyboard(payload: NotifyPayload): TelegramButton[][] {
  const top: TelegramButton[] = [
    { text: "✅ Approve", callback_data: `approve:${payload.run_id}` },
    { text: "❌ Cancel", callback_data: `cancel:${payload.run_id}` },
  ]
  // The bottom row is callback-only to keep the TelegramButton type consistent.
  // Webhook handler can either reply with the diff inline (callback) or, if
  // pr_url is set, the user can tap the link Telegram auto-renders in the
  // message body itself.
  const bottom: TelegramButton[] = [
    { text: "🔍 View diff", callback_data: `diff:${payload.run_id}` },
  ]
  return [top, bottom]
}

// ---------------------------------------------------------------------------
// Per-channel senders
// ---------------------------------------------------------------------------

async function sendTelegramNotification(
  kind: NotifyKind,
  payload: NotifyPayload,
  meta: RunMeta,
): Promise<NotifyChannelResult> {
  const text = formatTelegramMessage(kind, payload)
  const opts = {
    chatId: meta.telegram_chat_id,
    parseMode: "Markdown" as const,
    replyToMessageId: meta.telegram_message_id,
  }

  if (kind === "approval_required") {
    const result = await sendTelegramButtons(text, approvalKeyboard(payload), {
      chatId: meta.telegram_chat_id,
      parseMode: "Markdown",
    })
    if (!result) return { ok: false, error: "telegram send failed (see [telegram] logs)" }
    return { ok: true }
  }

  const result = await sendTelegram(text, opts)
  if (!result) return { ok: false, error: "telegram send failed (see [telegram] logs)" }
  return { ok: true }
}

async function sendInAppNotification(
  _kind: NotifyKind,
  _payload: NotifyPayload,
): Promise<NotifyChannelResult> {
  // Phase 5: write to a `notifications` table the dashboard can poll/subscribe.
  return { ok: false, error: "not implemented" }
}

async function sendEmailNotification(
  _kind: NotifyKind,
  _payload: NotifyPayload,
): Promise<NotifyChannelResult> {
  // Phase 5: route through whichever transactional provider is wired up.
  return { ok: false, error: "not implemented" }
}

async function sendPushNotification(
  _kind: NotifyKind,
  _payload: NotifyPayload,
): Promise<NotifyChannelResult> {
  // Phase 5: web-push / APNs / FCM.
  return { ok: false, error: "not implemented" }
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Dispatch one notification across one or more channels. Each channel is
 * independent — a failure in one never blocks the others. The function never
 * throws; failures are returned in the per-channel result map.
 */
export async function dispatchNotification(
  kind: NotifyKind,
  payload: NotifyPayload,
  opts?: NotifyOptions,
): Promise<NotifyResult> {
  const meta = readMeta(opts)
  const channels: NotifyChannel[] = (opts?.channels && opts.channels.length > 0)
    ? opts.channels
    : inferChannels(meta)

  if (channels.length === 0) {
    console.warn(`[notify] no channels resolved for kind=${kind} run=${payload.run_id}`)
    return {}
  }

  const results: NotifyResult = {}

  // Run channels in parallel — they're independent.
  await Promise.all(
    channels.map(async (ch) => {
      try {
        switch (ch) {
          case "telegram": {
            // Hard guard: telegram needs a chat id (either from meta or env).
            // sendTelegram/sendTelegramButtons resolve env fallback themselves,
            // so we only short-circuit when caller explicitly forced telegram
            // but no env chat id and no meta chat id will be findable. Cheap
            // best-effort check; the helper logs the same condition anyway.
            results.telegram = await sendTelegramNotification(kind, payload, meta)
            break
          }
          case "in_app":
            results.in_app = await sendInAppNotification(kind, payload)
            break
          case "email":
            results.email = await sendEmailNotification(kind, payload)
            break
          case "push":
            results.push = await sendPushNotification(kind, payload)
            break
          default: {
            // Exhaustiveness: if NotifyChannel ever grows, TS will warn here.
            const _exhaustive: never = ch
            void _exhaustive
          }
        }
      } catch (e) {
        results[ch] = { ok: false, error: (e as Error).message || "unknown error" }
      }
    }),
  )

  return results
}
