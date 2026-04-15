import { supabase, throwOnError } from "./helpers"
import type { ActionHandler } from "../types"

const handlers: Record<string, ActionHandler> = {
  get_va_sessions: async (action) => {
    const data = throwOnError(await supabase.from("va_sessions").select("*").order("created_at", { ascending: true }))
    return { success: true, action, data, count: data.length }
  },

  create_va_session: async (action, body) => {
    const row = { va_name: String(body.va_name || ""), pin: String(body.pin || ""), is_active: true }
    const data = throwOnError(await supabase.from("va_sessions").insert(row).select().single() as any)
    return { success: true, action, data }
  },

  update_va_session: async (action, body) => {
    const sessionId = String(body.session_id || "")
    if (!sessionId) return { success: false, error: "Missing session_id" }
    const updates: Record<string, unknown> = {}
    if (body.va_name !== undefined) updates.va_name = body.va_name
    if (body.pin !== undefined) updates.pin = body.pin
    if (body.is_active !== undefined) updates.is_active = body.is_active
    await supabase.from("va_sessions").update(updates).eq("session_id", sessionId)
    return { success: true, action, message: "VA session updated" }
  },

  delete_va_session: async (action, body) => {
    const sessionId = String(body.session_id || "")
    if (!sessionId) return { success: false, error: "Missing session_id" }
    await supabase.from("va_sessions").delete().eq("session_id", sessionId)
    return { success: true, action, message: "VA session deleted" }
  },

  va_login: async (action, body) => {
    const pin = String(body.pin || "")
    if (!pin) return { success: false, error: "Missing PIN" }
    const { data, error } = await supabase.from("va_sessions").select("*").eq("pin", pin).eq("is_active", true).single()
    if (error || !data) return { success: false, error: "Invalid PIN" }
    return { success: true, action, data }
  },

  get_va_queue: async (action, body) => {
    const limit = Number(body.limit) || 50
    const excludeIds = (body.exclude_ids as string[]) || []
    const today = new Date().toISOString().split("T")[0]
    const { data: sentToday } = await supabase.from("va_send_log").select("lead_id").gte("sent_at", `${today}T00:00:00`).in("status", ["sent", "skipped"])
    const sentLeadIds = (sentToday || []).map((s: { lead_id: string }) => s.lead_id)
    const allExclude = [...new Set([...sentLeadIds, ...excludeIds])]
    let query = supabase.from("leads").select("lead_id, name, instagram_url, city, state, business_type, status, notes, _raw_scrape_data, total_score, ranking_tier").not("instagram_url", "is", null).neq("instagram_url", "").in("status", ["in_sequence", "messages_ready"]).order("total_score", { ascending: true, nullsFirst: false }).order("lead_id", { ascending: true }).limit(limit)
    if (allExclude.length > 0) query = query.not("lead_id", "in", `(${allExclude.join(",")})`)
    const data = throwOnError(await query)
    if (data.length > 0) {
      const leadIds = data.map((l: { lead_id: string }) => l.lead_id)
      const { data: prevSends } = await supabase.from("va_send_log").select("lead_id, account_id").in("lead_id", leadIds).eq("status", "sent").order("sent_at", { ascending: false })
      const lastAccountMap: Record<string, string> = {}
      for (const s of (prevSends || [])) { if (!lastAccountMap[s.lead_id]) lastAccountMap[s.lead_id] = s.account_id }
      for (const lead of data) { (lead as Record<string, unknown>).preferred_account_id = lastAccountMap[(lead as Record<string, string>).lead_id] || null }
    }
    return { success: true, action, data, count: data.length }
  },

  log_va_send: async (action, body) => {
    const row = { lead_id: String(body.lead_id || ""), account_id: String(body.account_id || ""), va_session_id: String(body.va_session_id || ""), status: String(body.status || "sent") }
    throwOnError(await supabase.from("va_send_log").insert(row))
    if (row.account_id && row.status === "sent") {
      const { data: acct } = await supabase.from("outreach_accounts").select("sends_today, username").eq("account_id", row.account_id).single()
      await supabase.from("outreach_accounts").update({ sends_today: (acct?.sends_today || 0) + 1, last_used_at: new Date().toISOString() }).eq("account_id", row.account_id)
      try { await supabase.from("lead_activity").insert({ lead_id: row.lead_id, activity_type: "message_sent", content: `DM sent via Instagram`, account_used: acct?.username || row.account_id, va_name: String(body.va_name || ""), business_id: (body.business_id as string) || "default" }) } catch { /* ignore */ }
    }
    return { success: true, action, message: "Send logged" }
  },

  report_warning: async (action, body) => {
    const accountId = String(body.account_id || "")
    if (!accountId) return { success: false, error: "Missing account_id" }
    await supabase.from("outreach_accounts").update({ status: "paused" }).eq("account_id", accountId)
    if (body.lead_id) { throwOnError(await supabase.from("va_send_log").insert({ lead_id: String(body.lead_id), account_id: accountId, va_session_id: String(body.va_session_id || ""), status: "warning" })) }
    return { success: true, action, message: `Account ${accountId} paused (warning)` }
  },

  report_logged_out: async (action, body) => {
    const accountId = String(body.account_id || "")
    if (!accountId) return { success: false, error: "Missing account_id" }
    await supabase.from("outreach_accounts").update({ status: "logged_out" }).eq("account_id", accountId)
    if (body.lead_id) { throwOnError(await supabase.from("va_send_log").insert({ lead_id: String(body.lead_id), account_id: accountId, va_session_id: String(body.va_session_id || ""), status: "logged_out" })) }
    return { success: true, action, message: `Account ${accountId} marked logged out` }
  },

  report_response: async (action, body) => {
    const row = { lead_id: String(body.lead_id || ""), account_id: String(body.account_id || ""), reported_by_va: String(body.reported_by_va || ""), notes: String(body.notes || "") }
    throwOnError(await supabase.from("lead_responses").insert(row))
    if (body.lead_id) {
      throwOnError(await supabase.from("va_send_log").insert({ lead_id: row.lead_id, account_id: row.account_id, va_session_id: String(body.va_session_id || ""), status: "response" }))
      try { await supabase.from("lead_activity").insert({ lead_id: row.lead_id, activity_type: "response_received", content: `Response reported: ${row.notes || "No details"}`, account_used: row.account_id, va_name: row.reported_by_va, business_id: "default" }) } catch { /* ignore */ }
      if (body.category === "Interested") { await supabase.from("leads").update({ status: "responded" }).eq("lead_id", row.lead_id) }
    }
    return { success: true, action, message: "Response reported" }
  },

  get_va_stats: async (action) => {
    const today = new Date().toISOString().split("T")[0]
    const { data: logs } = await supabase.from("va_send_log").select("account_id, status").gte("sent_at", `${today}T00:00:00`)
    const byAccount: Record<string, number> = {}; let totalSent = 0
    for (const log of logs || []) { if (log.status === "sent") { totalSent++; byAccount[log.account_id] = (byAccount[log.account_id] || 0) + 1 } }
    const accounts = throwOnError(await supabase.from("outreach_accounts").select("account_id, username, status, daily_limit, sends_today"))
    const totalLimit = accounts.reduce((s: number, a: { daily_limit: number }) => s + (a.daily_limit || 0), 0)
    return { success: true, action, data: { total_sent: totalSent, total_limit: totalLimit, by_account: byAccount, accounts } }
  },

  reset_va_daily_sends: async (action) => {
    await supabase.from("outreach_accounts").update({ sends_today: 0 }).neq("sends_today", 0)
    const accounts = throwOnError(await supabase.from("outreach_accounts").select("account_id, warmup_start_date"))
    const today = new Date()
    for (const acct of accounts) {
      if (acct.warmup_start_date) {
        const start = new Date(acct.warmup_start_date)
        const dayNum = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1
        let limit = 30; if (dayNum <= 7) limit = 5; else if (dayNum <= 14) limit = 10; else if (dayNum <= 21) limit = 20
        await supabase.from("outreach_accounts").update({ warmup_day: dayNum, daily_limit: limit }).eq("account_id", acct.account_id)
      }
    }
    return { success: true, action, message: "Daily sends reset and warmup updated" }
  },

  log_va_problem: async (action, body) => {
    const leadId = String(body.lead_id || ""); const problem = String(body.problem || "")
    const accountId = String(body.account_id || ""); const vaSessionId = String(body.va_session_id || "")
    if (!leadId || !problem) return { success: false, error: "Missing lead_id or problem" }
    await supabase.from("va_send_log").insert({ lead_id: leadId, account_id: accountId, va_session_id: vaSessionId, status: "problem" })
    await supabase.from("lead_activity").insert({ lead_id: leadId, activity_type: "problem_reported", content: problem, account_used: accountId, va_name: String(body.va_name || ""), business_id: "default" })
    const statusMap: Record<string, string> = { "Business closed": "paused", "Profile not found": "paused", "Already messaged": "skipped", "Account flagged": "paused" }
    if (statusMap[problem]) await supabase.from("leads").update({ status: statusMap[problem] }).eq("lead_id", leadId)
    return { success: true, action, message: "Problem logged" }
  },

  log_va_response_category: async (action, body) => {
    const leadId = String(body.lead_id || ""); const category = String(body.category || "")
    const accountId = String(body.account_id || ""); const notes = String(body.notes || "")
    if (!leadId || !category) return { success: false, error: "Missing lead_id or category" }
    await supabase.from("lead_responses").insert({ lead_id: leadId, account_id: accountId, reported_by_va: String(body.va_name || ""), notes: `[${category}] ${notes}`.trim() })
    await supabase.from("va_send_log").insert({ lead_id: leadId, account_id: accountId, va_session_id: String(body.va_session_id || ""), status: "response" })
    await supabase.from("lead_activity").insert({ lead_id: leadId, activity_type: "response_received", content: `Response: ${category}${notes ? ` - ${notes}` : ""}`, account_used: accountId, va_name: String(body.va_name || ""), business_id: "default" })
    if (category === "Interested") await supabase.from("leads").update({ status: "responded" }).eq("lead_id", leadId)
    else if (category === "Not Interested") await supabase.from("leads").update({ status: "not_interested" }).eq("lead_id", leadId)
    return { success: true, action, message: "Response categorized" }
  },

  get_queue_state: async (action, body) => {
    const vaId = String(body.va_id || "")
    if (!vaId) return { success: false, error: "Missing va_id" }
    const { data, error } = await supabase.from("va_queue_state").select("*").eq("va_id", vaId).single()
    if (error || !data) return { success: true, action, data: null }
    return { success: true, action, data }
  },

  save_queue_state: async (action, body) => {
    const vaId = String(body.va_id || "")
    if (!vaId) return { success: false, error: "Missing va_id" }
    const row = {
      va_id: vaId, queue_type: String(body.queue_type || "content"),
      current_step: String(body.current_step || "content"),
      current_account_idx: Number(body.current_account_idx) || 0,
      current_lead_idx: Number(body.current_lead_idx) || 0,
      updated_at: new Date().toISOString(),
    }
    await supabase.from("va_queue_state").upsert(row, { onConflict: "va_id" })
    return { success: true, action, message: "Queue state saved" }
  },

  log_content_post: async (action, body) => {
    const row = {
      account_id: String(body.account_id || ""), va_id: String(body.va_id || ""),
      content_id: String(body.content_id || ""), status: String(body.status || "posted"),
    }
    throwOnError(await supabase.from("content_post_log").insert(row))
    return { success: true, action, message: "Content post logged" }
  },

  get_today_content_posts: async (action, body) => {
    const vaId = String(body.va_id || "")
    const today = new Date().toISOString().split("T")[0]
    const { data } = await supabase.from("content_post_log").select("*").eq("va_id", vaId).gte("posted_at", `${today}T00:00:00`)
    return { success: true, action, data: data || [] }
  },

  log_dm_send: async (action, body) => {
    const row = {
      lead_id: String(body.lead_id || ""), account_id: String(body.account_id || ""),
      va_id: String(body.va_id || ""), message_sent: String(body.message_sent || ""),
      status: String(body.status || "sent"), notes: body.notes ? String(body.notes) : null,
    }
    throwOnError(await supabase.from("dm_send_log").insert(row))
    if (row.status === "sent" && row.account_id) {
      const { data: acct } = await supabase.from("outreach_accounts").select("sends_today").eq("account_id", row.account_id).single()
      await supabase.from("outreach_accounts").update({ sends_today: (acct?.sends_today || 0) + 1, last_used_at: new Date().toISOString() }).eq("account_id", row.account_id)
    }
    if (row.status === "sent") {
      await supabase.from("account_lead_mapping").upsert({ lead_id: row.lead_id, account_id: row.account_id }, { onConflict: "lead_id", ignoreDuplicates: true } as any)
    }
    return { success: true, action, message: "DM send logged" }
  },

  get_today_dm_stats: async (action, body) => {
    const vaId = String(body.va_id || "")
    const today = new Date().toISOString().split("T")[0]
    const { data } = await supabase.from("dm_send_log").select("status").eq("va_id", vaId).gte("sent_at", `${today}T00:00:00`)
    const logs = data || []
    const sent = logs.filter((l: { status: string }) => l.status === "sent").length
    return { success: true, action, data: { total: logs.length, sent, failed: logs.length - sent } }
  },

  get_account_for_lead: async (action, body) => {
    const leadId = String(body.lead_id || "")
    const { data } = await supabase.from("account_lead_mapping").select("account_id").eq("lead_id", leadId).single()
    return { success: true, action, data: data?.account_id || null }
  },

  set_account_for_lead: async (action, body) => {
    await supabase.from("account_lead_mapping").upsert({ lead_id: String(body.lead_id), account_id: String(body.account_id) }, { onConflict: "lead_id" } as any)
    return { success: true, action, message: "Mapping saved" }
  },

  get_dm_queue_leads: async (action, body) => {
    const limit = Number(body.limit) || 200
    const today = new Date().toISOString().split("T")[0]
    const { data: sentToday } = await supabase.from("dm_send_log").select("lead_id").gte("sent_at", `${today}T00:00:00`).in("status", ["sent", "user_not_found"])
    const sentIds = (sentToday || []).map((s: { lead_id: string }) => s.lead_id)
    let query = supabase.from("leads").select("lead_id, name, instagram_url, city, state, business_type, status, total_score, ranking_tier").not("instagram_url", "is", null).neq("instagram_url", "").in("status", ["in_sequence", "messages_ready"]).order("total_score", { ascending: true }).limit(limit)
    if (sentIds.length > 0) query = query.not("lead_id", "in", `(${sentIds.join(",")})`)
    const data = throwOnError(await query)
    if (data.length > 0) {
      const leadIds = data.map((l: { lead_id: string }) => l.lead_id)
      const { data: msgs } = await supabase.from("messages").select("lead_id, message_body").in("lead_id", leadIds).eq("status", "approved")
      const msgMap: Record<string, string> = {}
      for (const m of (msgs || [])) { if (!msgMap[m.lead_id]) msgMap[m.lead_id] = m.message_body }
      const { data: mappings } = await supabase.from("account_lead_mapping").select("lead_id, account_id").in("lead_id", leadIds)
      const acctMap: Record<string, string> = {}
      for (const m of (mappings || [])) { acctMap[m.lead_id] = m.account_id }
      for (const lead of data) {
        const l = lead as Record<string, unknown>
        l.ai_message = msgMap[l.lead_id as string] || null
        l.preferred_account_id = acctMap[l.lead_id as string] || null
      }
    }
    const withMessages = data.filter((l: Record<string, unknown>) => l.ai_message)
    return { success: true, action, data: withMessages, count: withMessages.length }
  },

  get_all_va_queue_status: async (action) => {
    const today = new Date().toISOString().split("T")[0]
    const { data: sessions } = await supabase.from("va_sessions").select("*").eq("is_active", true)
    const { data: states } = await supabase.from("va_queue_state").select("*")
    const { data: dmLogs } = await supabase.from("dm_send_log").select("va_id, status").gte("sent_at", `${today}T00:00:00`)
    const { data: contentLogs } = await supabase.from("content_post_log").select("va_id, status").gte("posted_at", `${today}T00:00:00`)
    const stateMap: Record<string, Record<string, unknown>> = {}
    for (const s of (states || [])) stateMap[s.va_id] = s
    const dmCountMap: Record<string, number> = {}
    for (const l of (dmLogs || [])) { if (l.status === "sent") dmCountMap[l.va_id] = (dmCountMap[l.va_id] || 0) + 1 }
    const contentCountMap: Record<string, number> = {}
    for (const l of (contentLogs || [])) { if (l.status === "posted") contentCountMap[l.va_id] = (contentCountMap[l.va_id] || 0) + 1 }
    const result = (sessions || []).map((s: Record<string, unknown>) => {
      const state = stateMap[s.session_id as string] || {}
      return {
        va_id: s.session_id, va_name: s.va_name, queue_type: state.queue_type || "content",
        current_step: state.current_step || "content", current_account_idx: state.current_account_idx || 0,
        current_lead_idx: state.current_lead_idx || 0, dms_today: dmCountMap[s.session_id as string] || 0,
        content_today: contentCountMap[s.session_id as string] || 0,
      }
    })
    return { success: true, action, data: result }
  },

  get_admin_dm_log: async (action, body) => {
    const limit = Number(body.limit) || 100
    const { data } = await supabase.from("dm_send_log").select("*").order("sent_at", { ascending: false }).limit(limit)
    return { success: true, action, data: data || [] }
  },
}

export default handlers
