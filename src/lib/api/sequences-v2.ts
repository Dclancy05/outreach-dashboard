import { supabase, throwOnError } from "./helpers"
import type { ActionHandler } from "../types"

const handlers: Record<string, ActionHandler> = {
  // ── GET SEQUENCES V2 ──────────────────────────────────────────────
  get_sequences_v2: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let query = supabase.from("sequences_v2").select("*").order("created_at", { ascending: false })
    if (businessId) query = query.eq("business_id", businessId)
    const { data, error } = await query
    if (error) throw new Error(error.message)

    // Attach step counts and enrollment stats
    const seqIds = (data || []).map((s: { id: string }) => s.id)
    let stepCounts: Record<string, number> = {}
    let enrollStats: Record<string, { total: number; active: number; responded: number }> = {}

    if (seqIds.length > 0) {
      const { data: steps } = await supabase.from("sequence_steps_v2").select("sequence_id").in("sequence_id", seqIds)
      for (const s of steps || []) {
        stepCounts[s.sequence_id] = (stepCounts[s.sequence_id] || 0) + 1
      }
      const { data: assigns } = await supabase.from("sequence_assignments_v2").select("sequence_id, status").in("sequence_id", seqIds)
      for (const a of assigns || []) {
        if (!enrollStats[a.sequence_id]) enrollStats[a.sequence_id] = { total: 0, active: 0, responded: 0 }
        enrollStats[a.sequence_id].total++
        if (a.status === "active") enrollStats[a.sequence_id].active++
        if (a.status === "responded") enrollStats[a.sequence_id].responded++
      }

      // Attach tags
      const { data: tagAssignments } = await supabase.from("sequence_tag_assignments").select("sequence_id, tag_id").in("sequence_id", seqIds)
      const tagIds = [...new Set((tagAssignments || []).map((ta: any) => ta.tag_id))]
      let tagsMap: Record<string, any> = {}
      if (tagIds.length > 0) {
        const { data: tags } = await supabase.from("sequence_tags").select("*").in("id", tagIds)
        for (const t of tags || []) tagsMap[t.id] = t
      }
      var seqTags: Record<string, any[]> = {}
      for (const ta of tagAssignments || []) {
        if (!seqTags[ta.sequence_id]) seqTags[ta.sequence_id] = []
        if (tagsMap[ta.tag_id]) seqTags[ta.sequence_id].push(tagsMap[ta.tag_id])
      }
    }

    const enriched = (data || []).map((s: any) => ({
      ...s,
      steps_count: stepCounts[s.id] || 0,
      total_enrolled: enrollStats[s.id]?.total || 0,
      total_active: enrollStats[s.id]?.active || 0,
      total_responded: enrollStats[s.id]?.responded || 0,
      tags: seqTags?.[s.id] || [],
    }))

    return { success: true, action, data: enriched }
  },

  // ── GET TAGS ──────────────────────────────────────────────────────
  get_sequence_tags: async (action, body) => {
    const { data, error } = await supabase.from("sequence_tags").select("*").order("name")
    if (error) throw new Error(error.message)
    return { success: true, action, data: data || [] }
  },

  // ── CREATE TAG ────────────────────────────────────────────────────
  create_sequence_tag: async (action, body) => {
    const name = String(body.name || "").trim().toLowerCase()
    if (!name) return { success: false, error: "Name is required" }
    const color = String(body.color || "#6366f1")
    const { data, error } = await supabase.from("sequence_tags").insert({ name, color }).select().single()
    if (error) {
      // If duplicate, just return existing
      if (error.message.includes("duplicate")) {
        const { data: existing } = await supabase.from("sequence_tags").select("*").eq("name", name).single()
        return { success: true, action, data: existing }
      }
      throw new Error(error.message)
    }
    return { success: true, action, data }
  },

  // ── CREATE SEQUENCE V2 ────────────────────────────────────────────
  create_sequence_v2: async (action, body) => {
    const platforms = body.platforms as string[] || ["instagram"]
    const row = {
      name: String(body.name || ""),
      platform: platforms[0] === "instagram" ? "IG" : platforms[0] === "facebook" ? "FB" : platforms[0] === "linkedin" ? "LI" : platforms[0] === "email" ? "Email" : platforms[0] === "sms" ? "SMS" : "IG",
      platforms,
      niche: String(body.niche || ""),
      description: String(body.description || ""),
      is_active: true,
      cloned_from: body.cloned_from || null,
      business_id: (body.business_id as string) || "default",
    }
    if (!row.name) return { success: false, error: "Name is required" }
    const { data, error } = await supabase.from("sequences_v2").insert(row).select().single()
    if (error) throw new Error(error.message)

    // Assign tags
    const tagIds = body.tag_ids as string[] | undefined
    if (tagIds && tagIds.length > 0 && data) {
      const assignments = tagIds.map(tid => ({ sequence_id: data.id, tag_id: tid }))
      await supabase.from("sequence_tag_assignments").insert(assignments)
    }

    return { success: true, action, data }
  },

  // ── UPDATE SEQUENCE V2 ────────────────────────────────────────────
  update_sequence_v2: async (action, body) => {
    const id = String(body.id || "")
    if (!id) return { success: false, error: "Missing id" }
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of ["name", "platform", "platforms", "niche", "description", "is_active"]) {
      if (body[k] !== undefined) updates[k] = body[k]
    }
    const { error } = await supabase.from("sequences_v2").update(updates).eq("id", id)
    if (error) throw new Error(error.message)

    // Update tags if provided
    if (body.tag_ids !== undefined) {
      await supabase.from("sequence_tag_assignments").delete().eq("sequence_id", id)
      const tagIds = body.tag_ids as string[]
      if (tagIds.length > 0) {
        await supabase.from("sequence_tag_assignments").insert(tagIds.map(tid => ({ sequence_id: id, tag_id: tid })))
      }
    }

    return { success: true, action, message: "Sequence updated" }
  },

  // ── DELETE SEQUENCE V2 ────────────────────────────────────────────
  delete_sequence_v2: async (action, body) => {
    const id = String(body.id || "")
    if (!id) return { success: false, error: "Missing id" }
    const { error } = await supabase.from("sequences_v2").delete().eq("id", id)
    if (error) throw new Error(error.message)
    return { success: true, action, message: "Sequence deleted" }
  },

  // ── GET SEQUENCE DETAIL (with steps + variants + stats) ───────────
  get_sequence_detail_v2: async (action, body) => {
    const id = String(body.id || "")
    if (!id) return { success: false, error: "Missing id" }

    const { data: seq, error } = await supabase.from("sequences_v2").select("*").eq("id", id).single()
    if (error) throw new Error(error.message)

    // Get tags
    const { data: tagAssignments } = await supabase.from("sequence_tag_assignments").select("tag_id").eq("sequence_id", id)
    const tagIds = (tagAssignments || []).map((ta: any) => ta.tag_id)
    let tags: any[] = []
    if (tagIds.length > 0) {
      const { data: t } = await supabase.from("sequence_tags").select("*").in("id", tagIds)
      tags = t || []
    }

    // Get steps
    const { data: steps } = await supabase.from("sequence_steps_v2").select("*").eq("sequence_id", id).order("step_number", { ascending: true })

    // Get variants for all steps
    const stepIds = (steps || []).map((s: { id: string }) => s.id)
    let variants: any[] = []
    if (stepIds.length > 0) {
      const { data: v } = await supabase.from("sequence_step_variants").select("*").in("step_id", stepIds).order("variant_label", { ascending: true })
      variants = v || []
    }

    // Get enrollment stats
    const { data: assigns } = await supabase.from("sequence_assignments_v2").select("*").eq("sequence_id", id)
    const enrollStats = {
      total: (assigns || []).length,
      active: (assigns || []).filter((a: any) => a.status === "active").length,
      responded: (assigns || []).filter((a: any) => a.status === "responded").length,
      completed: (assigns || []).filter((a: any) => a.status === "completed").length,
      exited: (assigns || []).filter((a: any) => a.status === "exited").length,
    }

    // Get clones for cross-niche comparison
    let clones: any[] = []
    if (seq) {
      const rootId = seq.cloned_from || seq.id
      const { data: c } = await supabase.from("sequence_clone_comparison").select("*")
        .or(`id.eq.${rootId},cloned_from.eq.${rootId}`)
      clones = (c || []).filter((x: any) => x.id !== id)
    }

    // Attach variants to steps
    const stepsWithVariants = (steps || []).map((step: any) => ({
      ...step,
      variants: variants.filter((v: any) => v.step_id === step.id),
    }))

    return {
      success: true, action,
      data: { sequence: { ...seq, tags }, steps: stepsWithVariants, stats: enrollStats, clones }
    }
  },

  // ── ADD STEP ──────────────────────────────────────────────────────
  add_sequence_step_v2: async (action, body) => {
    const row: Record<string, any> = {
      sequence_id: String(body.sequence_id || ""),
      step_number: Number(body.step_number) || 1,
      step_type: String(body.step_type || "first_touch"),
      delay_days: Number(body.delay_days) || 0,
      condition: String(body.condition || "no_reply"),
    }
    if (body.step_name) row.step_name = String(body.step_name)
    if (body.platform) row.platform = String(body.platform)
    if (!row.sequence_id) return { success: false, error: "Missing sequence_id" }
    const { data, error } = await supabase.from("sequence_steps_v2").insert(row).select().single()
    if (error) throw new Error(error.message)
    return { success: true, action, data }
  },

  // ── UPDATE STEP ───────────────────────────────────────────────────
  update_sequence_step_v2: async (action, body) => {
    const id = String(body.id || "")
    if (!id) return { success: false, error: "Missing id" }
    const updates: Record<string, unknown> = {}
    for (const k of ["step_number", "step_type", "delay_days", "condition", "step_name", "platform"]) {
      if (body[k] !== undefined) updates[k] = body[k]
    }
    const { error } = await supabase.from("sequence_steps_v2").update(updates).eq("id", id)
    if (error) throw new Error(error.message)
    return { success: true, action, message: "Step updated" }
  },

  // ── DELETE STEP ───────────────────────────────────────────────────
  delete_sequence_step_v2: async (action, body) => {
    const id = String(body.id || "")
    if (!id) return { success: false, error: "Missing id" }
    const { error } = await supabase.from("sequence_steps_v2").delete().eq("id", id)
    if (error) throw new Error(error.message)
    return { success: true, action, message: "Step deleted" }
  },

  // ── ADD VARIANT ───────────────────────────────────────────────────
  add_step_variant: async (action, body) => {
    const row: Record<string, any> = {
      step_id: String(body.step_id || ""),
      variant_label: String(body.variant_label || "A"),
      message_text: String(body.message_text || ""),
      is_active: true,
    }
    if (body.platform) row.platform = String(body.platform)
    if (!row.step_id) return { success: false, error: "Missing step_id" }
    const { data, error } = await supabase.from("sequence_step_variants").insert(row).select().single()
    if (error) throw new Error(error.message)
    return { success: true, action, data }
  },

  // ── UPDATE VARIANT ────────────────────────────────────────────────
  update_step_variant: async (action, body) => {
    const id = String(body.id || "")
    if (!id) return { success: false, error: "Missing id" }
    const updates: Record<string, unknown> = {}
    for (const k of ["variant_label", "message_text", "is_active", "times_sent", "times_responded", "platform"]) {
      if (body[k] !== undefined) updates[k] = body[k]
    }
    const { error } = await supabase.from("sequence_step_variants").update(updates).eq("id", id)
    if (error) throw new Error(error.message)
    return { success: true, action, message: "Variant updated" }
  },

  // ── DELETE VARIANT ────────────────────────────────────────────────
  delete_step_variant: async (action, body) => {
    const id = String(body.id || "")
    if (!id) return { success: false, error: "Missing id" }
    const { error } = await supabase.from("sequence_step_variants").delete().eq("id", id)
    if (error) throw new Error(error.message)
    return { success: true, action, message: "Variant deleted" }
  },

  // ── DUPLICATE SEQUENCE ────────────────────────────────────────────
  duplicate_sequence_v2: async (action, body) => {
    const sourceId = String(body.id || "")
    const newName = String(body.name || "")
    const newNiche = String(body.niche || "")
    if (!sourceId) return { success: false, error: "Missing source id" }

    // Get source sequence
    const { data: src, error: srcErr } = await supabase.from("sequences_v2").select("*").eq("id", sourceId).single()
    if (srcErr || !src) return { success: false, error: "Source sequence not found" }

    // Create clone
    const { data: clone, error: cloneErr } = await supabase.from("sequences_v2").insert({
      name: newName || `${src.name} (Copy)`,
      platform: src.platform,
      platforms: src.platforms,
      niche: newNiche || src.niche,
      description: src.description,
      is_active: true,
      cloned_from: src.cloned_from || sourceId,
      business_id: src.business_id,
    }).select().single()
    if (cloneErr) throw new Error(cloneErr.message)

    // Copy tags
    const { data: srcTags } = await supabase.from("sequence_tag_assignments").select("tag_id").eq("sequence_id", sourceId)
    if (srcTags && srcTags.length > 0) {
      await supabase.from("sequence_tag_assignments").insert(srcTags.map((t: any) => ({ sequence_id: clone.id, tag_id: t.tag_id })))
    }

    // Copy steps
    const { data: srcSteps } = await supabase.from("sequence_steps_v2").select("*").eq("sequence_id", sourceId).order("step_number")
    for (const step of srcSteps || []) {
      const { data: newStep } = await supabase.from("sequence_steps_v2").insert({
        sequence_id: clone.id,
        step_number: step.step_number,
        step_type: step.step_type,
        delay_days: step.delay_days,
        condition: step.condition,
      }).select().single()

      // Copy variants (reset stats)
      const { data: srcVariants } = await supabase.from("sequence_step_variants").select("*").eq("step_id", step.id)
      for (const v of srcVariants || []) {
        await supabase.from("sequence_step_variants").insert({
          step_id: newStep!.id,
          variant_label: v.variant_label,
          message_text: v.message_text,
          is_active: v.is_active,
          platform: v.platform,
          times_sent: 0,
          times_responded: 0,
        })
      }
    }

    return { success: true, action, data: clone, message: `Duplicated sequence as "${clone.name}"` }
  },

  // ── ASSIGN LEADS TO SEQUENCE ──────────────────────────────────────
  assign_leads_to_sequence_v2: async (action, body) => {
    const sequenceId = String(body.sequence_id || "")
    const leadIds = body.lead_ids as string[]
    if (!sequenceId || !leadIds?.length) return { success: false, error: "Missing sequence_id or lead_ids" }

    const { data: steps } = await supabase.from("sequence_steps_v2").select("id").eq("sequence_id", sequenceId).order("step_number").limit(1)
    let variantIds: string[] = []
    if (steps?.length) {
      const { data: variants } = await supabase.from("sequence_step_variants").select("id").eq("step_id", steps[0].id).eq("is_active", true)
      variantIds = (variants || []).map((v: { id: string }) => v.id)
    }

    const rows = leadIds.map((leadId, i) => ({
      sequence_id: sequenceId,
      lead_id: leadId,
      current_step_number: 1,
      current_variant_id: variantIds.length > 0 ? variantIds[i % variantIds.length] : null,
      status: "active",
      next_action_date: new Date().toISOString().split("T")[0],
      business_id: (body.business_id as string) || "default",
    }))

    const { error } = await supabase.from("sequence_assignments_v2").insert(rows)
    if (error) throw new Error(error.message)

    return { success: true, action, message: `Assigned ${leadIds.length} leads to sequence` }
  },

  // ── GET SEQUENCE ASSIGNMENTS ──────────────────────────────────────
  get_sequence_assignments_v2: async (action, body) => {
    const sequenceId = body.sequence_id as string | undefined
    let query = supabase.from("sequence_assignments_v2").select("*").order("assigned_at", { ascending: false })
    if (sequenceId) query = query.eq("sequence_id", sequenceId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return { success: true, action, data: data || [] }
  },

  // ── UPDATE ASSIGNMENT STATUS ──────────────────────────────────────
  update_sequence_assignment_v2: async (action, body) => {
    const id = String(body.id || "")
    const status = String(body.status || "")
    if (!id || !status) return { success: false, error: "Missing id or status" }
    const updates: Record<string, unknown> = { status }
    if (status === "responded") {
      updates.responded_at = new Date().toISOString()
      updates.exited_at = new Date().toISOString()
    }
    if (status === "exited") updates.exited_at = new Date().toISOString()
    const { error } = await supabase.from("sequence_assignments_v2").update(updates).eq("id", id)
    if (error) throw new Error(error.message)
    return { success: true, action, message: `Assignment ${status}` }
  },

  // ── INCREMENT VARIANT STATS ───────────────────────────────────────
  increment_variant_sent: async (action, body) => {
    const id = String(body.variant_id || "")
    if (!id) return { success: false, error: "Missing variant_id" }
    const { data } = await supabase.from("sequence_step_variants").select("times_sent").eq("id", id).single()
    await supabase.from("sequence_step_variants").update({ times_sent: (data?.times_sent || 0) + 1 }).eq("id", id)
    return { success: true, action }
  },

  increment_variant_responded: async (action, body) => {
    const id = String(body.variant_id || "")
    if (!id) return { success: false, error: "Missing variant_id" }
    const { data } = await supabase.from("sequence_step_variants").select("times_responded").eq("id", id).single()
    await supabase.from("sequence_step_variants").update({ times_responded: (data?.times_responded || 0) + 1 }).eq("id", id)
    return { success: true, action }
  },
}

export default handlers
