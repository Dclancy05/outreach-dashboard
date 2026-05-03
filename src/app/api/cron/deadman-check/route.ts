import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "@/lib/telegram"
import * as Sentry from "@sentry/nextjs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Wave 2.3 + 3.1 — extended deadman check.
// - Original: alert when no sends in last N hours.
// - Wave 2.3: ALSO alert when send_queue depth > 1000 OR p95 age > 1h.
// - Wave 3.1: full try/catch + Sentry capture so failures don't go silent.

async function handle(req: NextRequest) {
  try {
    // Read deadman config
    const { data: settingRow } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "deadman_switch")
      .maybeSingle()

    const cfg = settingRow?.value || {}
    const enabled = !!cfg.enabled
    const silenceHours = Number(cfg.silence_hours) || 6
    const since = new Date(Date.now() - silenceHours * 3600_000).toISOString()
    const alerts: string[] = []

    // --- Original silence check ---
    if (enabled) {
      const { count } = await supabase
        .from("send_log")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since)
      if ((count || 0) === 0) {
        alerts.push(`🚨 Dead Man's Switch — no sends in the last ${silenceHours}h.`)
      }
    }

    // --- Wave 2.3: queue-depth check ---
    const { count: queuedCount } = await supabase
      .from("send_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "queued")
    if ((queuedCount || 0) > 1000) {
      alerts.push(`📬 Queue backed up — ${queuedCount} send_queue rows stuck in 'queued'.`)
    }

    const { data: oldest } = await supabase
      .from("send_queue")
      .select("created_at")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (oldest?.created_at) {
      const ageMs = Date.now() - new Date(oldest.created_at).getTime()
      if (ageMs > 3600_000) {
        const ageMin = Math.round(ageMs / 60_000)
        alerts.push(`⏳ Oldest queued send is ${ageMin}min old — worker may be stuck.`)
      }
    }

    if (alerts.length === 0) {
      return NextResponse.json({ ok: true, sends_recent: true, queue_ok: true })
    }

    // Debounce: don't double-fire within the silence window.
    const lastFired = cfg.last_fired_at ? new Date(cfg.last_fired_at).getTime() : 0
    if (Date.now() - lastFired < silenceHours * 3600_000) {
      return NextResponse.json({ skipped: true, reason: "debounced", pending_alerts: alerts })
    }

    const msg = alerts.join("\n")

    try {
      await supabase.from("notifications").insert({
        type: "deadman_fired",
        title: "Outreach OS — system check failed",
        message: msg,
      })
    } catch {}

    if (cfg.alert_method === "telegram" && cfg.telegram_chat_id) {
      await sendTelegram(msg, { chatId: cfg.telegram_chat_id })
    }

    await supabase
      .from("system_settings")
      .update({
        value: { ...cfg, last_fired_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq("key", "deadman_switch")

    return NextResponse.json({ fired: true, alerts, method: cfg.alert_method })
  } catch (err) {
    Sentry.captureException(err, { tags: { context: "cron", cron: "deadman-check" } })
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  if (auth !== `Bearer ${expected}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  return handle(req)
}
