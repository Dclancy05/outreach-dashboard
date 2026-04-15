import { supabase, throwOnError } from "./helpers"
import { getLeadPlatforms, getSequencePlatforms, profileKey, generateVariantSteps, parseStepPlatformAction, isNonMessageAction } from "../platform-profile"
import type { ActionHandler, Lead, Sequence } from "../types"

const handlers: Record<string, ActionHandler> = {
  get_sequences: async (action, body) => {
    const businessId = body.business_id as string | undefined
    const limit = Number(body.limit) || 50
    const offset = Number(body.offset) || 0
    let query = supabase.from("sequences").select("*", { count: "exact" })
    if (businessId) query = query.eq("business_id", businessId)
    query = query.range(offset, offset + limit - 1)
    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return { success: true, action, data: data || [], count: count || (data || []).length }
  },

  create_sequence: async (action, body) => {
    const seqId = String(body.sequence_id || ""); const seqName = String(body.sequence_name || "")
    if (!seqId || !seqName) return { success: false, error: "Missing sequence_id or sequence_name" }
    const steps = (body.steps as Record<string, string>) || {}
    const platforms = profileKey(getSequencePlatforms({ sequence_id: seqId, sequence_name: seqName, steps, required_platforms: "", template_id: "", is_template: false }))
    throwOnError(await supabase.from("sequences").insert({
      sequence_id: seqId, sequence_name: seqName, steps, required_platforms: platforms,
      template_id: String(body.template_id || ""), is_template: Boolean(body.is_template),
      business_id: (body.business_id as string) || "default",
    }))
    return { success: true, action, message: `Sequence ${seqId} created` }
  },

  delete_sequences: async (action, body) => {
    const ids = body.sequence_ids as string[]
    if (!ids?.length) return { success: false, error: "No sequence_ids provided" }
    await supabase.from("sequences").delete().in("sequence_id", ids)
    return { success: true, action, message: `Deleted ${ids.length} sequences` }
  },

  start_sequences: async (action, body) => {
    const leadIds = body.lead_ids as string[]; const sequenceId = String(body.sequence_id || "")
    const routingMap = body.routing_map as Record<string, string> | undefined
    if (!leadIds?.length) return { success: false, error: "Missing lead_ids" }
    if (!sequenceId && !routingMap) return { success: false, error: "Missing sequence_id or routing_map" }
    if (routingMap) {
      const bySeq: Record<string, string[]> = {}
      for (const lid of leadIds) { const sid = routingMap[lid] || sequenceId; if (!sid) continue; if (!bySeq[sid]) bySeq[sid] = []; bySeq[sid].push(lid) }
      for (const [sid, lids] of Object.entries(bySeq)) {
        const { error } = await supabase.from("leads").update({ sequence_id: sid, status: "in_sequence", current_step: "1", next_action_date: new Date().toISOString().split("T")[0] }).in("lead_id", lids)
        if (error) throw new Error(error.message)
      }
      return { success: true, action, message: `Started ${leadIds.length} leads with variant routing` }
    }
    const { error } = await supabase.from("leads").update({ sequence_id: sequenceId, status: "in_sequence", current_step: "1", next_action_date: new Date().toISOString().split("T")[0] }).in("lead_id", leadIds)
    if (error) throw new Error(error.message)
    return { success: true, action, message: `Started ${leadIds.length} leads on ${sequenceId}` }
  },

  update_sequence_steps: async (action, body) => {
    const seqId = String(body.sequence_id || ""); const steps = body.steps as Record<string, string>
    if (!seqId || !steps) return { success: false, error: "Missing sequence_id or steps" }
    const platforms = profileKey(getSequencePlatforms({ sequence_id: seqId, sequence_name: "", steps, required_platforms: "", template_id: "", is_template: false } as Sequence))
    await supabase.from("sequences").update({ steps, required_platforms: platforms }).eq("sequence_id", seqId)
    return { success: true, action, message: `Sequence ${seqId} steps updated`, data: { required_platforms: platforms } }
  },

  create_template_sequence: async (action, body) => {
    const seqId = String(body.sequence_id || ""); const seqName = String(body.sequence_name || "")
    const steps = (body.steps as Record<string, string>) || {}
    if (!seqId || !seqName) return { success: false, error: "Missing sequence_id or sequence_name" }
    const platforms = profileKey(getSequencePlatforms({ sequence_id: seqId, sequence_name: seqName, steps, required_platforms: "", template_id: "", is_template: false } as Sequence))
    throwOnError(await supabase.from("sequences").insert({ sequence_id: seqId, sequence_name: seqName, steps, required_platforms: platforms, template_id: "", is_template: true }))
    const leads = throwOnError(await supabase.from("leads").select("lead_id, platform_profile, email, phone, instagram_url, facebook_url, linkedin_url")) as Lead[]
    const profileGroups = new Map<string, string[]>()
    for (const lead of leads) { const key = lead.platform_profile || profileKey(getLeadPlatforms(lead)); if (!profileGroups.has(key)) profileGroups.set(key, []); profileGroups.get(key)!.push(lead.lead_id) }
    const templatePlatforms = new Set(platforms.split(",").filter(Boolean))
    const variants: { id: string; name: string; platforms: string; stepCount: number; leadCount: number }[] = []
    for (const [profile, leadIds] of profileGroups) {
      const leadPlatforms = new Set(profile.split(",").filter(Boolean))
      const missingPlatforms = [...templatePlatforms].filter((p) => !leadPlatforms.has(p))
      if (missingPlatforms.length === 0) continue
      const variantSteps = generateVariantSteps(steps, leadPlatforms)
      if (Object.keys(variantSteps).length === 0) continue
      const variantId = `${seqId}__${profile.replace(/,/g, "_")}`
      const variantPlatforms = profileKey(Object.values(variantSteps).filter(Boolean))
      const labels: Record<string, string> = { email: "EM", facebook_dm: "FB", instagram_dm: "IG", linkedin: "LI", sms: "SMS" }
      const variantName = `${seqName} (${profile.split(",").map((p: string) => labels[p] || p).join("+")})`
      throwOnError(await supabase.from("sequences").insert({ sequence_id: variantId, sequence_name: variantName, steps: variantSteps, required_platforms: variantPlatforms, template_id: seqId, is_template: false }))
      variants.push({ id: variantId, name: variantName, platforms: variantPlatforms, stepCount: Object.keys(variantSteps).length, leadCount: leadIds.length })
    }
    return { success: true, action, data: { template_id: seqId, variants_created: variants.length, variants }, message: `Template "${seqName}" created with ${variants.length} auto-generated variant(s).` }
  },

  regenerate_variants: async (action, body) => {
    const templateId = String(body.template_id || "")
    if (!templateId) return { success: false, error: "Missing template_id" }
    const templates = throwOnError(await supabase.from("sequences").select("*").eq("sequence_id", templateId)) as Sequence[]
    if (templates.length === 0) return { success: false, error: "Template not found" }
    const template = templates[0]
    const templateSteps = typeof template.steps === "string" ? JSON.parse(template.steps) : template.steps
    const templatePlatforms = new Set((template.required_platforms || "").split(",").filter(Boolean))
    const existingVariants = throwOnError(await supabase.from("sequences").select("sequence_id, required_platforms").eq("template_id", templateId)) as { sequence_id: string; required_platforms: string }[]
    const existingProfiles = new Set(existingVariants.map((v) => v.required_platforms))
    const leads = throwOnError(await supabase.from("leads").select("lead_id, platform_profile, email, phone, instagram_url, facebook_url, linkedin_url")) as Lead[]
    const profileGroups = new Map<string, string[]>()
    for (const lead of leads) { const key = lead.platform_profile || profileKey(getLeadPlatforms(lead)); if (!profileGroups.has(key)) profileGroups.set(key, []); profileGroups.get(key)!.push(lead.lead_id) }
    let created = 0
    for (const [profile] of profileGroups) {
      const leadPlatforms = new Set(profile.split(",").filter(Boolean))
      const missingPlatforms = [...templatePlatforms].filter((p) => !leadPlatforms.has(p))
      if (missingPlatforms.length === 0) continue
      const variantSteps = generateVariantSteps(templateSteps, leadPlatforms)
      if (Object.keys(variantSteps).length === 0) continue
      const variantPlatforms = profileKey(Object.values(variantSteps).filter(Boolean))
      if (existingProfiles.has(variantPlatforms)) continue
      const variantId = `${templateId}__${profile.replace(/,/g, "_")}`
      const labels: Record<string, string> = { email: "EM", facebook_dm: "FB", instagram_dm: "IG", linkedin: "LI", sms: "SMS" }
      const variantName = `${template.sequence_name} (${profile.split(",").map((p: string) => labels[p] || p).join("+")})`
      throwOnError(await supabase.from("sequences").insert({ sequence_id: variantId, sequence_name: variantName, steps: variantSteps, required_platforms: variantPlatforms, template_id: templateId, is_template: false }))
      created++
    }
    return { success: true, action, data: { template_id: templateId, new_variants: created }, message: `Regenerated variants: ${created} new variant(s) created.` }
  },

  convert_to_template: async (action, body) => {
    const seqId = String(body.sequence_id || "")
    if (!seqId) return { success: false, error: "Missing sequence_id" }
    await supabase.from("sequences").update({ is_template: true, template_id: "" }).eq("sequence_id", seqId)
    const seqs = throwOnError(await supabase.from("sequences").select("*").eq("sequence_id", seqId)) as Sequence[]
    if (seqs.length === 0) return { success: false, error: "Sequence not found" }
    const seq = seqs[0]; const steps = typeof seq.steps === "string" ? JSON.parse(seq.steps) : seq.steps
    const templatePlatforms = new Set((seq.required_platforms || "").split(",").filter(Boolean))
    const leads = throwOnError(await supabase.from("leads").select("lead_id, platform_profile, email, phone, instagram_url, facebook_url, linkedin_url")) as Lead[]
    const profileGroups = new Map<string, string[]>()
    for (const lead of leads) { const key = lead.platform_profile || profileKey(getLeadPlatforms(lead)); if (!profileGroups.has(key)) profileGroups.set(key, []); profileGroups.get(key)!.push(lead.lead_id) }
    let created = 0
    for (const [profile] of profileGroups) {
      const leadPlatforms = new Set(profile.split(",").filter(Boolean))
      const missingPlatforms = [...templatePlatforms].filter((p) => !leadPlatforms.has(p))
      if (missingPlatforms.length === 0) continue
      const variantSteps = generateVariantSteps(steps, leadPlatforms)
      if (Object.keys(variantSteps).length === 0) continue
      const variantId = `${seqId}__${profile.replace(/,/g, "_")}`
      const variantPlatforms = profileKey(Object.values(variantSteps).filter(Boolean))
      const labels: Record<string, string> = { email: "EM", facebook_dm: "FB", instagram_dm: "IG", linkedin: "LI", sms: "SMS" }
      const variantName = `${seq.sequence_name} (${profile.split(",").map((p: string) => labels[p] || p).join("+")})`
      try { throwOnError(await supabase.from("sequences").insert({ sequence_id: variantId, sequence_name: variantName, steps: variantSteps, required_platforms: variantPlatforms, template_id: seqId, is_template: false })); created++ } catch { /* variant may already exist */ }
    }
    return { success: true, action, data: { template_id: seqId, variants_created: created }, message: `Converted to template with ${created} variant(s).` }
  },

  trigger_generate: async (action, body) => {
    const leadIds = body.lead_ids as string[] | undefined
    const approachIds = body.approach_ids as string[] | undefined
    const sequenceId = body.sequence_id as string | undefined
    const abTestId = body.ab_test_id as string | undefined
    const routingMap = body.routing_map as Record<string, string> | undefined
    if (!leadIds?.length) return { success: false, error: "Select at least one lead to generate messages for." }
    if (!sequenceId && !routingMap) return { success: false, error: "Select a sequence." }
    if (!approachIds?.length) return { success: false, error: "Select at least one approach." }
    const approaches = throwOnError(await supabase.from("approaches").select("*").in("approach_id", approachIds))
    if (approaches.length === 0) return { success: false, error: "Selected approaches not found." }
    const seqIds = new Set<string>()
    for (const leadId of leadIds) { seqIds.add(routingMap?.[leadId] || sequenceId || "") }
    const seqMap: Record<string, Record<string, string>> = {}
    if (seqIds.size > 0) {
      const { data: seqData } = await supabase.from("sequences").select("sequence_id, steps").in("sequence_id", [...seqIds])
      for (const seq of seqData || []) { seqMap[seq.sequence_id] = typeof seq.steps === "string" ? JSON.parse(seq.steps) : seq.steps }
    }
    const { data: leadsData } = await supabase.from("leads").select("lead_id, name").in("lead_id", leadIds)
    const leadNameMap: Record<string, string> = {}
    for (const l of leadsData || []) { leadNameMap[l.lead_id] = l.name || "" }
    const jobs = []; const nonMessageEntries: Array<Record<string, string>> = []
    for (const leadId of leadIds) {
      const effectiveSeqId = routingMap?.[leadId] || sequenceId || ""
      const steps = seqMap[effectiveSeqId] || {}
      for (const [dayKey, stepPlatform] of Object.entries(steps)) {
        if (!stepPlatform) continue
        const { platform, action: stepAction } = parseStepPlatformAction(stepPlatform)
        if (isNonMessageAction(stepAction)) {
          const dayNum = dayKey.replace("day_", "")
          nonMessageEntries.push({
            message_id: `msg_${leadId}_${effectiveSeqId}_${dayKey}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            lead_id: leadId, business_name: leadNameMap[leadId] || "", sequence_id: effectiveSeqId,
            step_number: dayNum, platform: stepPlatform, action: stepAction, body: "", subject: "",
            status: "approved", approach_id: approaches[0]?.approach_id || "", generated_at: new Date().toISOString(),
          })
        }
      }
      for (const approach of approaches) {
        jobs.push({
          lead_id: leadId, sequence_id: effectiveSeqId, approach_id: approach.approach_id,
          approach_name: approach.name, prompt_file: approach.prompt_file, ab_test_id: abTestId || "",
        })
      }
    }
    let directInserted = 0
    if (nonMessageEntries.length > 0) {
      const { error: insertError } = await supabase.from("messages").insert(nonMessageEntries)
      if (!insertError) directInserted = nonMessageEntries.length
    }
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"
      const genRes = await fetch(`${baseUrl}/api/generate-messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobs }) })
      const genResult = await genRes.json()
      if (!genResult.success && genResult.error) return { success: false, error: `Generation failed: ${genResult.error}`, data: { direct_action_entries: directInserted } }
      return { success: true, action, data: { ...genResult, direct_action_entries: directInserted }, message: `Generated ${genResult.total_created || 0} messages for ${leadIds.length} lead(s).${directInserted > 0 ? ` Also created ${directInserted} auto-approved action(s) (follow/connect).` : ""}` }
    } catch (genErr) {
      return { success: true, action, data: { jobs, total_jobs: jobs.length, leads: leadIds.length, approaches: approaches.length, is_ab_test: approaches.length > 1, direct_action_entries: directInserted, generation_error: genErr instanceof Error ? genErr.message : String(genErr) }, message: `Created ${jobs.length} job(s) but auto-generation failed: ${genErr instanceof Error ? genErr.message : "Unknown error"}. Ensure the Claude Bridge is running on port 3456.${directInserted > 0 ? ` Created ${directInserted} auto-approved action(s).` : ""}` }
    }
  },

  trigger_outreach: async (action) => {
    return { success: true, action, message: "trigger_outreach must be triggered from the n8n editor. Open your n8n dashboard to run this workflow." }
  },

  get_campaigns: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let query = supabase.from("send_queue").select("campaign_id, platform, status, scheduled_for")
    if (businessId) query = query.eq("business_id", businessId)
    const { data, error } = await query
    if (error) return { success: true, action, data: [] }
    const campaignMap = new Map<string, { campaign_id: string; campaign_name: string; status: string; created_at: string; total_messages: number; platforms: string[]; sent: number; pending: number }>()
    for (const row of data || []) {
      const cid = row.campaign_id || "unknown"
      if (!campaignMap.has(cid)) {
        campaignMap.set(cid, { campaign_id: cid, campaign_name: cid, status: "unknown", created_at: row.scheduled_for || "", total_messages: 0, platforms: [], sent: 0, pending: 0 })
      }
      const c = campaignMap.get(cid)!
      c.total_messages++
      if (row.platform && !c.platforms.includes(row.platform)) c.platforms.push(row.platform)
      if (row.status === "sent") c.sent++
      if (row.status === "queued" || row.status === "pending") c.pending++
    }
    const campaigns = [...campaignMap.values()].map(c => ({
      ...c,
      status: c.pending > 0 ? "active" : c.sent > 0 ? "completed" : "scheduled",
    }))
    campaigns.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    return { success: true, action, data: campaigns }
  },
}

export default handlers
