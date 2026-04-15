import { supabase, throwOnError } from "./helpers"
import type { ActionHandler } from "../types"

const handlers: Record<string, ActionHandler> = {
  get_dashboard: async (action, body) => {
    const businessId = body.business_id as string | undefined

    const leadsQuery = () => {
      const q = supabase.from("leads").select("*", { count: "exact", head: true })
      return businessId ? q.eq("business_id", businessId) : q
    }
    const messagesQuery = () => {
      const q = supabase.from("messages").select("*", { count: "exact", head: true })
      return businessId ? q.eq("business_id", businessId) : q
    }

    const [
      { count: totalLeads },
      { count: activeLeads },
      { count: respondedCount },
      { count: contactedCount },
      { count: pendingMessages },
    ] = await Promise.all([
      leadsQuery(),
      leadsQuery().eq("status", "in_sequence"),
      leadsQuery().or("status.eq.responded,status.eq.booked"),
      leadsQuery().not("status", "in", '("new","messages_ready")'),
      messagesQuery().eq("status", "pending_approval"),
    ])

    const today = new Date().toISOString().split("T")[0]
    let todayLogsQuery = supabase.from("outreach_log").select("*").like("sent_at", `${today}%`)
    if (businessId) todayLogsQuery = todayLogsQuery.eq("business_id", businessId)
    const todayLogs = throwOnError(await todayLogsQuery)
    const totalSends = todayLogs.length

    let accountsQuery = supabase.from("accounts").select("*")
    if (businessId) accountsQuery = accountsQuery.eq("business_id", businessId)
    const accounts = throwOnError(await accountsQuery)
    let settingsQuery = supabase.from("settings").select("*")
    if (businessId) settingsQuery = settingsQuery.eq("business_id", businessId)
    const settingsRows = throwOnError(await settingsQuery)
    const settingsMap: Record<string, string> = {}
    settingsRows.forEach((r: { setting_name: string; setting_value: string }) => {
      if (r.setting_name) settingsMap[r.setting_name] = r.setting_value
    })

    const contacted = contactedCount || 0
    const responded = respondedCount || 0

    const platforms = ["linkedin", "instagram", "facebook", "email"]
    const platformStats = platforms.map((p) => {
      const pAccounts = accounts.filter((a: { platform: string }) => a.platform === p)
      const pSends = todayLogs.filter((l: { platform: string }) => l.platform?.toLowerCase().includes(p)).length
      const limit = pAccounts.reduce((sum: number, a: { daily_limit: string }) => sum + (parseInt(a.daily_limit) || 0), 0) ||
        parseInt(settingsMap[`${p}_daily_limit`]) || 30
      return { platform: p, sends_today: pSends, daily_limit: limit, accounts: pAccounts.length }
    })

    return {
      success: true, action,
      data: {
        total_leads: totalLeads || 0,
        active_leads: activeLeads || 0,
        today_sends: totalSends,
        today_limit: platformStats.reduce((s, p) => s + p.daily_limit, 0),
        response_rate: contacted > 0 ? Math.round((responded / contacted) * 100) : 0,
        messages_pending: pendingMessages || 0,
        platform_stats: platformStats,
      },
    }
  },

  get_analytics: async (action, body) => {
    const businessId = body.business_id as string | undefined
    const days = Number(body.days) || 30

    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceStr = since.toISOString()

    let logQuery = supabase.from("outreach_log").select("*").gte("sent_at", sinceStr)
    if (businessId) logQuery = logQuery.eq("business_id", businessId)
    const logs = throwOnError(await logQuery)

    const dailySends: Record<string, number> = {}
    const platformCounts: Record<string, number> = {}
    const statusCounts: Record<string, number> = {}
    const sequenceCounts: Record<string, { sent: number; responded: number }> = {}

    for (const log of logs) {
      const day = (log.sent_at || "").slice(0, 10)
      dailySends[day] = (dailySends[day] || 0) + 1
      const p = (log.platform || "unknown").toLowerCase()
      platformCounts[p] = (platformCounts[p] || 0) + 1
      const s = log.status || "unknown"
      statusCounts[s] = (statusCounts[s] || 0) + 1
    }

    const platformStats: Record<string, { sent: number; responded: number }> = {}
    for (const log of logs) {
      const p = (log.platform || "unknown").toLowerCase()
      if (!platformStats[p]) platformStats[p] = { sent: 0, responded: 0 }
      if (log.status === "sent") platformStats[p].sent++
      if (log.status === "responded") platformStats[p].responded++
    }

    let msgsQuery = supabase.from("messages").select("sequence_id, status")
    if (businessId) msgsQuery = msgsQuery.eq("business_id", businessId)
    const msgs = throwOnError(await msgsQuery)
    for (const m of msgs) {
      const sid = m.sequence_id || "unknown"
      if (!sequenceCounts[sid]) sequenceCounts[sid] = { sent: 0, responded: 0 }
      if (m.status === "sent") sequenceCounts[sid].sent++
    }

    return {
      success: true, action,
      data: {
        daily_sends: dailySends, platform_counts: platformCounts,
        status_counts: statusCounts, platform_stats: platformStats,
        sequence_stats: sequenceCounts, total_logs: logs.length,
      },
    }
  },

  get_activity: async (action, body) => {
    const limit = Number(body.limit) || 20
    const businessId = body.business_id as string | undefined
    let query = supabase.from("activity").select("*", { count: "exact" }).order("created_at", { ascending: false }).limit(limit)
    if (businessId) query = query.eq("business_id", businessId)
    const { data, count } = await query
    return { success: true, action, data: data || [], count: count || 0 }
  },

  get_today_sends: async (action) => {
    const today = new Date().toISOString().split("T")[0]
    const { data: logs, error } = await supabase
      .from("outreach_log").select("platform, status, sent_at").like("sent_at", `${today}%`).eq("status", "sent")
    if (error) return { success: false, error: error.message }
    const byPlatform: Record<string, number> = {}
    for (const log of logs || []) {
      const p = log.platform || "unknown"
      byPlatform[p] = (byPlatform[p] || 0) + 1
    }
    return { success: true, action, data: { total: (logs || []).length, by_platform: byPlatform } }
  },

  get_response_stats: async (action) => {
    const { count: totalResponses } = await supabase.from("responses").select("*", { count: "exact", head: true })
    const { count: positiveResponses } = await supabase.from("responses").select("*", { count: "exact", head: true }).eq("sentiment", "positive")
    const { count: interestedResponses } = await supabase.from("responses").select("*", { count: "exact", head: true }).eq("response_type", "interested")
    const { count: totalSent } = await supabase.from("outreach_log").select("*", { count: "exact", head: true }).eq("status", "sent")
    const responseRate = totalSent && totalSent > 0 ? ((totalResponses || 0) / totalSent * 100).toFixed(1) : "0.0"
    return {
      success: true, action,
      data: {
        total_responses: totalResponses || 0, positive_responses: positiveResponses || 0,
        interested_responses: interestedResponses || 0, total_sent: totalSent || 0, response_rate: responseRate,
      }
    }
  },

  get_ab_tests: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let query = supabase.from("ab_tests").select("*")
    if (businessId) query = query.eq("business_id", businessId)
    const data = throwOnError(await query)
    return { success: true, action, data, count: data.length }
  },

  create_ab_test: async (action, body) => {
    const testId = `ab_${Date.now()}`
    const row = {
      test_id: testId, test_name: String(body.test_name || ""), test_type: String(body.test_type || "sequence"),
      status: "active", variant_a_name: String(body.variant_a_name || "Variant A"),
      variant_a_config: String(body.variant_a_config || ""), variant_b_name: String(body.variant_b_name || "Variant B"),
      variant_b_config: String(body.variant_b_config || ""), variant_a_leads: "0", variant_b_leads: "0",
      variant_a_responses: "0", variant_b_responses: "0", variant_a_rate: "0", variant_b_rate: "0",
      winner: "", created_at: new Date().toISOString(), ended_at: "",
      business_id: (body.business_id as string) || "default",
    }
    throwOnError(await supabase.from("ab_tests").insert(row))
    return { success: true, action, data: row }
  },

  delete_ab_tests: async (action, body) => {
    const ids = body.test_ids as string[]
    if (!ids?.length) return { success: false, error: "No test_ids provided" }
    await supabase.from("ab_tests").delete().in("test_id", ids)
    return { success: true, action, message: `Deleted ${ids.length} A/B tests` }
  },

  get_ab_test_results: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let approachQuery = supabase.from("approaches").select("*")
    if (businessId) approachQuery = approachQuery.eq("business_id", businessId)
    const approaches = throwOnError(await approachQuery)

    let msgsQuery = supabase.from("messages").select("approach_id, status")
    if (businessId) msgsQuery = msgsQuery.eq("business_id", businessId)
    const msgs = throwOnError(await msgsQuery)

    const results: Record<string, { sent: number; responded: number; total: number }> = {}
    for (const m of msgs) {
      const aid = m.approach_id || "unknown"
      if (!results[aid]) results[aid] = { sent: 0, responded: 0, total: 0 }
      results[aid].total++
      if (m.status === "sent") results[aid].sent++
      if (m.status === "responded") results[aid].responded++
    }
    return { success: true, action, data: { approaches, results } }
  },

  get_approaches: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let query = supabase.from("approaches").select("*")
    if (businessId) query = query.eq("business_id", businessId)
    const data = throwOnError(await query)
    return { success: true, action, data, count: data.length }
  },

  create_approach: async (action, body) => {
    const approachId = `approach-${Date.now()}`
    const row = {
      approach_id: String(body.approach_id || approachId), name: String(body.name || ""),
      description: String(body.description || ""), prompt_file: String(body.prompt_file || ""),
      version: String(body.version || "1"), status: "active",
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      business_id: (body.business_id as string) || "default",
    }
    throwOnError(await supabase.from("approaches").insert(row))
    return { success: true, action, data: row }
  },

  update_approach: async (action, body) => {
    const aid = String(body.approach_id || "")
    if (!aid) return { success: false, error: "Missing approach_id" }
    const updates: Record<string, string> = {}
    for (const [k, v] of Object.entries(body)) {
      if (k !== "action" && k !== "approach_id") updates[k] = String(v ?? "")
    }
    updates.updated_at = new Date().toISOString()
    await supabase.from("approaches").update(updates).eq("approach_id", aid)
    return { success: true, action, message: `Approach ${aid} updated` }
  },

  get_outreach_log: async (action, body) => {
    const platform = body.platform as string | undefined
    const status = body.status as string | undefined
    const limit = Number(body.limit) || 100
    const businessId = body.business_id as string | undefined

    let query = supabase.from("outreach_log").select("*")
    if (businessId) query = query.eq("business_id", businessId)
    if (platform && platform !== "all") query = query.eq("platform", platform)
    if (status && status !== "all") query = query.eq("status", status)
    query = query.order("sent_at", { ascending: false }).limit(limit)
    const data = throwOnError(await query)
    return { success: true, action, data, count: data.length }
  },

  get_log: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let query = supabase.from("outreach_log").select("*")
    if (businessId) query = query.eq("business_id", businessId)
    const data = throwOnError(await query)
    return { success: true, action, data, count: data.length }
  },

  get_outreach_feed: async (action, body) => {
    const limit = Number(body.limit) || 50
    const businessId = body.business_id as string | undefined
    const since = body.since as string | undefined
    let query = supabase.from("outreach_log").select("*").order("sent_at", { ascending: false }).limit(limit)
    if (businessId) query = query.eq("business_id", businessId)
    if (since) query = query.gt("sent_at", since)
    const data = throwOnError(await query)
    return { success: true, action, data, count: data.length }
  },

  get_warmup_status: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let query = supabase.from("outreach_accounts").select("*").eq("status", "warming")
    if (businessId) query = query.eq("business_id", businessId)
    const accounts = throwOnError(await query)

    const today = new Date().toISOString().split("T")[0]
    const accountStatuses = []

    for (const acct of accounts) {
      const { count } = await supabase.from("outreach_log").select("*", { count: "exact", head: true })
        .eq("account_id", acct.account_id).eq("status", "sent").gte("sent_at", `${today}T00:00:00`)

      const warmupStarted = acct.warmup_started_at || acct.created_at || new Date().toISOString()
      const daysSinceStart = Math.floor((Date.now() - new Date(warmupStarted).getTime()) / 86400000) + 1
      let dailyLimit = 5
      if (daysSinceStart >= 14) dailyLimit = 30
      else if (daysSinceStart >= 7) dailyLimit = 20
      else if (daysSinceStart >= 3) dailyLimit = 10

      accountStatuses.push({
        ...acct, warmup_day: daysSinceStart, warmup_total_days: 14,
        warmup_daily_limit: dailyLimit, sends_today_actual: count || 0, warmup_complete: daysSinceStart >= 14,
      })
    }
    return { success: true, action, data: accountStatuses }
  },

  update_warmup_settings: async (action, body) => {
    const businessId = (body.business_id as string) || "default"
    const schedule = body.warmup_schedule as string | undefined
    if (schedule) {
      await supabase.from("settings").upsert({ setting_name: "warmup_schedule", setting_value: schedule, business_id: businessId })
    }
    return { success: true, action, message: "Warmup settings updated" }
  },

  log_scoring_change: async (action, body) => {
    const entry = {
      log_id: `score_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      lead_id: String(body.lead_id || ""), business_name: String(body.business_name || ""),
      sequence_step: "", platform: "", action: "score_change",
      status: String(body.change_type || "bump"), sent_at: new Date().toISOString(),
      error_note: String(body.reason || ""), account_id: "",
    }
    await supabase.from("outreach_log").insert(entry)
    return { success: true, action, message: "Scoring change logged" }
  },

  log_response: async (action, body) => {
    const leadId = String(body.lead_id || "")
    const platform = String(body.platform || "")
    const responseType = String(body.response_type || "reply")
    const sentiment = String(body.sentiment || "neutral")
    const messagePreview = String(body.message_preview || "")
    const notes = String(body.notes || "")
    const logId = body.log_id as string | undefined

    if (!leadId || !platform) return { success: false, error: "Missing lead_id or platform" }

    const { data: response, error: insertError } = await supabase.from("responses").insert({
      lead_id: leadId, platform, response_type: responseType, sentiment, message_preview: messagePreview, notes, log_id: logId || null,
    }).select().single()
    if (insertError) return { success: false, error: insertError.message }

    await supabase.from("leads").update({
      status: "responded", responded_at: new Date().toISOString(), response_platform: platform,
      response_sentiment: sentiment, response_notes: notes || messagePreview.slice(0, 200),
    }).eq("lead_id", leadId)

    if (logId) {
      await supabase.from("outreach_log").update({
        response_received: true, response_at: new Date().toISOString(), response_type: responseType,
      }).eq("log_id", logId)
    }
    return { success: true, action, data: response, message: `Response logged for ${leadId}` }
  },

  get_responses: async (action, body) => {
    const leadId = body.lead_id as string | undefined
    const platform = body.platform as string | undefined
    const sentiment = body.sentiment as string | undefined
    const limit = Number(body.limit) || 100

    let query = supabase.from("responses").select("*")
    if (leadId) query = query.eq("lead_id", leadId)
    if (platform && platform !== "all") query = query.eq("platform", platform)
    if (sentiment && sentiment !== "all") query = query.eq("sentiment", sentiment)
    query = query.order("received_at", { ascending: false }).limit(limit)
    const data = throwOnError(await query)
    return { success: true, action, data, count: data.length }
  },

  log_error: async (action, body) => {
    const entry = {
      source: String(body.source || "unknown"), severity: String(body.severity || "error"),
      message: String(body.message || ""), details: body.details || null,
      lead_id: body.lead_id ? String(body.lead_id) : null,
      automation_id: body.automation_id ? String(body.automation_id) : null,
      job_id: body.job_id ? String(body.job_id) : null,
    }
    const { data, error } = await supabase.from("error_log").insert(entry).select().single()
    if (error) return { success: false, error: error.message }
    return { success: true, action, data }
  },

  get_errors: async (action, body) => {
    const source = body.source as string | undefined
    const severity = body.severity as string | undefined
    const includeResolved = body.include_resolved as boolean | undefined
    const limit = Number(body.limit) || 100
    let query = supabase.from("error_log").select("*").order("created_at", { ascending: false }).limit(limit)
    if (source && source !== "all") query = query.eq("source", source)
    if (severity && severity !== "all") query = query.eq("severity", severity)
    if (!includeResolved) query = query.eq("resolved", false)
    const { data, error } = await query
    if (error) return { success: false, error: error.message }
    return { success: true, action, data: data || [] }
  },

  resolve_error: async (action, body) => {
    const errorId = String(body.error_id || "")
    if (!errorId) return { success: false, error: "Missing error_id" }
    const { error } = await supabase.from("error_log").update({ resolved: true }).eq("id", errorId)
    if (error) return { success: false, error: error.message }
    return { success: true, action, message: `Error ${errorId} resolved` }
  },

  get_system_status: async (action) => {
    let status = null
    let alerts: unknown[] = []
    if (typeof window === "undefined") {
      try {
        const fs = await import("fs")
        const path = await import("path")
        const statusPath = path.join(process.cwd(), "..", "..", "..", "orchestrator", "system-status.json")
        const altPath = "/home/clawd/.openclaw/workspace/orchestrator/system-status.json"
        const alertsPath = "/home/clawd/.openclaw/workspace/orchestrator/alerts-queue.json"
        for (const p of [statusPath, altPath]) {
          try { if (fs.existsSync(p)) { status = JSON.parse(fs.readFileSync(p, "utf-8")); break } } catch { /* skip */ }
        }
        try { if (fs.existsSync(alertsPath)) { alerts = JSON.parse(fs.readFileSync(alertsPath, "utf-8")) } } catch { /* skip */ }
      } catch { /* fs not available */ }
    }
    return {
      success: true, action,
      data: {
        status: status || { lastMonitorRun: null, lastSenderRun: null, activeAlerts: 0, nextScheduledRuns: {} },
        alerts: Array.isArray(alerts) ? alerts.slice(-20) : [],
      },
    }
  },

  get_build_progress: async (action) => {
    const { data, error } = await supabase.from("build_progress").select("*").order("phase_order", { ascending: true })
    if (error) return { success: true, action, data: null, source: "default" }
    return { success: true, action, data, source: "supabase" }
  },

  // Outreach execution helpers
  check_send_eligibility: async (action, body) => {
    const platform = String(body.platform || "")
    const accountId = body.account_id as string | undefined
    const businessId = body.business_id as string | undefined

    let settingsQuery = supabase.from("settings").select("*")
    if (businessId) settingsQuery = settingsQuery.eq("business_id", businessId)
    const settingsRows = throwOnError(await settingsQuery)
    const settings: Record<string, string> = {}
    settingsRows.forEach((r: { setting_name: string; setting_value: string }) => { if (r.setting_name) settings[r.setting_name] = r.setting_value })

    const now = new Date()
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()
    const currentTime = `${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`
    const opStart = settings.operating_hours_start || "09:00"
    const opEnd = settings.operating_hours_end || "18:00"

    if (currentTime < opStart || currentTime > opEnd) {
      return { success: true, action, data: { eligible: false, reason: `Outside operating hours (${opStart} - ${opEnd})` } }
    }
    if (settings.paused === "TRUE") {
      return { success: true, action, data: { eligible: false, reason: "Outreach is paused in settings" } }
    }

    const platformLimitKey = `${platform.replace("_dm", "")}_daily_limit`
    const dailyLimit = parseInt(settings[platformLimitKey] || "30")
    const today = new Date().toISOString().split("T")[0]
    const { count: sendsToday } = await supabase.from("outreach_log").select("*", { count: "exact", head: true })
      .eq("platform", platform).eq("status", "sent").gte("sent_at", `${today}T00:00:00`)

    if ((sendsToday || 0) >= dailyLimit) {
      return { success: true, action, data: { eligible: false, reason: `Daily limit reached (${sendsToday}/${dailyLimit})` } }
    }

    if (accountId) {
      const { data: account } = await supabase.from("accounts").select("*").eq("account_id", accountId).single()
      if (account?.cooldown_until) {
        const cooldownUntil = new Date(account.cooldown_until)
        if (cooldownUntil > now) return { success: true, action, data: { eligible: false, reason: `Account on cooldown until ${cooldownUntil.toLocaleTimeString()}` } }
      }
      const accountSendsToday = parseInt(account?.sends_today || "0")
      const accountDailyLimit = parseInt(account?.daily_limit || "50")
      if (accountSendsToday >= accountDailyLimit) {
        return { success: true, action, data: { eligible: false, reason: `Account daily limit reached (${accountSendsToday}/${accountDailyLimit})` } }
      }
    }

    return {
      success: true, action,
      data: {
        eligible: true, sends_today: sendsToday || 0, daily_limit: dailyLimit,
        min_delay: parseInt(settings.min_delay_seconds || "180"), max_delay: parseInt(settings.max_delay_seconds || "480"),
      }
    }
  },

  log_send_attempt: async (action, body) => {
    const logEntry = {
      log_id: body.log_id || `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      lead_id: String(body.lead_id || ""), business_name: String(body.business_name || ""),
      sequence_step: String(body.sequence_step || body.step_number || ""),
      platform: String(body.platform || ""), action: String(body.action_type || "message"),
      status: String(body.status || "pending"), sent_at: body.sent_at || new Date().toISOString(),
      error_note: body.error_note || null, account_id: body.account_id || null,
    }
    const { data, error } = await supabase.from("outreach_log").insert(logEntry).select().single()
    if (error) return { success: false, error: error.message }
    return { success: true, action, data }
  },

  update_send_log: async (action, body) => {
    const logId = String(body.log_id || "")
    if (!logId) return { success: false, error: "Missing log_id" }
    const updates: Record<string, unknown> = {}
    if (body.status !== undefined) updates.status = body.status
    if (body.error_note !== undefined) updates.error_note = body.error_note
    if (body.sent_at !== undefined) updates.sent_at = body.sent_at
    const { error } = await supabase.from("outreach_log").update(updates).eq("log_id", logId)
    if (error) return { success: false, error: error.message }
    return { success: true, action, message: `Log ${logId} updated` }
  },

  get_send_queue: async (action, body) => {
    const platform = body.platform as string | undefined
    const limit = Number(body.limit) || 50
    const businessId = body.business_id as string | undefined

    let query = supabase.from("messages").select(`*, leads!inner(lead_id, name, instagram_url, facebook_url, linkedin_url, email, phone, status)`).eq("status", "approved")
    if (businessId) query = query.eq("business_id", businessId)
    if (platform && platform !== "all") query = query.eq("platform", platform)
    query = query.order("generated_at", { ascending: true }).limit(limit)
    const { data, error } = await query
    if (error) return { success: false, error: error.message }
    return { success: true, action, data: data || [], count: (data || []).length }
  },

  get_live_view_log: async (action, body) => {
    const profileId = body.profile_id as string | undefined
    const businessId = body.business_id as string | undefined
    const limit = Number(body.limit) || 100
    let query = supabase.from("outreach_log").select("*").order("sent_at", { ascending: true }).limit(limit)
    if (profileId) query = query.eq("profile_id", profileId)
    if (businessId) query = query.eq("business_id", businessId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return { success: true, action, data: data || [] }
  },

  get_outreach_automations: async (action) => {
    const { data, error } = await supabase.from("autobot_automations").select("*")
      .in("category", ["outreach", "dm", "follow", "connect", "message", "add_friend"]).order("name", { ascending: true })
    if (error) return { success: true, action, data: [] }
    return { success: true, action, data: data || [] }
  },

  queue_outreach_jobs: async (action, body) => {
    const messageIds = body.message_ids as string[]
    const businessId = body.business_id as string | undefined
    if (!messageIds?.length) return { success: false, error: "No message_ids" }
    const { data: msgs, error: fetchErr } = await supabase.from("messages").select("*").in("message_id", messageIds)
    if (fetchErr) throw new Error(fetchErr.message)
    const jobs = (msgs || []).map((msg: Record<string, unknown>) => ({
      lead_id: msg.lead_id, platform: msg.platform, job_type: msg.action || "dm",
      status: "queued", priority: 1, business_id: businessId, message_id: msg.message_id,
      created_at: new Date().toISOString(), retry_count: 0, max_retries: 3,
    }))
    if (jobs.length > 0) {
      const { error } = await supabase.from("job_queue").insert(jobs)
      if (error) throw new Error(error.message)
    }
    await supabase.from("messages").update({ status: "scheduled" }).in("message_id", messageIds)
    return { success: true, action, message: `Queued ${jobs.length} outreach jobs`, data: { jobs_queued: jobs.length } }
  },

  get_outreach_templates: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let query = supabase.from("outreach_templates").select("*").order("created_at", { ascending: false })
    if (businessId) query = query.eq("business_id", businessId)
    const templates = throwOnError(await query)
    return { success: true, action, data: templates }
  },

  create_outreach_template: async (action, body) => {
    const { business_id, name, category, body: templateBody, variant } = body as {
      business_id: string; name: string; category: string; body: string; variant: string
    }
    if (!name || !templateBody) return { success: false, error: "Name and body required" }
    const { data, error } = await supabase.from("outreach_templates").insert({
      business_id: business_id || "default", name, category: category || "Custom",
      body: templateBody, variant: variant || "A", sends: 0, responses: 0,
    }).select().single()
    if (error) throw new Error(error.message)
    return { success: true, action, data }
  },

  update_outreach_template: async (action, body) => {
    const templateId = body.template_id as string
    const updates = body.updates as Record<string, unknown>
    if (!templateId || !updates) return { success: false, error: "Missing template_id or updates" }
    const { error } = await supabase.from("outreach_templates").update(updates).eq("template_id", templateId)
    if (error) throw new Error(error.message)
    return { success: true, action }
  },

  delete_outreach_template: async (action, body) => {
    const templateId = body.template_id as string
    if (!templateId) return { success: false, error: "Missing template_id" }
    const { error } = await supabase.from("outreach_templates").delete().eq("template_id", templateId)
    if (error) throw new Error(error.message)
    return { success: true, action }
  },
}

export default handlers
