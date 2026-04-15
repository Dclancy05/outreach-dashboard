import { supabase, throwOnError } from "./helpers"
import type { ActionHandler } from "../types"

const handlers: Record<string, ActionHandler> = {
  get_messages: async (action, body) => {
    const businessId = body.business_id as string | undefined
    const limit = Number(body.limit) || 50
    const offset = Number(body.offset) || 0
    let query = supabase.from("messages").select("*", { count: "exact" })
    if (businessId) query = query.eq("business_id", businessId)
    query = query.range(offset, offset + limit - 1)
    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return { success: true, action, data: data || [], count: count || (data || []).length }
  },

  approve_message: async (action, body) => {
    const msgId = String(body.message_id || ""); const status = String(body.status || "approved")
    if (!msgId) return { success: false, error: "Missing message_id" }
    await supabase.from("messages").update({ status }).eq("message_id", msgId)
    return { success: true, action, message: `Message ${msgId} ${status}` }
  },

  delete_messages: async (action, body) => {
    const ids = body.message_ids as string[]
    if (!ids?.length) return { success: false, error: "No message_ids provided" }
    await supabase.from("messages").delete().in("message_id", ids)
    return { success: true, action, message: `Deleted ${ids.length} messages` }
  },

  update_message: async (action, body) => {
    const mid = String(body.message_id || "")
    if (!mid) return { success: false, error: "Missing message_id" }
    const updates: Record<string, string> = {}
    for (const [k, v] of Object.entries(body)) { if (k !== "action" && k !== "message_id") updates[k] = String(v ?? "") }
    await supabase.from("messages").update(updates).eq("message_id", mid)
    return { success: true, action, message: `Message ${mid} updated` }
  },

  bulk_approve_messages: async (action, body) => {
    const ids = body.message_ids as string[]; const status = String(body.status || "approved")
    if (!ids?.length) return { success: false, error: "No message_ids provided" }
    await supabase.from("messages").update({ status }).in("message_id", ids)
    return { success: true, action, message: `${status} ${ids.length} messages` }
  },

  get_messages_comparison: async (action, body) => {
    const compLeadId = String(body.lead_id || "")
    if (!compLeadId) return { success: false, error: "Missing lead_id" }
    const leadMsgs = throwOnError(await supabase.from("messages").select("*").eq("lead_id", compLeadId))
    const byApproach: Record<string, Record<string, string>[]> = {}
    for (const msg of leadMsgs) { const aid = msg.approach_id || "unknown"; if (!byApproach[aid]) byApproach[aid] = []; byApproach[aid].push(msg) }
    return { success: true, action, data: { lead_id: compLeadId, approaches: byApproach } }
  },

  regenerate_message: async (action, body) => {
    const msgId = String(body.message_id || "")
    if (!msgId) return { success: false, error: "Missing message_id" }
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"
      const res = await fetch(`${baseUrl}/api/generate-messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "regenerate", message_id: msgId }) })
      const result = await res.json()
      if (!result.success) return { success: false, error: result.error || "Regeneration failed" }
      return { success: true, action, data: result, message: `Message regenerated: ${msgId}` }
    } catch { return { success: false, error: "Failed to reach generation API. Ensure Claude Bridge is running." } }
  },

  mark_message_sent: async (action, body) => {
    const messageId = String(body.message_id || "")
    if (!messageId) return { success: false, error: "Missing message_id" }
    const { error } = await supabase.from("messages").update({ status: "sent", sent_at: new Date().toISOString() }).eq("message_id", messageId)
    if (error) return { success: false, error: error.message }
    return { success: true, action, message: `Message ${messageId} marked as sent` }
  },

  schedule_messages: async (action, body) => {
    const messageIds = body.message_ids as string[]; const startDate = body.start_date as string | undefined
    if (!messageIds?.length) return { success: false, error: "No message_ids provided" }
    const { data: msgs, error: fetchError } = await supabase.from("messages").select("*").in("message_id", messageIds)
    if (fetchError) return { success: false, error: fetchError.message }
    const baseDate = startDate ? new Date(startDate) : new Date(); let scheduled = 0
    for (const msg of msgs || []) {
      const stepNum = parseInt(msg.step_number || "1"); const scheduledDate = new Date(baseDate)
      scheduledDate.setDate(scheduledDate.getDate() + (stepNum - 1))
      const { error: updateError } = await supabase.from("messages").update({ scheduled_for: scheduledDate.toISOString() }).eq("message_id", msg.message_id)
      if (!updateError) scheduled++
    }
    return { success: true, action, message: `Scheduled ${scheduled} messages` }
  },

  get_scheduled_messages: async (action, body) => {
    const businessId = body.business_id as string | undefined
    const startDate = body.start_date as string; const endDate = body.end_date as string
    let query = supabase.from("messages").select(`message_id, lead_id, platform, action, status, scheduled_for, body, leads!inner(name)`).not("scheduled_for", "is", null).gte("scheduled_for", startDate).lte("scheduled_for", endDate).order("scheduled_for", { ascending: true })
    if (businessId) query = query.eq("business_id", businessId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const formatted = (data || []).map((msg: any) => ({ ...msg, lead_name: msg.leads?.name || "Unknown Lead", leads: undefined }))
    return { success: true, action, data: formatted, count: formatted.length }
  },
}

export default handlers
