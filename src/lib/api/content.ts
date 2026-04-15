import { supabase, throwOnError } from "./helpers"
import type { ActionHandler } from "../types"

const handlers: Record<string, ActionHandler> = {
  get_content_personas: async (action) => {
    const data = throwOnError(await supabase.from("content_personas").select("*").order("created_at", { ascending: false }))
    return { success: true, action, data, count: data.length }
  },

  create_content_persona: async (action, body) => {
    const row = {
      name: String(body.name || ""), description: String(body.description || ""),
      niche: String(body.niche || ""), tone: String(body.tone || ""),
      content_types: String(body.content_types || "reels,images"),
      hashtag_groups: String(body.hashtag_groups || ""), posting_frequency: Number(body.posting_frequency) || 5,
    }
    const data = throwOnError(await supabase.from("content_personas").insert(row).select().single())
    return { success: true, action, data }
  },

  update_content_persona: async (action, body) => {
    const pid = String(body.persona_id || "")
    if (!pid) return { success: false, error: "Missing persona_id" }
    const updates: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) { if (k !== "action" && k !== "persona_id") updates[k] = v }
    await supabase.from("content_personas").update(updates).eq("persona_id", pid)
    return { success: true, action, message: `Persona ${pid} updated` }
  },

  delete_content_persona: async (action, body) => {
    const pid = String(body.persona_id || "")
    if (!pid) return { success: false, error: "Missing persona_id" }
    await supabase.from("content_personas").delete().eq("persona_id", pid)
    return { success: true, action, message: `Persona ${pid} deleted` }
  },

  get_content_calendar: async (action, body) => {
    const accountId = body.account_id as string | undefined
    const status = body.post_status as string | undefined
    const from = body.from_date as string | undefined; const to = body.to_date as string | undefined
    let query = supabase.from("content_calendar").select("*").order("scheduled_for", { ascending: true })
    if (accountId) query = query.eq("account_id", accountId)
    if (status && status !== "all") query = query.eq("post_status", status)
    if (from) query = query.gte("scheduled_for", from)
    if (to) query = query.lte("scheduled_for", to)
    const data = throwOnError(await query)
    return { success: true, action, data, count: data.length }
  },

  create_content_item: async (action, body) => {
    const row = {
      account_id: String(body.account_id || ""), persona_id: body.persona_id ? String(body.persona_id) : null,
      title: String(body.title || ""), caption: String(body.caption || ""), hashtags: String(body.hashtags || ""),
      content_type: String(body.content_type || "image"), media_url: String(body.media_url || ""),
      media_status: String(body.media_status || "pending"), post_status: String(body.post_status || "draft"),
      scheduled_for: body.scheduled_for || null, ai_prompt: String(body.ai_prompt || ""),
    }
    const data = throwOnError(await supabase.from("content_calendar").insert(row).select().single())
    return { success: true, action, data }
  },

  update_content_item: async (action, body) => {
    const cid = String(body.content_id || "")
    if (!cid) return { success: false, error: "Missing content_id" }
    const updates: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) { if (k !== "action" && k !== "content_id") updates[k] = v }
    await supabase.from("content_calendar").update(updates).eq("content_id", cid)
    return { success: true, action, message: `Content ${cid} updated` }
  },

  delete_content_item: async (action, body) => {
    const cid = String(body.content_id || "")
    if (!cid) return { success: false, error: "Missing content_id" }
    await supabase.from("content_calendar").delete().eq("content_id", cid)
    return { success: true, action, message: `Content ${cid} deleted` }
  },

  bulk_create_content: async (action, body) => {
    const items = body.items as Record<string, unknown>[]
    if (!items?.length) return { success: false, error: "No items provided" }
    const rows = items.map(item => ({
      account_id: String(item.account_id || ""), persona_id: item.persona_id ? String(item.persona_id) : null,
      title: String(item.title || ""), caption: String(item.caption || ""), hashtags: String(item.hashtags || ""),
      content_type: String(item.content_type || "image"), media_status: "pending", post_status: "draft",
      scheduled_for: item.scheduled_for || null, ai_prompt: String(item.ai_prompt || ""),
    }))
    const data = throwOnError(await supabase.from("content_calendar").insert(rows).select())
    return { success: true, action, data, count: data.length }
  },

  get_content_templates: async (action, body) => {
    const personaId = body.persona_id as string | undefined
    let query = supabase.from("content_templates").select("*").order("created_at", { ascending: false })
    if (personaId) query = query.eq("persona_id", personaId)
    const data = throwOnError(await query)
    return { success: true, action, data, count: data.length }
  },

  create_content_template: async (action, body) => {
    const row = {
      persona_id: body.persona_id ? String(body.persona_id) : null, name: String(body.name || ""),
      content_type: String(body.content_type || "image"), prompt_template: String(body.prompt_template || ""),
      caption_template: String(body.caption_template || ""),
    }
    const data = throwOnError(await supabase.from("content_templates").insert(row).select().single())
    return { success: true, action, data }
  },

  update_content_template: async (action, body) => {
    const tid = String(body.template_id || "")
    if (!tid) return { success: false, error: "Missing template_id" }
    const updates: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) { if (k !== "action" && k !== "template_id") updates[k] = v }
    await supabase.from("content_templates").update(updates).eq("template_id", tid)
    return { success: true, action, message: `Template ${tid} updated` }
  },

  delete_content_template: async (action, body) => {
    const tid = String(body.template_id || "")
    if (!tid) return { success: false, error: "Missing template_id" }
    await supabase.from("content_templates").delete().eq("template_id", tid)
    return { success: true, action, message: `Template ${tid} deleted` }
  },

  get_content_stats: async (action) => {
    const [
      { count: totalContent }, { count: draftCount }, { count: scheduledCount },
      { count: postedCount }, { count: pendingMedia },
    ] = await Promise.all([
      supabase.from("content_calendar").select("*", { count: "exact", head: true }),
      supabase.from("content_calendar").select("*", { count: "exact", head: true }).eq("post_status", "draft"),
      supabase.from("content_calendar").select("*", { count: "exact", head: true }).eq("post_status", "scheduled"),
      supabase.from("content_calendar").select("*", { count: "exact", head: true }).eq("post_status", "posted"),
      supabase.from("content_calendar").select("*", { count: "exact", head: true }).eq("media_status", "pending"),
    ])
    return { success: true, action, data: { total: totalContent || 0, drafts: draftCount || 0, scheduled: scheduledCount || 0, posted: postedCount || 0, pending_media: pendingMedia || 0 } }
  },
}

export default handlers
