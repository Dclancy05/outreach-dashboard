import { supabase, throwOnError, logActivity, updateActivity, calculatePlatformScores } from "./helpers"
import type { ActionHandler } from "../types"

const handlers: Record<string, ActionHandler> = {
  trigger_scrape: async (action, body) => {
    const leadIds = body.lead_ids as string[]
    const platformsFilter = body.platforms as string[] | undefined
    if (!leadIds?.length) return { success: false, error: "No lead_ids provided" }

    const { data: leads, error: leadsError } = await supabase.from("leads").select("lead_id, name, city, state, website, instagram_url, facebook_url, linkedin_url").in("lead_id", leadIds)
    if (leadsError) throw new Error(leadsError.message)
    if (!leads?.length) return { success: false, error: "No leads found" }

    const { data: scrapeAutomations, error: autoError } = await supabase.from("autobot_automations").select("id, platform, name").eq("category", "scrape")
    if (autoError) throw new Error(autoError.message)
    const automationByPlatform: Record<string, string> = {}
    for (const a of scrapeAutomations || []) { if (a.platform) automationByPlatform[a.platform] = a.id }

    function extractIgUsername(url: string): string {
      try { const path = new URL(url).pathname.replace(/\/$/, ""); return path.split("/").filter(Boolean).pop() || "" }
      catch { return url.replace(/.*instagram\.com\//, "").replace(/[\/?].*/, "") }
    }

    const activityId = await logActivity("scrape", `Queuing scrape jobs for ${leads.length} leads`, { lead_ids: leadIds }, leads.length)
    const profileId = body.profile_id as string | undefined
    const shouldInclude = (p: string) => !platformsFilter || platformsFilter.includes(p)

    const jobs: Array<Record<string, unknown>> = []
    for (const lead of leads) {
      const baseJob = { status: "pending", priority: 1, job_type: "scrape", ...(profileId ? { profile_id: profileId } : {}), retry_count: 0, max_retries: 3 }
      if (lead.instagram_url && shouldInclude("instagram")) {
        const username = extractIgUsername(lead.instagram_url)
        jobs.push({ ...baseJob, lead_id: lead.lead_id, platform: "instagram", url: lead.instagram_url, automation_id: automationByPlatform["instagram"], variables: { username } })
      }
      if (lead.facebook_url && shouldInclude("facebook")) jobs.push({ ...baseJob, lead_id: lead.lead_id, platform: "facebook", url: lead.facebook_url, automation_id: automationByPlatform["facebook"], variables: { facebook_url: lead.facebook_url } })
      if (lead.linkedin_url && shouldInclude("linkedin")) jobs.push({ ...baseJob, lead_id: lead.lead_id, platform: "linkedin", url: lead.linkedin_url, automation_id: automationByPlatform["linkedin"], variables: { linkedin_url: lead.linkedin_url } })
      if (lead.website && shouldInclude("website")) jobs.push({ ...baseJob, lead_id: lead.lead_id, platform: "website", url: lead.website, automation_id: automationByPlatform["website"], variables: { website_url: lead.website } })
      if (shouldInclude("google")) {
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent((lead.name || "") + " " + (lead.city || "") + " " + (lead.state || ""))}`
        jobs.push({ ...baseJob, lead_id: lead.lead_id, platform: "google", url: searchUrl, automation_id: automationByPlatform["google"], variables: { business_name: lead.name || "", city: lead.city || "", state: lead.state || "" } })
      }
      if (shouldInclude("yelp")) {
        const searchUrl = `https://www.yelp.com/search?find_desc=${encodeURIComponent(lead.name || "")}&find_loc=${encodeURIComponent((lead.city || "") + " " + (lead.state || ""))}`
        jobs.push({ ...baseJob, lead_id: lead.lead_id, platform: "yelp", url: searchUrl, automation_id: automationByPlatform["yelp"], variables: { business_name: lead.name || "", city: lead.city || "", state: lead.state || "" } })
      }
    }
    if (jobs.length === 0) {
      await updateActivity(activityId, { status: "completed", summary: `No scrape-eligible URLs found for ${leads.length} leads`, details: { lead_ids: leadIds, jobs_created: 0 } })
      return { success: true, action, message: "No URLs found to scrape" }
    }
    const { error: insertError } = await supabase.from("job_queue").insert(jobs)
    if (insertError) { await updateActivity(activityId, { status: "failed", details: { error: insertError.message } }); throw new Error(insertError.message) }
    const byPlatform: Record<string, number> = {}
    for (const j of jobs) { byPlatform[j.platform as string] = (byPlatform[j.platform as string] || 0) + 1 }
    await updateActivity(activityId, { status: "completed", summary: `Queued ${jobs.length} scrape jobs for ${leads.length} leads`, details: { lead_ids: leadIds, jobs_created: jobs.length, by_platform: byPlatform } })
    return { success: true, action, message: `Queued ${jobs.length} scrape jobs`, data: { activity_id: activityId, jobs_created: jobs.length, by_platform: byPlatform } }
  },

  get_scraping_jobs: async (action, body) => {
    const status = body.status as string | undefined; const jobType = body.job_type as string | undefined
    const limit = Number(body.limit) || 50
    let query = supabase.from("job_queue").select("*").order("created_at", { ascending: false }).limit(limit)
    if (status) query = query.eq("status", status)
    if (jobType) query = query.eq("job_type", jobType)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return { success: true, action, data }
  },

  process_scraping_job: async (action, body) => {
    const jobId = body.job_id as string; const result = body.result as Record<string, unknown> | undefined; const error = body.error as string | undefined
    if (!jobId) return { success: false, error: "Missing job_id" }
    const { data: job, error: jobError } = await supabase.from("job_queue").select("*").eq("id", jobId).single()
    if (jobError || !job) return { success: false, error: "Job not found" }
    if (error) {
      const retryCount = (job.retry_count || 0) + 1
      if (retryCount < (job.max_retries || 3)) {
        await supabase.from("job_queue").update({ status: "pending", retry_count: retryCount, error }).eq("id", jobId)
      } else {
        await supabase.from("job_queue").update({ status: "failed", completed_at: new Date().toISOString(), error }).eq("id", jobId)
      }
      return { success: true, action, message: "Job marked as failed" }
    }
    if (result) {
      const { data: existingLead } = await supabase.from("leads").select("_raw_scrape_data").eq("lead_id", job.lead_id).single()
      let existingRaw: Record<string, unknown> = {}
      try { existingRaw = JSON.parse(existingLead?._raw_scrape_data || "{}") } catch { /* */ }
      const mergedRaw = { ...existingRaw, [job.platform]: result }
      const updates: Record<string, string> = {}
      if (result.followers || result.ig_followers || result.fb_followers || result.li_followers) updates.followers = String(result.followers || result.ig_followers || result.fb_followers || result.li_followers || "")
      if (result.bio || result.ig_bio) updates.bio = String(result.bio || result.ig_bio || "")
      if (result.engagement_rate || result.ig_engagement_rate) updates.engagement_rate = String(result.engagement_rate || result.ig_engagement_rate || "")
      updates._raw_scrape_data = JSON.stringify(mergedRaw); updates.scraped_at = new Date().toISOString()
      const scores = calculatePlatformScores(mergedRaw)
      if (Object.keys(scores).length > 0) { const rawWithScores = { ...mergedRaw, ...scores }; updates._raw_scrape_data = JSON.stringify(rawWithScores) }
      await supabase.from("leads").update(updates).eq("lead_id", job.lead_id)
      await supabase.from("scraping_results").insert({ job_id: jobId, lead_id: job.lead_id, platform: job.platform, raw_data: result })
    }
    await supabase.from("job_queue").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", jobId)
    return { success: true, action, message: "Job completed" }
  },

  get_job_queue: async (action, body) => {
    const status = body.status as string | undefined; const leadId = body.lead_id as string | undefined
    const jobType = body.job_type as string | undefined; const profileId = body.profile_id as string | undefined
    const businessId = body.business_id as string | undefined
    const limit = Number(body.limit) || 50
    let query = supabase.from("job_queue").select("*").order("created_at", { ascending: false }).limit(limit)
    if (status && status !== "all") query = query.eq("status", status)
    if (leadId) query = query.eq("lead_id", leadId)
    if (jobType) query = query.eq("job_type", jobType)
    if (profileId) query = query.eq("profile_id", profileId)
    if (businessId) query = query.eq("business_id", businessId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return { success: true, action, data: data || [], count: (data || []).length }
  },

  get_scraping_stats: async (action) => {
    const [pendingRes, runningRes, completedRes, failedRes] = await Promise.all([
      supabase.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "running"),
      supabase.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "completed"),
      supabase.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "failed"),
    ])
    return { success: true, action, data: { pending: pendingRes.count || 0, running: runningRes.count || 0, completed: completedRes.count || 0, failed: failedRes.count || 0, total: (pendingRes.count || 0) + (runningRes.count || 0) + (completedRes.count || 0) + (failedRes.count || 0) } }
  },

  save_scraping_result: async (action, body) => {
    const jobId = String(body.job_id || ""); const leadId = String(body.lead_id || "")
    const platform = String(body.platform || ""); const data = body.data as Record<string, unknown>
    if (!jobId || !leadId || !platform || !data) return { success: false, error: "Missing required fields" }
    const { error: insertError } = await supabase.from("scraping_results").insert({ job_id: jobId, lead_id: leadId, platform, data })
    if (insertError) return { success: false, error: insertError.message }
    await supabase.from("leads").update({ scraped_at: new Date().toISOString() }).eq("lead_id", leadId)
    await supabase.from("job_queue").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", jobId)
    return { success: true, action, message: `Scraping result saved for ${leadId}` }
  },

  queue_scrape_jobs: async (action, body) => {
    const leadIds = body.lead_ids as string[]; const businessId = body.business_id as string | undefined
    if (!leadIds?.length) return { success: false, error: "No lead_ids" }
    const { data: leads } = await supabase.from("leads").select("lead_id, instagram_url, facebook_url, linkedin_url").in("lead_id", leadIds)
    const jobs: Array<Record<string, unknown>> = []
    for (const lead of leads || []) {
      if (lead.instagram_url) jobs.push({ lead_id: lead.lead_id, platform: "instagram", url: lead.instagram_url, status: "pending", priority: 1, job_type: "scrape", business_id: businessId, retry_count: 0, max_retries: 3 })
      if (lead.facebook_url) jobs.push({ lead_id: lead.lead_id, platform: "facebook", url: lead.facebook_url, status: "pending", priority: 2, job_type: "scrape", business_id: businessId, retry_count: 0, max_retries: 3 })
      if (lead.linkedin_url) jobs.push({ lead_id: lead.lead_id, platform: "linkedin", url: lead.linkedin_url, status: "pending", priority: 3, job_type: "scrape", business_id: businessId, retry_count: 0, max_retries: 3 })
    }
    if (jobs.length > 0) { const { error } = await supabase.from("job_queue").insert(jobs); if (error) throw new Error(error.message) }
    return { success: true, action, message: `Queued ${jobs.length} scrape jobs`, data: { jobs_created: jobs.length } }
  },

  clear_completed_jobs: async (action) => {
    const { error } = await supabase.from("job_queue").delete().eq("status", "completed")
    if (error) return { success: false, error: error.message }
    return { success: true, action, message: "Completed jobs cleared" }
  },

  toggle_queue_pause: async (action, body) => {
    const profileId = body.profile_id as string
    if (!profileId) return { success: false, error: "Missing profile_id" }
    const { data: profile } = await supabase.from("chrome_profiles").select("paused").eq("profile_id", profileId).single()
    const newPaused = !(profile?.paused || false)
    await supabase.from("chrome_profiles").update({ paused: newPaused }).eq("profile_id", profileId)
    return { success: true, action, message: `Queue ${newPaused ? "paused" : "resumed"}` }
  },
}

export default handlers
