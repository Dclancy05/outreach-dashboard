import { supabase, throwOnError } from "./helpers"
import type { ActionHandler } from "../types"

const handlers: Record<string, ActionHandler> = {
  get_businesses: async (action) => {
    const data = throwOnError(await supabase.from("businesses").select("*").order("created_at"))
    return { success: true, action, data, count: data.length }
  },

  create_business: async (action, body) => {
    const id = String(body.id || `biz_${Date.now()}`)
    const row = { id, name: String(body.name || ""), description: String(body.description || ""), color: String(body.color || "purple"), icon: String(body.icon || ""), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    throwOnError(await supabase.from("businesses").insert(row))
    const defaultSettings = throwOnError(await supabase.from("settings").select("*").eq("business_id", "default")) as { setting_name: string; setting_value: string }[]
    if (defaultSettings.length > 0) {
      const newSettings = defaultSettings.map((s) => ({ setting_name: s.setting_name, setting_value: s.setting_value, business_id: id }))
      await supabase.from("settings").insert(newSettings)
    }
    return { success: true, action, data: row }
  },

  update_business: async (action, body) => {
    const id = String(body.id || "")
    if (!id) return { success: false, error: "Missing business id" }
    const updates: Record<string, string> = { updated_at: new Date().toISOString() }
    for (const [k, v] of Object.entries(body)) { if (k !== "action" && k !== "id") updates[k] = String(v ?? "") }
    await supabase.from("businesses").update(updates).eq("id", id)
    return { success: true, action, message: `Business ${id} updated` }
  },

  delete_business: async (action, body) => {
    const id = String(body.id || "")
    if (!id || id === "default") return { success: false, error: "Cannot delete default business" }
    await supabase.from("leads").delete().eq("business_id", id)
    await supabase.from("messages").delete().eq("business_id", id)
    await supabase.from("sequences").delete().eq("business_id", id)
    await supabase.from("accounts").delete().eq("business_id", id)
    await supabase.from("outreach_log").delete().eq("business_id", id)
    await supabase.from("approaches").delete().eq("business_id", id)
    await supabase.from("smart_lists").delete().eq("business_id", id)
    await supabase.from("ab_tests").delete().eq("business_id", id)
    await supabase.from("activity").delete().eq("business_id", id)
    await supabase.from("settings").delete().eq("business_id", id)
    await supabase.from("businesses").delete().eq("id", id)
    return { success: true, action, message: `Business ${id} deleted` }
  },

  get_business_overview: async (action, body) => {
    const id = String(body.id || "")
    if (!id) return { success: false, error: "Missing business id" }
    const [{ count: leadsCount }, { count: accountsCount }, { count: sequencesCount }] = await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("business_id", id),
      supabase.from("accounts").select("*", { count: "exact", head: true }).eq("business_id", id),
      supabase.from("sequences").select("*", { count: "exact", head: true }).eq("business_id", id),
    ])
    const today = new Date().toISOString().split("T")[0]
    const { count: sendsToday } = await supabase.from("outreach_log").select("*", { count: "exact", head: true }).eq("business_id", id).gte("sent_at", `${today}T00:00:00`)
    return { success: true, action, data: { id, leads_count: leadsCount || 0, accounts_count: accountsCount || 0, sequences_count: sequencesCount || 0, sends_today: sendsToday || 0 } }
  },

  get_agency_analytics: async (action) => {
    const today = new Date().toISOString().split("T")[0]
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]
    const { count: dmsToday } = await supabase.from("va_send_log").select("*", { count: "exact", head: true }).gte("sent_at", `${today}T00:00:00`).eq("status", "sent")
    const { count: dmsWeek } = await supabase.from("va_send_log").select("*", { count: "exact", head: true }).gte("sent_at", `${weekAgo}T00:00:00`).eq("status", "sent")
    const { count: dmsAllTime } = await supabase.from("va_send_log").select("*", { count: "exact", head: true }).eq("status", "sent")
    const { count: responsesAllTime } = await supabase.from("lead_responses").select("*", { count: "exact", head: true })
    const { count: responsesWeek } = await supabase.from("lead_responses").select("*", { count: "exact", head: true }).gte("created_at", `${weekAgo}T00:00:00`)
    const accounts = throwOnError(await supabase.from("outreach_accounts").select("account_id, username, status, daily_limit, sends_today, warmup_day, last_used_at"))
    const accountHealth = {
      active: accounts.filter((a: { status: string }) => a.status === "active").length,
      warming: accounts.filter((a: { status: string }) => a.status === "warming").length,
      at_limit: accounts.filter((a: { status: string; sends_today: number; daily_limit: number }) => a.status === "active" && a.sends_today >= a.daily_limit).length,
      banned: accounts.filter((a: { status: string }) => a.status === "banned").length,
      paused: accounts.filter((a: { status: string }) => a.status === "paused").length,
    }
    const { data: vaLogs } = await supabase.from("va_send_log").select("va_session_id, status").gte("sent_at", `${today}T00:00:00`)
    const vaStats: Record<string, { sent: number; responses: number }> = {}
    for (const log of vaLogs || []) { if (!log.va_session_id) continue; if (!vaStats[log.va_session_id]) vaStats[log.va_session_id] = { sent: 0, responses: 0 }; if (log.status === "sent") vaStats[log.va_session_id].sent++; if (log.status === "response") vaStats[log.va_session_id].responses++ }
    const vaSessions = throwOnError(await supabase.from("va_sessions").select("session_id, va_name, is_active"))
    const topVAs = vaSessions.filter((v: { session_id: string }) => vaStats[v.session_id]).map((v: { session_id: string; va_name: string; is_active: boolean }) => ({ ...v, sent: vaStats[v.session_id]?.sent || 0, responses: vaStats[v.session_id]?.responses || 0 })).sort((a: { sent: number }, b: { sent: number }) => b.sent - a.sent)
    const { count: totalLeads } = await supabase.from("leads").select("*", { count: "exact", head: true })
    const { count: messaged } = await supabase.from("leads").select("*", { count: "exact", head: true }).in("status", ["in_sequence", "sent", "messaged"])
    const { count: responded } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "responded")
    const { count: booked } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "booked")
    const { count: closed } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "closed")
    return {
      success: true, action, data: {
        dms_today: dmsToday || 0, dms_week: dmsWeek || 0, dms_all_time: dmsAllTime || 0,
        responses_all_time: responsesAllTime || 0, responses_week: responsesWeek || 0,
        response_rate: (dmsAllTime || 0) > 0 ? (((responsesAllTime || 0) / (dmsAllTime || 1)) * 100).toFixed(1) : "0",
        account_health: accountHealth, accounts, top_vas: topVAs,
        active_vas: vaSessions.filter((v: { is_active: boolean }) => v.is_active).length,
        funnel: { total_leads: totalLeads || 0, messaged: messaged || 0, responded: responded || 0, booked: booked || 0, closed: closed || 0 },
      }
    }
  },
}

export default handlers
