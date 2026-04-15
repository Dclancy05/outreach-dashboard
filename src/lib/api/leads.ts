import { supabase, throwOnError, logActivity, updateActivity } from "./helpers"
import type { ActionHandler } from "../types"

const handlers: Record<string, ActionHandler> = {
  get_leads: async (action, body) => {
    const page = Number(body.page) || 1
    const pageSize = Number(body.pageSize) || 50
    const search = (body.search as string) || ""
    const statusFilter = (body.statusFilter as string) || ""
    const tagFilter = (body.tagFilter as string) || ""
    const smartList = (body.smartList as string) || ""
    const sortField = (body.sortField as string) || ""
    const sortDir = (body.sortDir as string) || "asc"

    let query = supabase.from("leads").select("*", { count: "exact" })
    if (body.business_id) {
      if (body.business_id === "default") {
        query = query.or("business_id.eq.default,business_id.eq.,business_id.is.null")
      } else {
        query = query.eq("business_id", body.business_id as string)
      }
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,lead_id.ilike.%${search}%,email.ilike.%${search}%,city.ilike.%${search}%`)
    }
    if (statusFilter && statusFilter !== "all") query = query.eq("status", statusFilter)
    if (tagFilter && tagFilter !== "all") query = query.ilike("tags", `%${tagFilter}%`)
    if (smartList && smartList !== "all") {
      const { data: slData } = await supabase.from("smart_lists").select("filters").eq("list_id", smartList).single()
      const filters = slData?.filters ? (typeof slData.filters === "string" ? JSON.parse(slData.filters) : slData.filters) : null
      if (filters && Object.keys(filters).length > 0) {
        if (filters.status) query = query.eq("status", filters.status)
        if (filters.ranking_tier) query = query.eq("ranking_tier", filters.ranking_tier)
        if (filters.business_type) query = query.eq("business_type", filters.business_type)
        if (filters.city) query = query.ilike("city", `%${filters.city}%`)
        if (filters.tags_contains) query = query.ilike("tags", `%${filters.tags_contains}%`)
        if (filters.days_since_contact) {
          const cutoff = new Date()
          cutoff.setDate(cutoff.getDate() - Number(filters.days_since_contact))
          query = query.lt("last_contacted_at", cutoff.toISOString())
        }
      } else {
        query = query.eq("smart_list", smartList)
      }
    }
    if (sortField) {
      query = query.order(sortField, { ascending: sortDir === "asc" })
    } else {
      query = query.order("lead_id", { ascending: false })
    }
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)
    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    const totalCount = count || 0
    return { success: true, action, data, count: totalCount, page, pageSize, totalPages: Math.ceil(totalCount / pageSize) }
  },

  import_leads: async (action, body) => {
    const rawData = body.leads_data as string | undefined
    const format = body.format as string | undefined
    if (!rawData?.trim()) return { success: false, error: "No data provided" }

    let parsedLeads: Record<string, string>[]
    if (format === "csv") {
      const parseCSV = (text: string): string[][] => {
        const rows: string[][] = []; let row: string[] = []; let current = ""; let inQuotes = false
        for (let i = 0; i < text.length; i++) {
          const ch = text[i]
          if (inQuotes) {
            if (ch === '"') { if (text[i + 1] === '"') { current += '"'; i++ } else { inQuotes = false } } else { current += ch }
          } else {
            if (ch === '"') { inQuotes = true }
            else if (ch === ",") { row.push(current.trim()); current = "" }
            else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
              if (ch === "\r") i++
              row.push(current.trim()); current = ""
              if (row.some((cell) => cell !== "")) rows.push(row); row = []
            } else if (ch !== "\r") { current += ch }
          }
        }
        row.push(current.trim())
        if (row.some((cell) => cell !== "")) rows.push(row)
        return rows
      }
      const allRows = parseCSV(rawData.trim())
      if (allRows.length < 2) return { success: false, error: "CSV must have a header row and at least one data row" }
      const csvHeaders = allRows[0]
      parsedLeads = allRows.slice(1).map((values) => {
        const obj: Record<string, string> = {}
        csvHeaders.forEach((h, i) => { obj[h] = values[i] || "" })
        return obj
      })
    } else {
      try { parsedLeads = JSON.parse(rawData) } catch { return { success: false, error: "Invalid JSON format" } }
    }
    if (!Array.isArray(parsedLeads) || parsedLeads.length === 0) return { success: false, error: "No leads found in data" }

    const leadHeaders = ["lead_id", "name", "city", "state", "business_type", "phone", "email", "all_emails", "all_contacts", "website", "instagram_url", "facebook_url", "linkedin_url", "total_score", "ranking_tier", "status", "sequence_id", "current_step", "next_action_date", "last_platform_sent", "scraped_at", "messages_generated", "notes", "_raw_scrape_data", "message_count", "is_chain", "location_count", "dedup_method"]
    const fieldMap: Record<string, string> = {
      place_id: "lead_id", full_address: "city", street: "city", phone: "phone", site: "website",
      name: "name", state: "state", type: "business_type", category: "business_type",
      email_1: "email", company_instagram: "instagram_url", company_facebook: "facebook_url", company_linkedin: "linkedin_url",
    }
    const enhancedMode = body.enhanced_mode as boolean | undefined
    const activityId = await logActivity("import", `Importing ${parsedLeads.length} rows${enhancedMode ? " (enhanced)" : ""}...`, { rows: parsedLeads.length, enhanced: enhancedMode || false }, parsedLeads.length)

    try {
      const webhookUrl = "https://dclancy05.app.n8n.cloud/webhook/rebuild-scrape-leads"
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 300000)
      const res = await fetch(webhookUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: parsedLeads, enhanced_mode: enhancedMode || false }), signal: controller.signal,
      })
      clearTimeout(timeout)
      if (!res.ok) { const text = await res.text(); throw new Error(`Pipeline returned ${res.status}: ${text.slice(0, 200)}`) }
      const result = await res.json()
      let ingestStats: Record<string, unknown> = {}; let dedupStats: Record<string, unknown> = {}
      try { ingestStats = typeof result.ingest_stats === "string" ? JSON.parse(result.ingest_stats) : result.ingest_stats || {} } catch { /* */ }
      try { dedupStats = typeof result.dedup_stats === "string" ? JSON.parse(result.dedup_stats) : result.dedup_stats || {} } catch { /* */ }
      await updateActivity(activityId, {
        status: "completed",
        summary: `Processed ${parsedLeads.length} rows → ${result.total_leads || 0} leads (${result.hot_leads || 0} hot, ${result.warm_leads || 0} warm, ${result.cold_leads || 0} cold)`,
        details: { rows_sent: parsedLeads.length, total_leads: result.total_leads, hot_leads: result.hot_leads, warm_leads: result.warm_leads, cold_leads: result.cold_leads, ingest_stats: ingestStats, dedup_stats: dedupStats, enhanced: enhancedMode || false },
      })
      const autoScrape = body.auto_scrape as boolean | undefined
      if (autoScrape) {
        try {
          const { data: recentLeads } = await supabase.from("leads").select("lead_id, instagram_url, facebook_url, linkedin_url").order("lead_id", { ascending: false }).limit(parsedLeads.length)
          const leadsWithUrls = (recentLeads || []).filter((l: { instagram_url?: string; facebook_url?: string; linkedin_url?: string }) => l.instagram_url || l.facebook_url || l.linkedin_url)
          if (leadsWithUrls.length > 0) {
            const scrapeJobs: { lead_id: string; platform: string; url: string; status: string; priority: number }[] = []
            for (const lead of leadsWithUrls) {
              if (lead.instagram_url) scrapeJobs.push({ lead_id: lead.lead_id, platform: "instagram", url: lead.instagram_url, status: "pending", priority: 1 })
              if (lead.facebook_url) scrapeJobs.push({ lead_id: lead.lead_id, platform: "facebook", url: lead.facebook_url, status: "pending", priority: 2 })
              if (lead.linkedin_url) scrapeJobs.push({ lead_id: lead.lead_id, platform: "linkedin", url: lead.linkedin_url, status: "pending", priority: 3 })
            }
            if (scrapeJobs.length > 0) await supabase.from("job_queue").insert(scrapeJobs)
          }
        } catch { /* don't fail import if auto-scrape fails */ }
      }
      return { success: true, action, message: `Sent ${parsedLeads.length} rows to scraping pipeline${enhancedMode ? " (enhanced mode)" : ""}. ${result.total_leads || 0} unique leads processed.${autoScrape ? " Auto-scrape queued." : ""}`, data: { ...result, activity_id: activityId } }
    } catch (e) {
      // Fallback: normalize, dedup, save to Supabase
      const placeGroups = new Map<string, Record<string, string>[]>()
      const noPlaceRows: Record<string, string>[] = []
      for (const l of parsedLeads) {
        const pid = l.place_id || l.google_id || ""
        if (pid) { if (!placeGroups.has(pid)) placeGroups.set(pid, []); placeGroups.get(pid)!.push(l) }
        else { noPlaceRows.push(l) }
      }
      const deduped: Record<string, string>[] = []
      for (const [pid, group] of placeGroups) {
        const base = group[0]; const normalized: Record<string, string> = {}
        for (const [k, v] of Object.entries(base)) { const mapped = fieldMap[k]; if (mapped && !normalized[mapped]) normalized[mapped] = v || "" }
        for (const h of leadHeaders) { if (base[h]) normalized[h] = base[h] }
        const emails = new Set<string>()
        for (const row of group) { const em = (row.email || "").trim().toLowerCase(); if (em && em.includes("@") && !em.startsWith("address")) emails.add(em) }
        if (emails.size > 0 && !normalized.email) normalized.email = [...emails][0]
        if (emails.size > 0) normalized.all_emails = [...emails].join(", ")
        normalized.all_contacts = normalized.all_contacts || "[]"
        normalized.lead_id = pid
        if (!normalized.total_score) normalized.total_score = "0"
        if (!normalized.ranking_tier) normalized.ranking_tier = "COLD"
        if (!normalized.status) normalized.status = "new"
        deduped.push(normalized)
      }
      const seenNameCity = new Set<string>()
      for (const l of noPlaceRows) {
        const normalized: Record<string, string> = {}
        for (const [k, v] of Object.entries(l)) { const mapped = fieldMap[k]; if (mapped && !normalized[mapped]) normalized[mapped] = v || "" }
        for (const h of leadHeaders) { if (l[h]) normalized[h] = l[h] }
        const nameCity = `${(normalized.name || "").toLowerCase()}|${(normalized.city || "").toLowerCase()}`
        if (seenNameCity.has(nameCity)) continue; seenNameCity.add(nameCity)
        if (!normalized.lead_id) normalized.lead_id = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        normalized.all_contacts = normalized.all_contacts || "[]"
        if (!normalized.total_score) normalized.total_score = "0"
        if (!normalized.ranking_tier) normalized.ranking_tier = "COLD"
        if (!normalized.status) normalized.status = "new"
        deduped.push(normalized)
      }
      let upserted = 0; const BATCH_SIZE = 500; const importBusinessId = (body.business_id as string) || "default"
      for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
        const batch = deduped.slice(i, i + BATCH_SIZE).map((n) => {
          const row: Record<string, string> = {}
          for (const h of [...leadHeaders, "tags", "smart_list"]) { row[h] = n[h] || "" }
          row.business_id = importBusinessId; return row
        })
        const { error } = await supabase.from("leads").upsert(batch, { onConflict: "lead_id" })
        if (!error) upserted += batch.length
      }
      const errMsg = e instanceof Error ? e.message : String(e)
      await updateActivity(activityId, {
        status: "failed",
        summary: `Pipeline unavailable — saved ${upserted} leads directly (${parsedLeads.length} rows → ${deduped.length} after dedup). Error: ${errMsg}`,
        details: { rows_sent: parsedLeads.length, deduped: deduped.length, leads_saved: upserted, error: errMsg, fallback: true },
      })
      return { success: true, action, message: `Imported ${upserted} unique leads directly (scraping pipeline unavailable: ${errMsg})`, data: { activity_id: activityId } }
    }
  },

  import_leads_mapped: async (action, body) => {
    const rows = body.rows as Record<string, string>[]
    const mapping = body.mapping as Record<string, string>
    const businessId = (body.business_id as string) || "default"
    if (!rows?.length) return { success: false, error: "No rows provided" }
    if (!mapping) return { success: false, error: "No column mapping provided" }
    const seen = new Map<string, Record<string, string>>()
    for (const row of rows) {
      const lead: Record<string, string> = { business_id: businessId }
      for (const [csvCol, dbField] of Object.entries(mapping)) {
        if (dbField === "skip" || !dbField) continue; lead[dbField] = row[csvCol] || ""
      }
      if (!lead.status) lead.status = "new"
      const dedupKey = [(lead.name || "").toLowerCase().trim(), (lead.instagram_url || lead.email || "").toLowerCase().trim()].join("|")
      if (!dedupKey || dedupKey === "|") continue
      if (seen.has(dedupKey)) {
        const existing = seen.get(dedupKey)!
        for (const [k, v] of Object.entries(lead)) { if (v && !existing[k]) existing[k] = v }
      } else {
        if (!lead.lead_id) lead.lead_id = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        seen.set(dedupKey, lead)
      }
    }
    const leads = [...seen.values()]; const duped = rows.length - leads.length
    const BATCH = 500; let upserted = 0
    for (let i = 0; i < leads.length; i += BATCH) {
      const batch = leads.slice(i, i + BATCH)
      const { error } = await supabase.from("leads").upsert(batch, { onConflict: "lead_id" })
      if (!error) upserted += batch.length
    }
    return { success: true, action, message: `Imported ${upserted} leads (${duped} duplicates removed)`, data: { imported: upserted, total: rows.length, duplicates_removed: duped } }
  },

  import_leads_from_run: async (action, body) => {
    const runId = String(body.run_id || "")
    if (!runId) return { success: false, error: "Missing run_id" }
    const { data: run, error: runError } = await supabase.from("autobot_runs").select("id, automation_id, data_collected, status").eq("id", runId).single()
    if (runError || !run) return { success: false, error: "Run not found" }
    if (!run.data_collected) return { success: false, error: "No data collected in this run" }
    const collected = typeof run.data_collected === "string" ? JSON.parse(run.data_collected) : run.data_collected
    const items = Array.isArray(collected) ? collected : [collected]
    if (items.length === 0) return { success: false, error: "No items to import" }
    const fieldMapping = (body.field_mapping as Record<string, string>) || {}
    const sequenceId = body.sequence_id as string | undefined
    const importBusinessId = (body.business_id as string) || "default"
    const defaultMap: Record<string, string> = {
      name: "name", business_name: "name", company: "name", city: "city", location: "city", state: "state",
      phone: "phone", phone_number: "phone", email: "email", email_address: "email",
      website: "website", site: "website", url: "website",
      instagram: "instagram_url", instagram_url: "instagram_url", facebook: "facebook_url", facebook_url: "facebook_url",
      linkedin: "linkedin_url", linkedin_url: "linkedin_url", type: "business_type", category: "business_type",
      business_type: "business_type", job_title: "notes", title: "notes",
    }
    const mapping = { ...defaultMap, ...fieldMapping }
    const leads: Record<string, string>[] = []
    for (const item of items) {
      if (!item || typeof item !== "object") continue
      const lead: Record<string, string> = {}
      for (const [srcKey, val] of Object.entries(item)) {
        const targetField = mapping[srcKey.toLowerCase()]
        if (targetField && val && !lead[targetField]) lead[targetField] = String(val)
      }
      if (!lead.name && !lead.email && !lead.instagram_url && !lead.linkedin_url) continue
      lead.lead_id = lead.lead_id || `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      lead.status = sequenceId ? "in_sequence" : "new"
      lead.total_score = lead.total_score || "0"; lead.ranking_tier = lead.ranking_tier || "COLD"
      lead.business_id = importBusinessId; lead.scraped_at = new Date().toISOString()
      if (sequenceId) {
        lead.sequence_id = sequenceId; lead.current_step = "1"
        const nextDate = new Date(); nextDate.setDate(nextDate.getDate() + 1)
        lead.next_action_date = nextDate.toISOString().split("T")[0]
      }
      leads.push(lead)
    }
    if (leads.length === 0) return { success: false, error: "No valid leads extracted from data" }
    const seen = new Set<string>()
    const uniqueLeads = leads.filter((l) => {
      const key = l.email || l.instagram_url || l.linkedin_url || l.facebook_url || l.name
      if (seen.has(key)) return false; seen.add(key); return true
    })
    const emailsToCheck = uniqueLeads.map((l) => l.email).filter(Boolean)
    const instaToCheck = uniqueLeads.map((l) => l.instagram_url).filter(Boolean)
    const linkedinToCheck = uniqueLeads.map((l) => l.linkedin_url).filter(Boolean)
    const existingIds = new Set<string>()
    if (emailsToCheck.length) { const { data: existing } = await supabase.from("leads").select("lead_id, email").in("email", emailsToCheck); for (const e of existing || []) existingIds.add(e.email) }
    if (instaToCheck.length) { const { data: existing } = await supabase.from("leads").select("lead_id, instagram_url").in("instagram_url", instaToCheck); for (const e of existing || []) existingIds.add(e.instagram_url) }
    if (linkedinToCheck.length) { const { data: existing } = await supabase.from("leads").select("lead_id, linkedin_url").in("linkedin_url", linkedinToCheck); for (const e of existing || []) existingIds.add(e.linkedin_url) }
    const newLeads = uniqueLeads.filter((l) => !existingIds.has(l.email) && !existingIds.has(l.instagram_url) && !existingIds.has(l.linkedin_url))
    let inserted = 0
    if (newLeads.length > 0) {
      const BATCH = 500
      for (let i = 0; i < newLeads.length; i += BATCH) {
        const batch = newLeads.slice(i, i + BATCH)
        const { error: insertError } = await supabase.from("leads").upsert(batch, { onConflict: "lead_id" })
        if (!insertError) inserted += batch.length
      }
    }
    return { success: true, action, data: { run_id: runId, items_in_run: items.length, mapped: leads.length, unique: uniqueLeads.length, duplicates_skipped: uniqueLeads.length - newLeads.length, inserted }, message: `Imported ${inserted} new leads from run ${runId}` }
  },

  bulk_update_leads: async (action, body) => {
    const ids = body.lead_ids as string[]
    if (!ids?.length) return { success: false, error: "No lead_ids provided" }
    const updates: Record<string, string> = {}
    for (const [k, v] of Object.entries(body)) { if (k !== "action" && k !== "lead_ids") updates[k] = String(v ?? "") }
    const { error } = await supabase.from("leads").update(updates).in("lead_id", ids)
    if (error) throw new Error(error.message)
    return { success: true, action, message: `Updated ${ids.length} leads` }
  },

  bulk_add_tags: async (action, body) => {
    const ids = body.lead_ids as string[]; const newTags = body.tags as string[]
    if (!ids?.length || !newTags?.length) return { success: false, error: "No lead_ids or tags provided" }
    const existing = throwOnError(await supabase.from("leads").select("lead_id, tags").in("lead_id", ids)) as { lead_id: string; tags: string }[]
    const updates = existing.map((lead) => {
      const current = lead.tags ? lead.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : []
      const merged = [...new Set([...current, ...newTags])].join(",")
      return { lead_id: lead.lead_id, tags: merged }
    })
    const BATCH = 500
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH)
      const { error } = await supabase.from("leads").upsert(batch, { onConflict: "lead_id" })
      if (error) throw new Error(error.message)
    }
    return { success: true, action, message: `Added tags to ${ids.length} leads` }
  },

  bulk_remove_tags: async (action, body) => {
    const ids = body.lead_ids as string[]; const removeTags = body.tags as string[]
    if (!ids?.length || !removeTags?.length) return { success: false, error: "No lead_ids or tags provided" }
    const existing = throwOnError(await supabase.from("leads").select("lead_id, tags").in("lead_id", ids)) as { lead_id: string; tags: string }[]
    const updates = existing.map((lead) => {
      const current = lead.tags ? lead.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : []
      const filtered = current.filter((t: string) => !removeTags.includes(t))
      return { lead_id: lead.lead_id, tags: filtered.join(",") }
    })
    const BATCH = 500
    for (let i = 0; i < updates.length; i += BATCH) { await supabase.from("leads").upsert(updates.slice(i, i + BATCH), { onConflict: "lead_id" }) }
    return { success: true, action, message: `Removed tags from ${ids.length} leads` }
  },

  delete_leads: async (action, body) => {
    const ids = body.lead_ids as string[]
    if (!ids?.length) return { success: false, error: "No lead_ids provided" }
    const { error } = await supabase.from("leads").delete().in("lead_id", ids)
    if (error) throw new Error(error.message)
    return { success: true, action, message: `Deleted ${ids.length} leads` }
  },

  reset_all_leads: async (action) => {
    const { error } = await supabase.from("leads").update({
      sequence_id: "", current_step: "", status: "new", total_score: "0", ranking_tier: "", tags: "", next_action_date: "", last_platform_sent: "", messages_generated: "",
    }).neq("lead_id", "")
    if (error) throw new Error(error.message)
    return { success: true, action, message: "All leads reset to fresh state" }
  },

  update_lead: async (action, body) => {
    const lid = String(body.lead_id || "")
    if (!lid) return { success: false, error: "Missing lead_id" }
    const updates: Record<string, string> = {}
    for (const [k, v] of Object.entries(body)) { if (k !== "action" && k !== "lead_id") updates[k] = String(v ?? "") }
    await supabase.from("leads").update(updates).eq("lead_id", lid)
    return { success: true, action, message: `Lead ${lid} updated` }
  },

  update_lead_after_send: async (action, body) => {
    const leadId = String(body.lead_id || "")
    if (!leadId) return { success: false, error: "Missing lead_id" }
    const updates: Record<string, string> = { last_platform_sent: String(body.platform || "") }
    if (body.next_step) updates.current_step = String(body.next_step)
    if (body.next_action_date) updates.next_action_date = String(body.next_action_date)
    if (body.sequence_complete === true) updates.status = "sequence_complete"
    const { error } = await supabase.from("leads").update(updates).eq("lead_id", leadId)
    if (error) return { success: false, error: error.message }
    return { success: true, action, message: `Lead ${leadId} updated after send` }
  },

  get_lead_filters: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let listCountResult: { data: Record<string, number> } | null = null
    try { const r = await supabase.rpc("get_list_counts"); if (r.data) listCountResult = { data: r.data } } catch { /* */ }
    let statusQuery = supabase.from("leads").select("status")
    let tagQuery = supabase.from("leads").select("tags")
    if (businessId) { statusQuery = statusQuery.eq("business_id", businessId); tagQuery = tagQuery.eq("business_id", businessId) }
    const [statusResult, tagResult] = await Promise.all([statusQuery, tagQuery])
    const statuses = new Set<string>(); const tags = new Set<string>()
    const statusCounts: Record<string, number> = {}
    if (statusResult.data) { for (const row of statusResult.data) { if (row.status) { statuses.add(row.status); statusCounts[row.status] = (statusCounts[row.status] || 0) + 1 } } }
    if (tagResult.data) { for (const row of tagResult.data) { if (row.tags) { row.tags.split(",").map((t: string) => t.trim()).filter(Boolean).forEach((t: string) => tags.add(t)) } } }
    let listCounts: Record<string, number> = {}
    if (listCountResult?.data) listCounts = listCountResult.data
    return { success: true, action, data: { statuses: [...statuses].sort(), tags: [...tags].sort(), listCounts, statusCounts } }
  },

  get_lead_detail: async (action, body) => {
    const leadId = String(body.lead_id || "")
    if (!leadId) return { success: false, error: "Missing lead_id" }
    const { data: lead, error: leadError } = await supabase.from("leads").select("*").eq("lead_id", leadId).single()
    if (leadError) return { success: false, error: leadError.message }
    const messages = throwOnError(await supabase.from("messages").select("*").eq("lead_id", leadId).order("step_number", { ascending: true }))
    const logs = throwOnError(await supabase.from("outreach_log").select("*").eq("lead_id", leadId).order("sent_at", { ascending: false }))
    return { success: true, action, data: { lead, messages, logs } }
  },

  get_lead_messages: async (action, body) => {
    const leadId = String(body.lead_id || ""); const businessId = body.business_id as string | undefined
    if (!leadId) return { success: false, error: "Missing lead_id" }
    let query = supabase.from("messages").select("*").eq("lead_id", leadId)
    if (businessId) query = query.eq("business_id", businessId)
    const data = throwOnError(await query)
    return { success: true, action, data, count: data.length }
  },

  get_lead_log: async (action, body) => {
    const leadId = String(body.lead_id || ""); const businessId = body.business_id as string | undefined
    if (!leadId) return { success: false, error: "Missing lead_id" }
    let query = supabase.from("outreach_log").select("*").eq("lead_id", leadId)
    if (businessId) query = query.eq("business_id", businessId)
    const data = throwOnError(await query)
    return { success: true, action, data, count: data.length }
  },

  get_lead_status_counts: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let statusQuery = supabase.from("leads").select("status")
    if (businessId) statusQuery = statusQuery.eq("business_id", businessId)
    const { data, error } = await statusQuery
    if (error) throw new Error(error.message)
    const counts: Record<string, number> = {}
    ;(data || []).forEach((row: { status: string }) => { counts[row.status] = (counts[row.status] || 0) + 1 })
    return { success: true, action, data: counts }
  },

  get_platform_profile_counts: async (action) => {
    const rows = throwOnError(await supabase.from("leads").select("platform_profile")) as { platform_profile: string }[]
    const counts: Record<string, number> = {}
    for (const row of rows) { const p = row.platform_profile || "none"; counts[p] = (counts[p] || 0) + 1 }
    return { success: true, action, data: counts }
  },

  get_scheduled_leads: async (action, body) => {
    const businessId = body.business_id as string | undefined
    const today = new Date().toISOString().split("T")[0]
    let query = supabase.from("leads").select("lead_id, name, sequence_id, current_step, next_action_date, status, business_id, instagram_url, facebook_url, linkedin_url, email, phone").eq("status", "in_sequence").lte("next_action_date", today).not("sequence_id", "is", null).order("next_action_date", { ascending: true }).limit(1000)
    if (businessId) query = query.eq("business_id", businessId)
    const data = throwOnError(await query)
    return { success: true, action, data, count: data.length }
  },

  get_pipeline_leads: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let query = supabase.from("leads").select("lead_id, name, city, business_type, total_score, ranking_tier, status, pipeline_stage, tags, last_contacted_at, instagram_url, email, phone").order("total_score", { ascending: false }).limit(1000)
    if (businessId) query = query.eq("business_id", businessId)
    const data = throwOnError(await query)
    return { success: true, action, data }
  },

  update_pipeline_stage: async (action, body) => {
    const leadId = String(body.lead_id || ""); const stage = String(body.pipeline_stage || "new")
    if (!leadId) return { success: false, error: "Missing lead_id" }
    await supabase.from("leads").update({ pipeline_stage: stage }).eq("lead_id", leadId)
    return { success: true, action, message: `Lead ${leadId} moved to ${stage}` }
  },

  get_follow_up_leads: async (action, body) => {
    const businessId = body.business_id as string | undefined; const minDays = (body.min_days as number) || 5
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - minDays)
    let query = supabase.from("leads").select("lead_id, name, city, status, instagram_url, email, follow_up_count, last_contacted_at, sequence_id").in("status", ["in_sequence", "completed", "messages_ready"]).not("status", "eq", "responded").lt("last_contacted_at", cutoff.toISOString()).not("last_contacted_at", "is", null).order("last_contacted_at", { ascending: true }).limit(200)
    if (businessId) query = query.eq("business_id", businessId)
    const leads = throwOnError(await query) as Record<string, unknown>[]
    const now = Date.now()
    const result = leads.map((l) => ({ ...l, days_since_contact: Math.floor((now - new Date(l.last_contacted_at as string).getTime()) / 86400000) }))
    return { success: true, action, data: result }
  },

  queue_follow_up: async (action, body) => {
    const leadId = body.lead_id as string
    if (!leadId) return { success: false, error: "Missing lead_id" }
    const { data: lead } = await supabase.from("leads").select("follow_up_count, name").eq("lead_id", leadId).single()
    const newCount = ((lead?.follow_up_count as number) || 0) + 1
    await supabase.from("leads").update({ follow_up_count: newCount, status: "in_sequence" }).eq("lead_id", leadId)
    return { success: true, action, data: { lead_id: leadId, follow_up_count: newCount } }
  },

  get_responded_leads: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let query = supabase.from("leads").select("lead_id, name, city, status, instagram_url, email, response_category, notes, tags").in("status", ["responded", "booked", "proposal_sent", "closed"]).order("scraped_at", { ascending: false }).limit(500)
    if (businessId) query = query.eq("business_id", businessId)
    const leads = throwOnError(await query)
    return { success: true, action, data: leads }
  },

  mark_lead_responded: async (action, body) => {
    const leadId = String(body.lead_id || ""); const platform = String(body.platform || ""); const sentiment = String(body.sentiment || "neutral")
    if (!leadId) return { success: false, error: "Missing lead_id" }
    await supabase.from("leads").update({ status: "responded", responded_at: new Date().toISOString(), response_platform: platform, response_sentiment: sentiment }).eq("lead_id", leadId)
    return { success: true, action, message: `Lead ${leadId} marked as responded` }
  },

  log_scoring_change: async (action, body) => {
    const entry = { log_id: `score_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, lead_id: String(body.lead_id || ""), business_name: String(body.business_name || ""), sequence_step: "", platform: "", action: "score_change", status: String(body.change_type || "bump"), sent_at: new Date().toISOString(), error_note: String(body.reason || ""), account_id: "" }
    await supabase.from("outreach_log").insert(entry)
    return { success: true, action, message: "Scoring change logged" }
  },

  get_lead_activity: async (action, body) => {
    const leadId = String(body.lead_id || "")
    if (!leadId) return { success: false, error: "Missing lead_id" }
    const limit = Number(body.limit) || 50
    const { data, error } = await supabase.from("lead_activity").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(limit)
    if (error) throw new Error(error.message)
    return { success: true, action, data: data || [] }
  },

  add_lead_note: async (action, body) => {
    const leadId = String(body.lead_id || ""); const content = String(body.content || "")
    if (!leadId || !content) return { success: false, error: "Missing lead_id or content" }
    const { data, error } = await supabase.from("lead_activity").insert({ lead_id: leadId, activity_type: "note", content, account_used: String(body.account_used || ""), va_name: String(body.va_name || ""), business_id: (body.business_id as string) || "default" }).select().single()
    if (error) throw new Error(error.message)
    return { success: true, action, data }
  },

  log_lead_activity: async (action, body) => {
    const leadId = String(body.lead_id || ""); const activityType = String(body.activity_type || "")
    if (!leadId || !activityType) return { success: false, error: "Missing lead_id or activity_type" }
    const { error } = await supabase.from("lead_activity").insert({ lead_id: leadId, activity_type: activityType, content: String(body.content || ""), account_used: String(body.account_used || ""), va_name: String(body.va_name || ""), business_id: (body.business_id as string) || "default" })
    if (error) throw new Error(error.message)
    return { success: true, action, message: "Activity logged" }
  },

  // Smart Lists
  get_smart_lists: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let query = supabase.from("smart_lists").select("*")
    if (businessId) query = query.eq("business_id", businessId)
    let data = throwOnError(await query)
    if (data.length === 0) {
      const defaults = [
        { list_id: "sl_hot", name: "Hot Leads", emoji: "🔥", filters: { ranking_tier: "A" }, color: "red" },
        { list_id: "sl_followup", name: "Needs Follow-Up", emoji: "📨", filters: { status: "in_sequence", days_since_contact: 3 }, color: "orange" },
        { list_id: "sl_responded", name: "Responded", emoji: "💬", filters: { status: "responded" }, color: "green" },
        { list_id: "sl_new", name: "Never Contacted", emoji: "🆕", filters: { status: "new" }, color: "blue" },
        { list_id: "sl_enterprise", name: "Enterprise (Skip)", emoji: "🏢", filters: { ranking_tier: "X", tags_contains: "enterprise" }, color: "purple" },
      ]
      const rows = defaults.map((d) => ({ ...d, filters: JSON.stringify(d.filters), description: "", notes: "", created_at: new Date().toISOString(), business_id: businessId || "default" }))
      await supabase.from("smart_lists").insert(rows)
      data = throwOnError(await supabase.from("smart_lists").select("*").eq("business_id", businessId || "default"))
    }
    return { success: true, action, data, count: data.length }
  },

  create_smart_list: async (action, body) => {
    const listId = `list_${Date.now()}`
    const row = { list_id: listId, name: String(body.name || ""), emoji: String(body.emoji || "📋"), description: String(body.description || ""), notes: String(body.notes || ""), filters: body.filters ? JSON.stringify(body.filters) : "{}", color: String(body.color || "purple"), created_at: new Date().toISOString(), business_id: (body.business_id as string) || "default" }
    throwOnError(await supabase.from("smart_lists").insert(row))
    return { success: true, action, data: row }
  },

  update_smart_list: async (action, body) => {
    const lid = String(body.list_id || "")
    if (!lid) return { success: false, error: "Missing list_id" }
    const updates: Record<string, string> = {}
    for (const [k, v] of Object.entries(body)) { if (k !== "action" && k !== "list_id") updates[k] = String(v ?? "") }
    await supabase.from("smart_lists").update(updates).eq("list_id", lid)
    return { success: true, action, message: `Smart list ${lid} updated` }
  },

  delete_smart_lists: async (action, body) => {
    const ids = body.list_ids as string[]
    if (!ids?.length) return { success: false, error: "No list_ids provided" }
    await supabase.from("smart_lists").delete().in("list_id", ids)
    return { success: true, action, message: `Deleted ${ids.length} smart lists` }
  },

  assign_smart_list: async (action, body) => {
    const leadIds = body.lead_ids as string[]; const listId = String(body.list_id ?? "")
    if (!leadIds?.length) return { success: false, error: "No lead_ids provided" }
    await supabase.from("leads").update({ smart_list: listId }).in("lead_id", leadIds)
    return { success: true, action, message: `Assigned ${leadIds.length} leads to list ${listId}` }
  },
}

export default handlers
