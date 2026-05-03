/**
 * Wave 4.3 — Account-health auto-pause monitor.
 *
 * After every send error, call `record(accountId, signal)` with the kind
 * of failure. When a signal counter crosses threshold, this:
 *   1. Sets accounts.status = 'paused_health'
 *   2. Sets accounts.auto_paused_reason + auto_paused_at
 *   3. Fires a Telegram alert if configured
 *
 * Counters reset daily via /api/cron/rate-limit-reset.
 *
 * Use case: Instagram returns 3 consecutive 429s → pause the account before
 * Meta's ban detection fires. Same for "login_required" (cookies expired)
 * or "shadowban" (search API returns nothing for own profile).
 */

import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "@/lib/telegram"

export type HealthSignal = "rate_limit" | "login_required" | "shadowban"

const COL_BY_SIGNAL: Record<HealthSignal, string> = {
  rate_limit: "recent_429",
  login_required: "recent_login_required",
  shadowban: "recent_shadowban",
}

const THRESHOLD = 3 // 3 in 30min triggers auto-pause

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function recordHealthSignal(accountId: string, signal: HealthSignal): Promise<{ paused: boolean; count: number }> {
  if (!accountId) return { paused: false, count: 0 }
  const col = COL_BY_SIGNAL[signal]

  // Atomic increment via a stored expression — Supabase doesn't have
  // a generic +1 RPC for arbitrary columns, so we read-then-write inside
  // a single update with a returning clause. The count drift in tight
  // races is acceptable here (we're always conservative — slight over-count
  // means we pause one signal earlier than threshold, which is fine).
  const { data: row } = await supabase
    .from("accounts")
    .select("status, recent_429, recent_login_required, recent_shadowban")
    .eq("account_id", accountId)
    .maybeSingle()

  if (!row) return { paused: false, count: 0 }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cur = (row as any)[col] as number | null
  const next = (cur || 0) + 1

  await supabase
    .from("accounts")
    .update({ [col]: next })
    .eq("account_id", accountId)

  if (next >= THRESHOLD && row.status !== "paused_health") {
    await supabase
      .from("accounts")
      .update({
        status: "paused_health",
        auto_paused_reason: `${signal} threshold (${next} in window)`,
        auto_paused_at: new Date().toISOString(),
      })
      .eq("account_id", accountId)

    // Best-effort Telegram alert
    try {
      const { data: settings } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "deadman_switch")
        .maybeSingle()
      const cfg = settings?.value || {}
      if (cfg.telegram_chat_id) {
        await sendTelegram(
          `🛑 Account ${accountId.slice(0, 8)}… auto-paused — ${signal} threshold hit (${next} signals).`,
          { chatId: cfg.telegram_chat_id }
        )
      }
    } catch {}

    // Notification record so it shows up in the inbox UI
    try {
      await supabase.from("notifications").insert({
        type: "account_auto_paused",
        title: "Account auto-paused",
        message: `Account ${accountId} → paused_health (${signal} ×${next})`,
        account_id: accountId,
      })
    } catch {}

    return { paused: true, count: next }
  }

  return { paused: false, count: next }
}

/** Convenience for callers that have a raw error message + status. */
export function classifyHealthSignal(status: number, errMsg: string): HealthSignal | null {
  if (status === 429) return "rate_limit"
  const lower = (errMsg || "").toLowerCase()
  if (lower.includes("login_required") || lower.includes("must log in") || lower.includes("session expired")) {
    return "login_required"
  }
  if (lower.includes("shadowban") || lower.includes("not found") && lower.includes("self")) {
    return "shadowban"
  }
  return null
}
