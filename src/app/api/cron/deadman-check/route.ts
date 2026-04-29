import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "@/lib/telegram"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  if (!expected) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  if (auth !== `Bearer ${expected}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  // Read deadman config
  const { data: settingRow } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "deadman_switch")
    .maybeSingle()

  const cfg = settingRow?.value || {}
  if (!cfg.enabled) {
    return NextResponse.json({ skipped: true, reason: "disabled" })
  }

  const silenceHours = Number(cfg.silence_hours) || 6
  const since = new Date(Date.now() - silenceHours * 3600_000).toISOString()

  // Check recent sends across send_log (and send_queue just in case)
  const { count } = await supabase
    .from("send_log")
    .select("*", { count: "exact", head: true })
    .gte("created_at", since)

  if ((count || 0) > 0) {
    return NextResponse.json({ ok: true, recent_sends: count })
  }

  // Debounce: do not fire more than once per silence window
  const lastFired = cfg.last_fired_at ? new Date(cfg.last_fired_at).getTime() : 0
  if (Date.now() - lastFired < silenceHours * 3600_000) {
    return NextResponse.json({ skipped: true, reason: "debounced" })
  }

  // Fire alert
  const msg = `🚨 Dead Man's Switch triggered — no sends in the last ${silenceHours}h. Check outreach-dashboard.`

  await supabase.from("notifications").insert({
    type: "deadman_fired",
    title: "No outbound sends detected",
    message: msg,
  })

  if (cfg.alert_method === "telegram" && cfg.telegram_chat_id) {
    await sendTelegram(msg, { chatId: cfg.telegram_chat_id })
  }

  // Update last_fired_at
  await supabase
    .from("system_settings")
    .update({
      value: { ...cfg, last_fired_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq("key", "deadman_switch")

  return NextResponse.json({ fired: true, silence_hours: silenceHours, method: cfg.alert_method })
}
