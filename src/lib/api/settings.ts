import { supabase, throwOnError } from "./helpers"
import type { ActionHandler } from "../types"

const handlers: Record<string, ActionHandler> = {
  get_settings: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let query = supabase.from("settings").select("*")
    if (businessId) query = query.eq("business_id", businessId)
    const rows = throwOnError(await query)
    const settings: Record<string, string> = {}
    rows.forEach((r: { setting_name: string; setting_value: string }) => { if (r.setting_name) settings[r.setting_name] = r.setting_value })
    return { success: true, action, data: settings, count: Object.keys(settings).length }
  },

  get_settings_map: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let query = supabase.from("settings").select("*")
    if (businessId) query = query.eq("business_id", businessId)
    const rows = throwOnError(await query)
    const settings: Record<string, string> = {}
    rows.forEach((r: { setting_name: string; setting_value: string }) => { if (r.setting_name) settings[r.setting_name] = r.setting_value })
    return { success: true, action, data: settings, count: Object.keys(settings).length }
  },

  update_settings: async (action, body) => {
    const updates = body.settings as Record<string, string>
    const businessId = (body.business_id as string) || "default"
    if (!updates) return { success: false, error: "Missing settings" }
    for (const [key, val] of Object.entries(updates)) {
      await supabase.from("settings").upsert({ setting_name: key, setting_value: val, business_id: businessId })
    }
    return { success: true, action, message: "Settings updated" }
  },

  get_outreach_settings: async (action, body) => {
    const businessId = (body.business_id as string) || "default"
    const { data, error } = await supabase.from("outreach_settings").select("*").eq("business_id", businessId)
    if (error) {
      // Fallback to settings table
      const settingsQuery = supabase.from("settings").select("*")
      if (businessId) settingsQuery.eq("business_id", businessId)
      const rows = throwOnError(await settingsQuery)
      const settings: Record<string, string> = {}
      rows.forEach((r: { setting_name: string; setting_value: string }) => { if (r.setting_name) settings[r.setting_name] = r.setting_value })
      return { success: true, action, data: settings, count: Object.keys(settings).length, source: "settings" }
    }
    const settings: Record<string, string> = {}
    ;(data || []).forEach((r: { setting_name: string; setting_value: string }) => { if (r.setting_name) settings[r.setting_name] = r.setting_value })
    return { success: true, action, data: settings, count: Object.keys(settings).length, source: "outreach_settings" }
  },

  update_outreach_settings: async (action, body) => {
    const updates = body.settings as Record<string, string>
    const businessId = (body.business_id as string) || "default"
    if (!updates) return { success: false, error: "Missing settings" }
    let useTable = "outreach_settings"
    for (const [key, val] of Object.entries(updates)) {
      const { error } = await supabase.from(useTable).upsert({ setting_name: key, setting_value: val, business_id: businessId }, { onConflict: "setting_name,business_id" })
      if (error) {
        useTable = "settings"
        await supabase.from("settings").upsert({ setting_name: key, setting_value: val, business_id: businessId }, { onConflict: "setting_name,business_id" })
      }
    }
    return { success: true, action, message: `Outreach settings updated (${useTable})` }
  },

  get_proxy_settings: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let query = supabase.from("settings").select("*")
    if (businessId) query = query.eq("business_id", businessId)
    const rows = throwOnError(await query)
    const settings: Record<string, string> = {}
    rows.forEach((r: { setting_name: string; setting_value: string }) => { if (r.setting_name && r.setting_name.startsWith("proxy_")) settings[r.setting_name] = r.setting_value })
    return { success: true, action, data: { proxy_enabled: settings.proxy_enabled || "FALSE", proxy_provider: settings.proxy_provider || "custom", proxy_list: settings.proxy_list || "" } }
  },

  update_proxy_settings: async (action, body) => {
    const businessId = (body.business_id as string) || "default"
    const proxySettings = body.settings as Record<string, string>
    if (!proxySettings) return { success: false, error: "Missing settings" }
    for (const [key, val] of Object.entries(proxySettings)) {
      if (key.startsWith("proxy_")) await supabase.from("settings").upsert({ setting_name: key, setting_value: val, business_id: businessId })
    }
    return { success: true, action, message: "Proxy settings updated" }
  },

  update_warmup_settings: async (action, body) => {
    const businessId = (body.business_id as string) || "default"
    const schedule = body.warmup_schedule as string | undefined
    if (schedule) await supabase.from("settings").upsert({ setting_name: "warmup_schedule", setting_value: schedule, business_id: businessId })
    return { success: true, action, message: "Warmup settings updated" }
  },

  get_build_progress: async (action) => {
    const { data, error } = await supabase.from("build_progress").select("*").order("phase_order", { ascending: true })
    if (error) return { success: true, action, data: null, source: "default" }
    return { success: true, action, data, source: "supabase" }
  },

  get_system_status: async (action) => {
    let status = null; let alerts: unknown[] = []
    if (typeof window === "undefined") {
      try {
        const fs = await import("fs"); const path = await import("path")
        const statusPath = path.join(process.cwd(), "..", "..", "..", "orchestrator", "system-status.json")
        const altPath = "/home/clawd/.openclaw/workspace/orchestrator/system-status.json"
        const alertsPath = "/home/clawd/.openclaw/workspace/orchestrator/alerts-queue.json"
        for (const p of [statusPath, altPath]) { try { if (fs.existsSync(p)) { status = JSON.parse(fs.readFileSync(p, "utf-8")); break } } catch { /* skip */ } }
        try { if (fs.existsSync(alertsPath)) { alerts = JSON.parse(fs.readFileSync(alertsPath, "utf-8")) } } catch { /* skip */ }
      } catch { /* fs not available */ }
    }
    return { success: true, action, data: { status: status || { lastMonitorRun: null, lastSenderRun: null, activeAlerts: 0, nextScheduledRuns: {} }, alerts: Array.isArray(alerts) ? alerts.slice(-20) : [] } }
  },
}

export default handlers
