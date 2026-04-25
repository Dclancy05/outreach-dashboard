import type { SupabaseClient } from "@supabase/supabase-js"
import { nextRetryDelay } from "@/lib/retry-queue"

// Default per-account daily cap when no campaign_safety_settings row + no
// account.daily_limit is configured. Conservative on purpose — better to
// under-send than burn an account.
const DEFAULT_DAILY_CAP = 40

// Fetch timeout for the internal /api/automation/send call. VPS Chrome work
// can be slow; 25s is well above typical browser-action latency without
// blowing past the 60s Vercel Hobby maxDuration.
const SEND_TIMEOUT_MS = 25_000

// Statuses we consider "live" so the worker only acts on rows that are truly
// waiting. send_queue has no DB-level CHECK constraint so we filter defensively.
const QUEUED_STATUS = "queued"

interface QueueRow {
  id: string
  platform: string | null
  lead_id: string | null
  lead_name: string | null
  username_or_url: string | null
  message: string | null
  message_text?: string | null
  account_id: string | null
  status: string | null
  campaign_id?: string | null
  template_id?: string | null
  follow_up_of?: string | null
  business_id?: string | null
  created_at: string
}

interface SafetySettings {
  campaign_id: string
  platform: string
  per_account_daily_max?: number | null
  per_account_hourly_max?: number | null
  daily_max?: number | null
  hourly_max?: number | null
  delay_between_dms_min?: number | null
  delay_between_dms_max?: number | null
  active_hours_start?: string | null
  active_hours_end?: string | null
}

interface AccountRow {
  account_id: string
  platform?: string | null
  daily_limit?: number | string | null
  sends_today?: number | string | null
  status?: string | null
  cooldown_until?: string | null
}

export interface ProcessBatchResult {
  scanned: number
  sent: number
  failed: number
  skipped: number
  retried: number
  errors: Array<{ id: string; error: string }>
  ms: number
}

export interface ProcessBatchOptions {
  supabase: SupabaseClient
  baseUrl: string
  cronSecret: string
  batchSize?: number
  now?: Date
  fetchImpl?: typeof fetch
}

function toInt(v: unknown, fallback: number): number {
  if (v === null || v === undefined) return fallback
  const n = typeof v === "number" ? v : parseInt(String(v))
  return Number.isFinite(n) ? n : fallback
}

function withinActiveHours(settings: SafetySettings | null, now: Date): boolean {
  if (!settings?.active_hours_start || !settings?.active_hours_end) return true
  const [sH, sM] = settings.active_hours_start.split(":").map((x) => parseInt(x))
  const [eH, eM] = settings.active_hours_end.split(":").map((x) => parseInt(x))
  if ([sH, sM, eH, eM].some((x) => Number.isNaN(x))) return true
  const startMin = sH * 60 + sM
  const endMin = eH * 60 + eM
  const nowMin = now.getHours() * 60 + now.getMinutes()
  if (startMin <= endMin) return nowMin >= startMin && nowMin <= endMin
  // Overnight window (e.g. 22:00–02:00)
  return nowMin >= startMin || nowMin <= endMin
}

// Only mark a row as terminally failed for non-retryable conditions. Network
// blips, 5xx, and timeouts go to retry_queue so we don't burn a lead.
function isRetryable(status: number, errMsg: string): boolean {
  if (status === 0) return true // fetch threw (timeout / network)
  if (status >= 500 && status <= 599) return true
  if (status === 429) return true
  const m = (errMsg || "").toLowerCase()
  if (m.includes("timeout") || m.includes("econnreset") || m.includes("network")) return true
  return false
}

export async function processBatch(opts: ProcessBatchOptions): Promise<ProcessBatchResult> {
  const supabase = opts.supabase
  const fetchImpl = opts.fetchImpl || fetch
  const batchSize = opts.batchSize ?? 50
  const now = opts.now ?? new Date()
  const startedAt = Date.now()

  const result: ProcessBatchResult = {
    scanned: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    retried: 0,
    errors: [],
    ms: 0,
  }

  const { data: rows, error: pickErr } = await supabase
    .from("send_queue")
    .select("*")
    .eq("status", QUEUED_STATUS)
    .order("created_at", { ascending: true })
    .limit(batchSize)

  if (pickErr) {
    result.errors.push({ id: "<pick>", error: pickErr.message })
    result.ms = Date.now() - startedAt
    return result
  }

  const queued = (rows || []) as QueueRow[]
  result.scanned = queued.length
  if (queued.length === 0) {
    result.ms = Date.now() - startedAt
    return result
  }

  // Pre-load every involved account + safety setting so we don't N+1 the DB.
  const accountIds = Array.from(new Set(queued.map((r) => r.account_id).filter(Boolean) as string[]))
  const campaignIds = Array.from(new Set(queued.map((r) => r.campaign_id).filter(Boolean) as string[]))

  const [accountsRes, safetyRes] = await Promise.all([
    accountIds.length
      ? supabase.from("accounts").select("account_id, platform, daily_limit, sends_today, status, cooldown_until").in("account_id", accountIds)
      : Promise.resolve({ data: [], error: null } as { data: AccountRow[]; error: null }),
    campaignIds.length
      ? supabase.from("campaign_safety_settings").select("*").in("campaign_id", campaignIds)
      : Promise.resolve({ data: [], error: null } as { data: SafetySettings[]; error: null }),
  ])

  const accounts = new Map<string, AccountRow>()
  for (const a of (accountsRes.data || []) as AccountRow[]) accounts.set(a.account_id, a)

  const safetyByCampaignPlatform = new Map<string, SafetySettings>()
  for (const s of (safetyRes.data || []) as SafetySettings[]) {
    safetyByCampaignPlatform.set(`${s.campaign_id}:${s.platform}`, s)
  }

  // Track in-batch increments so we don't blow past daily caps mid-batch.
  const sendsTodayDelta = new Map<string, number>()

  for (const row of queued) {
    try {
      // Mark the row as in-progress (use updated_at as a soft lock — a second
      // worker invocation would re-pick rows still status=queued; flipping to
      // 'processing' prevents that race for the duration of this iteration).
      await supabase
        .from("send_queue")
        .update({ status: "processing", updated_at: now.toISOString() })
        .eq("id", row.id)
        .eq("status", QUEUED_STATUS) // CAS-like guard

      const messageBody = row.message || row.message_text || ""
      const platform = row.platform || ""
      const username = row.username_or_url || ""

      if (!row.lead_id || !platform || !messageBody) {
        await supabase
          .from("send_queue")
          .update({ status: "failed", processed_at: now.toISOString(), updated_at: now.toISOString() })
          .eq("id", row.id)
        result.failed++
        result.errors.push({ id: row.id, error: "Missing required fields (lead_id/platform/message)" })
        continue
      }

      const account = row.account_id ? accounts.get(row.account_id) : undefined
      const safety = row.campaign_id ? safetyByCampaignPlatform.get(`${row.campaign_id}:${platform}`) : undefined

      // Active-hours check (only if explicitly configured)
      if (!withinActiveHours(safety || null, now)) {
        await supabase
          .from("send_queue")
          .update({ status: QUEUED_STATUS, updated_at: now.toISOString() }) // bounce back to queued for next minute
          .eq("id", row.id)
        result.skipped++
        continue
      }

      // Daily cap = safety.per_account_daily_max → safety.daily_max → account.daily_limit → DEFAULT
      const safetyDaily = toInt(safety?.per_account_daily_max ?? safety?.daily_max ?? null, 0)
      const accountDaily = toInt(account?.daily_limit ?? null, 0)
      const dailyCap = safetyDaily > 0
        ? safetyDaily
        : accountDaily > 0
          ? accountDaily
          : DEFAULT_DAILY_CAP

      const baseSends = toInt(account?.sends_today ?? 0, 0)
      const inBatch = row.account_id ? sendsTodayDelta.get(row.account_id) || 0 : 0
      const effectiveSends = baseSends + inBatch

      if (row.account_id && effectiveSends >= dailyCap) {
        await supabase
          .from("send_queue")
          .update({ status: "skipped", processed_at: now.toISOString(), updated_at: now.toISOString() })
          .eq("id", row.id)
        result.skipped++
        continue
      }

      // Cooldown check
      if (account?.cooldown_until) {
        const until = new Date(account.cooldown_until).getTime()
        if (until > now.getTime()) {
          await supabase
            .from("send_queue")
            .update({ status: "skipped", processed_at: now.toISOString(), updated_at: now.toISOString() })
            .eq("id", row.id)
          result.skipped++
          continue
        }
      }

      // Internal call to /api/automation/send. The send route handles VPS
      // dispatch + manual_sends mirror + lead status update.
      const sendPayload = {
        account_id: row.account_id || undefined,
        lead_id: row.lead_id,
        platform,
        message: messageBody,
        campaign_id: row.campaign_id || undefined,
        template_id: row.template_id || undefined,
        follow_up_of: row.follow_up_of || undefined,
        business_id: row.business_id || "default",
        // Hint to the send route: this came from the worker, not a user click.
        // Avoids creating an outer retry_queue entry on top of ours.
        __from_retry: true,
        __from_worker: true,
      }

      let httpStatus = 0
      let respBody: { success?: boolean; error?: string; queue_id?: string; log_id?: string } = {}
      let networkError = ""

      try {
        const res = await fetchImpl(`${opts.baseUrl}/api/automation/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.cronSecret}`,
            "x-internal-cron": "campaign-worker",
          },
          body: JSON.stringify(sendPayload),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        })
        httpStatus = res.status
        respBody = await res.json().catch(() => ({}))
      } catch (e) {
        networkError = e instanceof Error ? e.message : String(e)
      }

      const ok = httpStatus >= 200 && httpStatus < 300 && !respBody.error
      const errMsg = respBody.error || networkError || (httpStatus ? `HTTP ${httpStatus}` : "fetch failed")

      if (ok) {
        await supabase
          .from("send_queue")
          .update({
            status: "sent",
            processed_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", row.id)

        // Mirror to send_log so the live feed + deadman-check pick this up.
        try {
          await supabase.from("send_log").insert({
            id: `sl_w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            campaign_id: row.campaign_id || "",
            account_id: row.account_id || "",
            lead_id: row.lead_id,
            platform,
            message_text: messageBody,
            template_id: row.template_id || "",
            status: "sent",
            follow_up_of: row.follow_up_of || "",
            sent_at: now.toISOString(),
          })
        } catch (e) {
          console.warn("[campaign-worker] send_log insert failed:", e)
        }

        // Increment sends_today atomically-ish: read-modify-write on the
        // freshest value we have, plus our in-batch delta.
        if (row.account_id) {
          const acct = accounts.get(row.account_id)
          const fresh = toInt(acct?.sends_today ?? baseSends, 0) + (sendsTodayDelta.get(row.account_id) || 0) + 1
          sendsTodayDelta.set(row.account_id, (sendsTodayDelta.get(row.account_id) || 0) + 1)
          await supabase
            .from("accounts")
            .update({
              sends_today: fresh,
              last_used_at: now.toISOString(),
            })
            .eq("account_id", row.account_id)
          if (acct) acct.sends_today = fresh
        }

        // Username field — only stamp lead.last_dm_at if it's a real lead row.
        if (username) { /* no-op — automation/send already updates leads.status */ }

        result.sent++
      } else if (isRetryable(httpStatus, errMsg)) {
        // Send into retry_queue and revert the source row to queued so it
        // doesn't sit in 'processing' forever.
        const delaySec = nextRetryDelay(0)
        try {
          await supabase.from("retry_queue").insert({
            action_type: "send",
            payload: sendPayload,
            max_attempts: 5,
            attempt_count: 0,
            next_retry_at: new Date(now.getTime() + delaySec * 1000).toISOString(),
            account_id: row.account_id || null,
            lead_id: row.lead_id,
            error_message: errMsg.slice(0, 500),
            status: "pending",
          })
        } catch (e) {
          console.warn("[campaign-worker] retry_queue insert failed:", e)
        }
        await supabase
          .from("send_queue")
          .update({
            status: "failed",
            processed_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", row.id)
        result.retried++
        result.failed++
        result.errors.push({ id: row.id, error: errMsg })
      } else {
        // Terminal failure — bad lead, missing URL, account daily limit hit
        // upstream, etc. Don't retry; the next run would just re-fail.
        await supabase
          .from("send_queue")
          .update({
            status: "failed",
            processed_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", row.id)
        try {
          await supabase.from("send_log").insert({
            id: `sl_w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            campaign_id: row.campaign_id || "",
            account_id: row.account_id || "",
            lead_id: row.lead_id,
            platform,
            message_text: messageBody,
            template_id: row.template_id || "",
            status: "failed",
            follow_up_of: row.follow_up_of || "",
            sent_at: now.toISOString(),
          })
        } catch {}
        result.failed++
        result.errors.push({ id: row.id, error: errMsg })
      }
    } catch (e) {
      // Last-resort guard so one rogue row can't kill the whole batch.
      const msg = e instanceof Error ? e.message : String(e)
      try {
        await supabase
          .from("send_queue")
          .update({ status: "failed", processed_at: now.toISOString(), updated_at: now.toISOString() })
          .eq("id", row.id)
      } catch {}
      result.failed++
      result.errors.push({ id: row.id, error: msg })
    }
  }

  result.ms = Date.now() - startedAt
  return result
}
