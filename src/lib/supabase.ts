import { createClient } from "@supabase/supabase-js"
import { getLeadPlatforms, getSequencePlatforms, profileKey, generateVariantSteps, parseStepPlatformAction, isNonMessageAction } from "./platform-profile"
import type { Lead, Sequence } from "@/types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

// ─── Helpers ────────────────────────────────────────────────────────

function throwOnError<T>(result: { data: T | null; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []) as NonNullable<T>
}

// ─── Platform Score Calculation ─────────────────────────────────────

function calculatePlatformScores(data: Record<string, unknown>): Record<string, number> {
  const scores: Record<string, number> = {}

  // Flatten: data may be { instagram: { ig_followers: ... }, ig_followers: ... }
  const flat: Record<string, unknown> = { ...data }
  for (const key of Object.keys(data)) {
    if (typeof data[key] === "object" && data[key] !== null && !Array.isArray(data[key])) {
      Object.assign(flat, data[key] as Record<string, unknown>)
    }
  }

  // Instagram: 0-5 based on followers + engagement + posting activity
  const igFollowers = Number(flat.ig_followers) || 0
  if (igFollowers > 0) {
    let s = 0
    if (igFollowers > 100) s++
    if (igFollowers > 500) s++
    if (igFollowers > 2000) s++
    if (Number(flat.ig_engagement_rate) > 2) s++
    if (Number(flat.ig_posts_count) > 10) s++
    scores.ig_score = Math.min(s, 5)
  }

  // Facebook: 0-5 based on followers/likes + about section + posting
  const fbFollowers = Number(flat.fb_followers) || Number(flat.fb_likes) || 0
  if (fbFollowers > 0) {
    let s = 0
    if (fbFollowers > 50) s++
    if (fbFollowers > 500) s++
    if (fbFollowers > 2000) s++
    if (flat.fb_about) s++
    if (flat.fb_last_post) s++
    scores.fb_score = Math.min(s, 5)
  }

  // LinkedIn: 0-5 based on followers + description + employee count + posting
  const liFollowers = Number(flat.li_followers) || 0
  if (liFollowers > 0 || flat.li_description) {
    let s = 0
    if (liFollowers > 50) s++
    if (liFollowers > 500) s++
    if (flat.li_description) s++
    if (Number(flat.li_employee_count) > 5) s++
    if (flat.li_last_post) s++
    scores.li_score = Math.min(s, 5)
  }

  // Total score: weighted average of available platforms + Google/Yelp bonus
  const platformScores: number[] = []
  if (scores.ig_score != null) platformScores.push(scores.ig_score)
  if (scores.fb_score != null) platformScores.push(scores.fb_score)
  if (scores.li_score != null) platformScores.push(scores.li_score)

  let totalScore = platformScores.length > 0
    ? platformScores.reduce((a, b) => a + b, 0) / platformScores.length
    : 0

  // Google reviews bonus: +0.5 per star average (max +2.5)
  const googleRating = Number(flat.google_rating) || 0
  if (googleRating > 0) totalScore += Math.min(googleRating * 0.5, 2.5)

  // Yelp bonus: +0.5 per star (max +2.5)
  const yelpRating = Number(flat.yelp_rating) || 0
  if (yelpRating > 0) totalScore += Math.min(yelpRating * 0.5, 2.5)

  // Website bonus: +1 for having online booking
  if (flat.website_has_online_booking === true) totalScore += 1

  scores.total_score = Math.round(Math.min(totalScore, 10) * 10) / 10

  return scores
}

// ─── Activity Logging ───────────────────────────────────────────────

async function logActivity(type: string, summary: string, details: Record<string, unknown> = {}, leadCount = 0, businessId = "default"): Promise<string> {
  const activityId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  throwOnError(
    await supabase.from("activity").insert({
      activity_id: activityId,
      type,
      status: "processing",
      summary,
      details: JSON.stringify(details),
      lead_count: String(leadCount),
      created_at: new Date().toISOString(),
      completed_at: "",
      business_id: businessId,
    })
  )
  return activityId
}

async function updateActivity(activityId: string, updates: { status?: string; summary?: string; details?: Record<string, unknown> }) {
  const patch: Record<string, string> = {}
  if (updates.status) patch.status = updates.status
  if (updates.summary) patch.summary = updates.summary
  if (updates.details) patch.details = JSON.stringify(updates.details)
  if (updates.status === "completed" || updates.status === "failed") {
    patch.completed_at = new Date().toISOString()
  }
  await supabase.from("activity").update(patch).eq("activity_id", activityId)
}

// ─── Action Handlers ────────────────────────────────────────────────

export async function handleAction(action: string, body: Record<string, unknown>) {
  switch (action) {
    // ── GET LEADS (with pagination) ──────────────────────────────────
    case "get_leads": {
      const page = Number(body.page) || 1
      const pageSize = Number(body.pageSize) || 50
      const search = (body.search as string) || ""
      const statusFilter = (body.statusFilter as string) || ""
      const tagFilter = (body.tagFilter as string) || ""
      const smartList = (body.smartList as string) || ""
      const sortField = (body.sortField as string) || ""
      const sortDir = (body.sortDir as string) || "asc"

      let query = supabase.from("leads").select("*", { count: "exact" })

      if (body.business_id) query = query.eq("business_id", body.business_id as string)

      if (search) {
        query = query.or(`name.ilike.%${search}%,lead_id.ilike.%${search}%,email.ilike.%${search}%,city.ilike.%${search}%`)
      }
      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter)
      }
      if (tagFilter && tagFilter !== "all") {
        query = query.ilike("tags", `%${tagFilter}%`)
      }
      if (smartList && smartList !== "all") {
        // Check if it's a filter-based smart list
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
          // Fallback: manual assignment
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
      return {
        success: true,
        action,
        data,
        count: totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      }
    }

    // ── GET SEQUENCES ────────────────────────────────────────────────
    case "get_sequences": {
      const businessId = body.business_id as string | undefined
      let query = supabase.from("sequences").select("*")
      if (businessId) query = query.eq("business_id", businessId)
      const data = throwOnError(await query)
      return { success: true, action, data, count: data.length }
    }

    // ── GET MESSAGES ─────────────────────────────────────────────────
    case "get_messages": {
      const businessId = body.business_id as string | undefined
      let query = supabase.from("messages").select("*")
      if (businessId) query = query.eq("business_id", businessId)
      const data = throwOnError(await query)
      return { success: true, action, data, count: data.length }
    }

    // ── GET ACCOUNTS ─────────────────────────────────────────────────
    // Joins accounts with the freshest account_sessions row so the UI can
    // show a REAL login state ("needs_signin" / "expired" / "active") instead
    // of the static accounts.status field — which never gets invalidated when
    // cookies expire and caused the "shows Active when not logged in" bug.
    case "get_accounts": {
      const businessId = body.business_id as string | undefined
      let query = supabase.from("accounts").select("*")
      if (businessId) query = query.eq("business_id", businessId)
      const accounts = throwOnError(await query) as Array<Record<string, unknown>>

      // Pull the most recent active account_sessions row per account.
      const accountIds = accounts.map(a => a.account_id).filter(Boolean) as string[]
      let sessionByAccount: Record<string, { cookies: unknown; last_verified_at: string | null; created_at: string | null }> = {}
      if (accountIds.length > 0) {
        const { data: sessRows } = await supabase
          .from("account_sessions")
          .select("account_id, cookies, last_verified_at, created_at, status")
          .in("account_id", accountIds)
          .eq("status", "active")
          .order("created_at", { ascending: false })
        for (const row of (sessRows || []) as Array<{
          account_id: string
          cookies: unknown
          last_verified_at: string | null
          created_at: string | null
          status: string | null
        }>) {
          if (!sessionByAccount[row.account_id]) {
            sessionByAccount[row.account_id] = {
              cookies: row.cookies,
              last_verified_at: row.last_verified_at,
              created_at: row.created_at,
            }
          }
        }
      }

      // Per-platform "am I logged in" cookie names. If any of these exist with
      // a non-empty value in the saved cookie jar, we treat the session as
      // having real credentials. Matches the list used by the VNC capture path.
      const AUTH_COOKIE_NAMES: Record<string, string[]> = {
        instagram: ["sessionid", "ds_user_id"],
        facebook: ["c_user", "xs"],
        linkedin: ["li_at", "JSESSIONID"],
        tiktok: ["sessionid", "sid_tt"],
        youtube: ["SID", "SAPISID", "__Secure-1PSID"],
        snapchat: ["sc-a-session", "sc-a-nonce"],
        x: ["auth_token"],
        twitter: ["auth_token"],
        pinterest: ["_auth", "_pinterest_sess"],
        threads: ["sessionid"],
      }

      // Cookie jar can arrive as an array of objects, a JSON-string of that
      // array, or a single string blob from the legacy accounts.session_cookie
      // column. We normalize all shapes into an array of {name, value, expires}.
      function parseCookies(raw: unknown): Array<{ name: string; value?: string; expires?: number }> {
        if (!raw) return []
        if (Array.isArray(raw)) return raw as Array<{ name: string; value?: string; expires?: number }>
        if (typeof raw === "string") {
          try {
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        }
        return []
      }

      const now = Date.now()
      const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000    // 7d = still "active"
      const EXPIRED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000 // 7-30d = "expired"

      const enriched = accounts.map(acct => {
        const a = acct as Record<string, unknown> & { account_id?: string; platform?: string; status?: string; session_cookie?: unknown }
        const platform = (a.platform || "").toLowerCase()
        const wanted = AUTH_COOKIE_NAMES[platform] || []

        const sess = a.account_id ? sessionByAccount[a.account_id] : undefined
        const sessionCookies = sess ? parseCookies(sess.cookies) : []
        const mirrorCookies = parseCookies(a.session_cookie)
        const allCookies = sessionCookies.length > 0 ? sessionCookies : mirrorCookies

        // Any auth cookie still unexpired?
        const hasAuthCookie = wanted.length > 0 && allCookies.some(c => {
          if (!c || typeof c !== "object") return false
          if (!wanted.includes(c.name)) return false
          if (!c.value) return false
          // Chrome expires is seconds-since-epoch. Session cookies = 0 / undefined.
          if (typeof c.expires === "number" && c.expires > 0) {
            if (c.expires * 1000 < now) return false
          }
          return true
        })

        // Freshness — when was the session last captured/verified?
        const verifiedAt = sess?.last_verified_at || sess?.created_at || null
        const ageMs = verifiedAt ? (now - new Date(verifiedAt).getTime()) : Infinity
        const sessionAgeHours = verifiedAt ? Math.floor(ageMs / (60 * 60 * 1000)) : null

        // Derive real status. Banned/flagged/cooldown/warming are preserved
        // from the DB because those are lifecycle states — not login states.
        let derivedStatus: string
        if (a.status === "banned" || a.status === "flagged" || a.status === "cooldown") {
          derivedStatus = String(a.status)
        } else if (!sess && !hasAuthCookie) {
          // Pending or never-logged-in — always a sign-in ask.
          derivedStatus = "needs_signin"
        } else if (!hasAuthCookie) {
          // Cookies exist on disk but no valid auth cookie found — clearly expired.
          derivedStatus = "needs_signin"
        } else if (ageMs > EXPIRED_WINDOW_MS) {
          // Cookie present but very stale — probably expired server-side too.
          derivedStatus = "needs_signin"
        } else if (ageMs > ACTIVE_WINDOW_MS) {
          derivedStatus = "expired"
        } else if (a.status === "warming") {
          derivedStatus = "warming"
        } else {
          derivedStatus = "active"
        }

        return {
          ...acct,
          session_status: derivedStatus,
          session_age_hours: sessionAgeHours,
          has_auth_cookie: hasAuthCookie,
          has_saved_session: !!sess,
        }
      })

      return { success: true, action, data: enriched, count: enriched.length }
    }

    // ── GET AB TESTS ─────────────────────────────────────────────────
    case "get_ab_tests": {
      const businessId = body.business_id as string | undefined
      let query = supabase.from("ab_tests").select("*")
      if (businessId) query = query.eq("business_id", businessId)
      const data = throwOnError(await query)
      return { success: true, action, data, count: data.length }
    }

    // ── GET APPROACHES ───────────────────────────────────────────────
    case "get_approaches": {
      const businessId = body.business_id as string | undefined
      let query = supabase.from("approaches").select("*")
      if (businessId) query = query.eq("business_id", businessId)
      const data = throwOnError(await query)
      return { success: true, action, data, count: data.length }
    }

    // ── CREATE APPROACH ──────────────────────────────────────────────
    case "create_approach": {
      const approachId = `approach-${Date.now()}`
      const row = {
        approach_id: String(body.approach_id || approachId),
        name: String(body.name || ""),
        description: String(body.description || ""),
        prompt_file: String(body.prompt_file || ""),
        version: String(body.version || "1"),
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        business_id: (body.business_id as string) || "default",
      }
      throwOnError(await supabase.from("approaches").insert(row))
      return { success: true, action, data: row }
    }

    // ── UPDATE APPROACH ──────────────────────────────────────────────
    case "update_approach": {
      const aid = String(body.approach_id || "")
      if (!aid) return { success: false, error: "Missing approach_id" }
      const updates: Record<string, string> = {}
      for (const [k, v] of Object.entries(body)) {
        if (k !== "action" && k !== "approach_id") updates[k] = String(v ?? "")
      }
      updates.updated_at = new Date().toISOString()
      await supabase.from("approaches").update(updates).eq("approach_id", aid)
      return { success: true, action, message: `Approach ${aid} updated` }
    }

    // ── GET SETTINGS ─────────────────────────────────────────────────
    case "get_settings": {
      const businessId = body.business_id as string | undefined
      let query = supabase.from("settings").select("*")
      if (businessId) query = query.eq("business_id", businessId)
      const rows = throwOnError(await query)
      const settings: Record<string, string> = {}
      rows.forEach((r: { setting_name: string; setting_value: string }) => {
        if (r.setting_name) settings[r.setting_name] = r.setting_value
      })
      return { success: true, action, data: settings, count: Object.keys(settings).length }
    }

    // ── GET LOG ──────────────────────────────────────────────────────
    case "get_log": {
      const businessId = body.business_id as string | undefined
      let query = supabase.from("outreach_log").select("*")
      if (businessId) query = query.eq("business_id", businessId)
      const data = throwOnError(await query)
      return { success: true, action, data, count: data.length }
    }

    // ── GET OUTREACH LOG (with filters) ─────────────────────────────────
    case "get_outreach_log": {
      const platform = body.platform as string | undefined
      const status = body.status as string | undefined
      const limit = Number(body.limit) || 100
      const businessId = body.business_id as string | undefined

      let query = supabase.from("outreach_log").select("*")

      if (businessId) query = query.eq("business_id", businessId)

      if (platform && platform !== "all") {
        query = query.eq("platform", platform)
      }
      if (status && status !== "all") {
        query = query.eq("status", status)
      }

      query = query.order("sent_at", { ascending: false }).limit(limit)

      const data = throwOnError(await query)
      return { success: true, action, data, count: data.length }
    }

    // ── GET SETTINGS MAP (alias for get_settings) ───────────────────────
    case "get_settings_map": {
      const businessId = body.business_id as string | undefined
      let query = supabase.from("settings").select("*")
      if (businessId) query = query.eq("business_id", businessId)
      const rows = throwOnError(await query)
      const settings: Record<string, string> = {}
      rows.forEach((r: { setting_name: string; setting_value: string }) => {
        if (r.setting_name) settings[r.setting_name] = r.setting_value
      })
      return { success: true, action, data: settings, count: Object.keys(settings).length }
    }

    // ══════════════════════════════════════════════════════════════════════
    // OUTREACH EXECUTION (AutoBot Bridge)
    // ══════════════════════════════════════════════════════════════════════

    // ── GET SEND QUEUE (messages ready to send today) ─────────────────────
    case "get_send_queue": {
      const platform = body.platform as string | undefined
      const limit = Number(body.limit) || 50
      const businessId = body.business_id as string | undefined

      let query = supabase
        .from("messages")
        .select(`
          *,
          leads!inner(lead_id, name, instagram_url, facebook_url, linkedin_url, email, phone, status)
        `)
        .eq("status", "approved")

      if (businessId) query = query.eq("business_id", businessId)

      if (platform && platform !== "all") {
        query = query.eq("platform", platform)
      }

      query = query.order("generated_at", { ascending: true }).limit(limit)

      const { data, error } = await query
      if (error) return { success: false, error: error.message }

      return { success: true, action, data: data || [], count: (data || []).length }
    }

    // ── CHECK SEND ELIGIBILITY ────────────────────────────────────────────
    case "check_send_eligibility": {
      const platform = String(body.platform || "")
      const accountId = body.account_id as string | undefined
      const businessId = body.business_id as string | undefined

      // Get settings
      let settingsQuery = supabase.from("settings").select("*")
      if (businessId) settingsQuery = settingsQuery.eq("business_id", businessId)
      const settingsRows = throwOnError(await settingsQuery)
      const settings: Record<string, string> = {}
      settingsRows.forEach((r: { setting_name: string; setting_value: string }) => {
        if (r.setting_name) settings[r.setting_name] = r.setting_value
      })

      // Check operating hours
      const now = new Date()
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      const currentTime = `${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`

      const opStart = settings.operating_hours_start || "09:00"
      const opEnd = settings.operating_hours_end || "18:00"

      const withinOperatingHours = currentTime >= opStart && currentTime <= opEnd
      if (!withinOperatingHours) {
        return {
          success: true, action,
          data: { eligible: false, reason: `Outside operating hours (${opStart} - ${opEnd})` }
        }
      }

      // Check if paused
      if (settings.paused === "TRUE") {
        return {
          success: true, action,
          data: { eligible: false, reason: "Outreach is paused in settings" }
        }
      }

      // Get daily limit for platform
      const platformLimitKey = `${platform.replace("_dm", "")}_daily_limit`
      const dailyLimit = parseInt(settings[platformLimitKey] || "30")

      // Count sends today for this platform
      const today = new Date().toISOString().split("T")[0]
      const { count: sendsToday } = await supabase
        .from("outreach_log")
        .select("*", { count: "exact", head: true })
        .eq("platform", platform)
        .eq("status", "sent")
        .gte("sent_at", `${today}T00:00:00`)

      if ((sendsToday || 0) >= dailyLimit) {
        return {
          success: true, action,
          data: { eligible: false, reason: `Daily limit reached (${sendsToday}/${dailyLimit})` }
        }
      }

      // Check account cooldown if provided
      if (accountId) {
        const { data: account } = await supabase
          .from("accounts")
          .select("*")
          .eq("account_id", accountId)
          .single()

        if (account?.cooldown_until) {
          const cooldownUntil = new Date(account.cooldown_until)
          if (cooldownUntil > now) {
            return {
              success: true, action,
              data: { eligible: false, reason: `Account on cooldown until ${cooldownUntil.toLocaleTimeString()}` }
            }
          }
        }

        const accountSendsToday = parseInt(account?.sends_today || "0")
        const accountDailyLimit = parseInt(account?.daily_limit || "50")
        if (accountSendsToday >= accountDailyLimit) {
          return {
            success: true, action,
            data: { eligible: false, reason: `Account daily limit reached (${accountSendsToday}/${accountDailyLimit})` }
          }
        }
      }

      return {
        success: true, action,
        data: {
          eligible: true,
          sends_today: sendsToday || 0,
          daily_limit: dailyLimit,
          min_delay: parseInt(settings.min_delay_seconds || "180"),
          max_delay: parseInt(settings.max_delay_seconds || "480"),
        }
      }
    }

    // ── LOG SEND ATTEMPT ──────────────────────────────────────────────────
    case "get_today_sends": {
      const today = new Date().toISOString().split("T")[0]
      const { data: logs, error } = await supabase
        .from("outreach_log")
        .select("platform, status, sent_at")
        .like("sent_at", `${today}%`)
        .eq("status", "sent")
      if (error) return { success: false, error: error.message }
      const byPlatform: Record<string, number> = {}
      for (const log of logs || []) {
        const p = log.platform || "unknown"
        byPlatform[p] = (byPlatform[p] || 0) + 1
      }
      return { success: true, action, data: { total: (logs || []).length, by_platform: byPlatform } }
    }

    case "log_send_attempt": {
      const logEntry = {
        log_id: body.log_id || `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        lead_id: String(body.lead_id || ""),
        business_name: String(body.business_name || ""),
        sequence_step: String(body.sequence_step || body.step_number || ""),
        platform: String(body.platform || ""),
        action: String(body.action_type || "message"),
        status: String(body.status || "pending"),
        sent_at: body.sent_at || new Date().toISOString(),
        error_note: body.error_note || null,
        account_id: body.account_id || null,
      }

      const { data, error } = await supabase
        .from("outreach_log")
        .insert(logEntry)
        .select()
        .single()

      if (error) return { success: false, error: error.message }
      return { success: true, action, data }
    }

    // ── UPDATE SEND LOG ───────────────────────────────────────────────────
    case "update_send_log": {
      const logId = String(body.log_id || "")
      if (!logId) return { success: false, error: "Missing log_id" }

      const updates: Record<string, unknown> = {}
      if (body.status !== undefined) updates.status = body.status
      if (body.error_note !== undefined) updates.error_note = body.error_note
      if (body.sent_at !== undefined) updates.sent_at = body.sent_at

      const { error } = await supabase
        .from("outreach_log")
        .update(updates)
        .eq("log_id", logId)

      if (error) return { success: false, error: error.message }
      return { success: true, action, message: `Log ${logId} updated` }
    }

    // ── MARK MESSAGE SENT ─────────────────────────────────────────────────
    case "mark_message_sent": {
      const messageId = String(body.message_id || "")
      if (!messageId) return { success: false, error: "Missing message_id" }

      const { error } = await supabase
        .from("messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("message_id", messageId)

      if (error) return { success: false, error: error.message }
      return { success: true, action, message: `Message ${messageId} marked as sent` }
    }

    // ── INCREMENT ACCOUNT SEND COUNT ──────────────────────────────────────
    case "increment_account_sends": {
      const accountId = String(body.account_id || "")
      if (!accountId) return { success: false, error: "Missing account_id" }

      const { data: account, error: fetchError } = await supabase
        .from("accounts")
        .select("sends_today")
        .eq("account_id", accountId)
        .single()

      if (fetchError) return { success: false, error: fetchError.message }

      const currentSends = parseInt(account?.sends_today || "0")
      const { error } = await supabase
        .from("accounts")
        .update({
          sends_today: String(currentSends + 1),
          last_used_at: new Date().toISOString(),
        })
        .eq("account_id", accountId)

      if (error) return { success: false, error: error.message }
      return { success: true, action, message: `Account ${accountId} sends incremented` }
    }

    // ── GET AVAILABLE ACCOUNT ─────────────────────────────────────────────
    case "get_available_account": {
      const platform = String(body.platform || "")
      if (!platform) return { success: false, error: "Missing platform" }

      const now = new Date()

      // Get accounts for this platform that aren't on cooldown and have quota
      const { data: accounts, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("platform", platform.replace("_dm", ""))
        .eq("status", "active")

      if (error) return { success: false, error: error.message }
      if (!accounts?.length) {
        return { success: true, action, data: null, message: "No accounts available for this platform" }
      }

      // Find account with available quota and not on cooldown
      for (const account of accounts) {
        const sendsToday = parseInt(account.sends_today || "0")
        const dailyLimit = parseInt(account.daily_limit || "50")

        if (sendsToday >= dailyLimit) continue

        if (account.cooldown_until) {
          const cooldownUntil = new Date(account.cooldown_until)
          if (cooldownUntil > now) continue
        }

        return { success: true, action, data: account }
      }

      return { success: true, action, data: null, message: "All accounts at limit or on cooldown" }
    }

    // ── UPDATE LEAD AFTER SEND ────────────────────────────────────────────
    case "update_lead_after_send": {
      const leadId = String(body.lead_id || "")
      if (!leadId) return { success: false, error: "Missing lead_id" }

      const updates: Record<string, string> = {
        last_platform_sent: String(body.platform || ""),
      }

      // Advance to next step if provided
      if (body.next_step) {
        updates.current_step = String(body.next_step)
      }

      // Set next action date if provided
      if (body.next_action_date) {
        updates.next_action_date = String(body.next_action_date)
      }

      // Update status if sequence complete
      if (body.sequence_complete === true) {
        updates.status = "sequence_complete"
      }

      const { error } = await supabase
        .from("leads")
        .update(updates)
        .eq("lead_id", leadId)

      if (error) return { success: false, error: error.message }
      return { success: true, action, message: `Lead ${leadId} updated after send` }
    }

    // ── SCHEDULE MESSAGES FOR CALENDAR ────────────────────────────────────
    case "schedule_messages": {
      const messageIds = body.message_ids as string[]
      const startDate = body.start_date as string | undefined
      if (!messageIds?.length) return { success: false, error: "No message_ids provided" }

      // Get messages and their sequence info
      const { data: msgs, error: fetchError } = await supabase
        .from("messages")
        .select("*")
        .in("message_id", messageIds)

      if (fetchError) return { success: false, error: fetchError.message }

      const baseDate = startDate ? new Date(startDate) : new Date()
      let scheduled = 0

      for (const msg of msgs || []) {
        // Calculate scheduled date based on step_number
        const stepNum = parseInt(msg.step_number || "1")
        const scheduledDate = new Date(baseDate)
        scheduledDate.setDate(scheduledDate.getDate() + (stepNum - 1))

        const { error: updateError } = await supabase
          .from("messages")
          .update({ scheduled_for: scheduledDate.toISOString() })
          .eq("message_id", msg.message_id)

        if (!updateError) scheduled++
      }

      return { success: true, action, message: `Scheduled ${scheduled} messages` }
    }

    // ── RESET DAILY SEND COUNTS ───────────────────────────────────────────
    case "reset_daily_send_counts": {
      const { error } = await supabase
        .from("accounts")
        .update({ sends_today: "0" })
        .neq("sends_today", "0")

      if (error) return { success: false, error: error.message }
      return { success: true, action, message: "Daily send counts reset" }
    }

    // ── GET DASHBOARD (aggregated stats) ─────────────────────────────
    case "get_dashboard": {
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
        success: true,
        action,
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
    }

    // ── UPDATE SETTINGS ──────────────────────────────────────────────
    case "update_settings": {
      const updates = body.settings as Record<string, string>
      const businessId = (body.business_id as string) || "default"
      if (!updates) return { success: false, error: "Missing settings" }
      for (const [key, val] of Object.entries(updates)) {
        await supabase.from("settings").upsert({ setting_name: key, setting_value: val, business_id: businessId })
      }
      return { success: true, action, message: "Settings updated" }
    }

    // ── UPDATE ACCOUNT ───────────────────────────────────────────────
    case "update_account": {
      const acct = body as Record<string, unknown>
      if (!acct.account_id) return { success: false, error: "Missing account_id" }
      const data: Record<string, string> = {}
      for (const [k, v] of Object.entries(acct)) {
        if (k !== "action") data[k] = String(v ?? "")
      }
      await supabase.from("accounts").upsert(data)
      return { success: true, action, message: "Account updated" }
    }

    // ── CREATE AB TEST ───────────────────────────────────────────────
    case "create_ab_test": {
      const testId = `ab_${Date.now()}`
      const row = {
        test_id: testId,
        test_name: String(body.test_name || ""),
        test_type: String(body.test_type || "sequence"),
        status: "active",
        variant_a_name: String(body.variant_a_name || "Variant A"),
        variant_a_config: String(body.variant_a_config || ""),
        variant_b_name: String(body.variant_b_name || "Variant B"),
        variant_b_config: String(body.variant_b_config || ""),
        variant_a_leads: "0",
        variant_b_leads: "0",
        variant_a_responses: "0",
        variant_b_responses: "0",
        variant_a_rate: "0",
        variant_b_rate: "0",
        winner: "",
        created_at: new Date().toISOString(),
        ended_at: "",
        business_id: (body.business_id as string) || "default",
      }
      throwOnError(await supabase.from("ab_tests").insert(row))
      return { success: true, action, data: row }
    }

    // ── GET MESSAGES COMPARISON ──────────────────────────────────────
    case "get_messages_comparison": {
      const compLeadId = String(body.lead_id || "")
      if (!compLeadId) return { success: false, error: "Missing lead_id" }
      const leadMsgs = throwOnError(
        await supabase.from("messages").select("*").eq("lead_id", compLeadId)
      )
      const byApproach: Record<string, Record<string, string>[]> = {}
      for (const msg of leadMsgs) {
        const aid = msg.approach_id || "unknown"
        if (!byApproach[aid]) byApproach[aid] = []
        byApproach[aid].push(msg)
      }
      return { success: true, action, data: { lead_id: compLeadId, approaches: byApproach } }
    }

    // ── APPROVE MESSAGE ──────────────────────────────────────────────
    case "approve_message": {
      const msgId = String(body.message_id || "")
      const status = String(body.status || "approved")
      if (!msgId) return { success: false, error: "Missing message_id" }
      await supabase.from("messages").update({ status }).eq("message_id", msgId)
      return { success: true, action, message: `Message ${msgId} ${status}` }
    }

    // ── GET ACTIVITY ─────────────────────────────────────────────────
    case "get_activity": {
      const limit = Number(body.limit) || 20
      const businessId = body.business_id as string | undefined
      let query = supabase
        .from("activity")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(limit)
      if (businessId) query = query.eq("business_id", businessId)
      const { data, count } = await query
      return { success: true, action, data: data || [], count: count || 0 }
    }

    // ── IMPORT LEADS ─────────────────────────────────────────────────
    case "import_leads": {
      const rawData = body.leads_data as string | undefined
      const format = body.format as string | undefined

      if (!rawData?.trim()) {
        return { success: false, error: "No data provided" }
      }

      let parsedLeads: Record<string, string>[]

      if (format === "csv") {
        const parseCSV = (text: string): string[][] => {
          const rows: string[][] = []
          let row: string[] = []
          let current = ""
          let inQuotes = false
          for (let i = 0; i < text.length; i++) {
            const ch = text[i]
            if (inQuotes) {
              if (ch === '"') {
                if (text[i + 1] === '"') { current += '"'; i++ }
                else { inQuotes = false }
              } else { current += ch }
            } else {
              if (ch === '"') { inQuotes = true }
              else if (ch === ",") { row.push(current.trim()); current = "" }
              else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
                if (ch === "\r") i++
                row.push(current.trim()); current = ""
                if (row.some((cell) => cell !== "")) rows.push(row)
                row = []
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
        try { parsedLeads = JSON.parse(rawData) }
        catch { return { success: false, error: "Invalid JSON format" } }
      }

      if (!Array.isArray(parsedLeads) || parsedLeads.length === 0) {
        return { success: false, error: "No leads found in data" }
      }

      const leadHeaders = ["lead_id", "name", "city", "state", "business_type", "phone", "email", "all_emails", "all_contacts", "website", "instagram_url", "facebook_url", "linkedin_url", "total_score", "ranking_tier", "status", "sequence_id", "current_step", "next_action_date", "last_platform_sent", "scraped_at", "messages_generated", "notes", "_raw_scrape_data", "message_count", "is_chain", "location_count", "dedup_method"]

      const fieldMap: Record<string, string> = {
        place_id: "lead_id", full_address: "city", street: "city", phone: "phone", site: "website",
        name: "name", state: "state", type: "business_type", category: "business_type",
        email_1: "email", company_instagram: "instagram_url", company_facebook: "facebook_url", company_linkedin: "linkedin_url",
      }

      const enhancedMode = body.enhanced_mode as boolean | undefined

      const activityId = await logActivity(
        "import",
        `Importing ${parsedLeads.length} rows${enhancedMode ? " (enhanced)" : ""}...`,
        { rows: parsedLeads.length, enhanced: enhancedMode || false },
        parsedLeads.length
      )

      // Try n8n pipeline first
      try {
        const webhookUrl = "https://dclancy05.app.n8n.cloud/webhook/rebuild-scrape-leads"
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 300000)
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: parsedLeads, enhanced_mode: enhancedMode || false }),
          signal: controller.signal,
        })
        clearTimeout(timeout)
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`Pipeline returned ${res.status}: ${text.slice(0, 200)}`)
        }
        const result = await res.json()

        let ingestStats: Record<string, unknown> = {}
        let dedupStats: Record<string, unknown> = {}
        try { ingestStats = typeof result.ingest_stats === "string" ? JSON.parse(result.ingest_stats) : result.ingest_stats || {} } catch { /* */ }
        try { dedupStats = typeof result.dedup_stats === "string" ? JSON.parse(result.dedup_stats) : result.dedup_stats || {} } catch { /* */ }

        await updateActivity(activityId, {
          status: "completed",
          summary: `Processed ${parsedLeads.length} rows → ${result.total_leads || 0} leads (${result.hot_leads || 0} hot, ${result.warm_leads || 0} warm, ${result.cold_leads || 0} cold)`,
          details: {
            rows_sent: parsedLeads.length, total_leads: result.total_leads,
            hot_leads: result.hot_leads, warm_leads: result.warm_leads, cold_leads: result.cold_leads,
            ingest_stats: ingestStats, dedup_stats: dedupStats, enhanced: enhancedMode || false,
          },
        })

        // Auto-scrape if requested
        const autoScrape = body.auto_scrape as boolean | undefined
        if (autoScrape) {
          try {
            // Fetch the lead_ids that were just imported/updated
            const { data: recentLeads } = await supabase
              .from("leads")
              .select("lead_id, instagram_url, facebook_url, linkedin_url")
              .order("lead_id", { ascending: false })
              .limit(parsedLeads.length)

            const leadsWithUrls = (recentLeads || []).filter(
              (l: { instagram_url?: string; facebook_url?: string; linkedin_url?: string }) =>
                l.instagram_url || l.facebook_url || l.linkedin_url
            )

            if (leadsWithUrls.length > 0) {
              const scrapeJobs: { lead_id: string; platform: string; url: string; status: string; priority: number }[] = []
              for (const lead of leadsWithUrls) {
                if (lead.instagram_url) scrapeJobs.push({ lead_id: lead.lead_id, platform: "instagram", url: lead.instagram_url, status: "pending", priority: 1 })
                if (lead.facebook_url) scrapeJobs.push({ lead_id: lead.lead_id, platform: "facebook", url: lead.facebook_url, status: "pending", priority: 2 })
                if (lead.linkedin_url) scrapeJobs.push({ lead_id: lead.lead_id, platform: "linkedin", url: lead.linkedin_url, status: "pending", priority: 3 })
              }
              if (scrapeJobs.length > 0) {
                await supabase.from("job_queue").insert(scrapeJobs)
              }
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
          if (pid) {
            if (!placeGroups.has(pid)) placeGroups.set(pid, [])
            placeGroups.get(pid)!.push(l)
          } else {
            noPlaceRows.push(l)
          }
        }

        const deduped: Record<string, string>[] = []
        for (const [pid, group] of placeGroups) {
          const base = group[0]
          const normalized: Record<string, string> = {}
          for (const [k, v] of Object.entries(base)) {
            const mapped = fieldMap[k]
            if (mapped && !normalized[mapped]) normalized[mapped] = v || ""
          }
          for (const h of leadHeaders) {
            if (base[h]) normalized[h] = base[h]
          }
          const emails = new Set<string>()
          for (const row of group) {
            const em = (row.email || "").trim().toLowerCase()
            if (em && em.includes("@") && !em.startsWith("address")) emails.add(em)
          }
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
          for (const [k, v] of Object.entries(l)) {
            const mapped = fieldMap[k]
            if (mapped && !normalized[mapped]) normalized[mapped] = v || ""
          }
          for (const h of leadHeaders) {
            if (l[h]) normalized[h] = l[h]
          }
          const nameCity = `${(normalized.name || "").toLowerCase()}|${(normalized.city || "").toLowerCase()}`
          if (seenNameCity.has(nameCity)) continue
          seenNameCity.add(nameCity)
          if (!normalized.lead_id) normalized.lead_id = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          normalized.all_contacts = normalized.all_contacts || "[]"
          if (!normalized.total_score) normalized.total_score = "0"
          if (!normalized.ranking_tier) normalized.ranking_tier = "COLD"
          if (!normalized.status) normalized.status = "new"
          deduped.push(normalized)
        }

        // Upsert into Supabase (dedup against existing)
        let upserted = 0
        const BATCH_SIZE = 500
        const importBusinessId = (body.business_id as string) || "default"
        for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
          const batch = deduped.slice(i, i + BATCH_SIZE).map((n) => {
            const row: Record<string, string> = {}
            for (const h of [...leadHeaders, "tags", "smart_list"]) {
              row[h] = n[h] || ""
            }
            row.business_id = importBusinessId
            return row
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
    }

    // ── CREATE SEQUENCE ──────────────────────────────────────────────
    case "create_sequence": {
      const seqId = String(body.sequence_id || "")
      const seqName = String(body.sequence_name || "")
      if (!seqId || !seqName) return { success: false, error: "Missing sequence_id or sequence_name" }
      const steps = (body.steps as Record<string, string>) || {}
      const platforms = profileKey(getSequencePlatforms({ sequence_id: seqId, sequence_name: seqName, steps, required_platforms: "", template_id: "", is_template: false }))
      throwOnError(await supabase.from("sequences").insert({
        sequence_id: seqId,
        sequence_name: seqName,
        steps,
        required_platforms: platforms,
        template_id: String(body.template_id || ""),
        is_template: Boolean(body.is_template),
        business_id: (body.business_id as string) || "default",
      }))
      return { success: true, action, message: `Sequence ${seqId} created` }
    }

    // ── START SEQUENCES ──────────────────────────────────────────────
    case "start_sequences": {
      const leadIds = body.lead_ids as string[]
      const sequenceId = String(body.sequence_id || "")
      const routingMap = body.routing_map as Record<string, string> | undefined

      if (!leadIds?.length) return { success: false, error: "Missing lead_ids" }
      if (!sequenceId && !routingMap) return { success: false, error: "Missing sequence_id or routing_map" }

      if (routingMap) {
        // Per-lead variant assignment
        const bySeq: Record<string, string[]> = {}
        for (const lid of leadIds) {
          const sid = routingMap[lid] || sequenceId
          if (!sid) continue
          if (!bySeq[sid]) bySeq[sid] = []
          bySeq[sid].push(lid)
        }
        for (const [sid, lids] of Object.entries(bySeq)) {
          const { error } = await supabase
            .from("leads")
            .update({ sequence_id: sid, status: "in_sequence", current_step: "1", next_action_date: new Date().toISOString().split("T")[0] })
            .in("lead_id", lids)
          if (error) throw new Error(error.message)
        }
        return { success: true, action, message: `Started ${leadIds.length} leads with variant routing` }
      }

      const { error } = await supabase
        .from("leads")
        .update({ sequence_id: sequenceId, status: "in_sequence", current_step: "1", next_action_date: new Date().toISOString().split("T")[0] })
        .in("lead_id", leadIds)
      if (error) throw new Error(error.message)
      return { success: true, action, message: `Started ${leadIds.length} leads on ${sequenceId}` }
    }

    // ── TRIGGER OUTREACH ─────────────────────────────────────────────
    case "trigger_outreach":
      return { success: true, action, message: "trigger_outreach must be triggered from the n8n editor. Open your n8n dashboard to run this workflow." }

    // ── TRIGGER GENERATE ─────────────────────────────────────────────
    case "trigger_generate": {
      const leadIds = body.lead_ids as string[] | undefined
      const approachIds = body.approach_ids as string[] | undefined
      const sequenceId = body.sequence_id as string | undefined
      const abTestId = body.ab_test_id as string | undefined
      const routingMap = body.routing_map as Record<string, string> | undefined // lead_id → sequence_id

      if (!leadIds?.length) return { success: false, error: "Select at least one lead to generate messages for." }
      if (!sequenceId && !routingMap) return { success: false, error: "Select a sequence." }
      if (!approachIds?.length) return { success: false, error: "Select at least one approach." }

      const approaches = throwOnError(
        await supabase.from("approaches").select("*").in("approach_id", approachIds)
      )
      if (approaches.length === 0) return { success: false, error: "Selected approaches not found." }

      // Fetch sequence steps to detect non-message actions
      const seqIds = new Set<string>()
      for (const leadId of leadIds) {
        seqIds.add(routingMap?.[leadId] || sequenceId || "")
      }
      const seqMap: Record<string, Record<string, string>> = {}
      if (seqIds.size > 0) {
        const { data: seqData } = await supabase.from("sequences").select("sequence_id, steps").in("sequence_id", [...seqIds])
        for (const seq of seqData || []) {
          seqMap[seq.sequence_id] = typeof seq.steps === "string" ? JSON.parse(seq.steps) : seq.steps
        }
      }

      // Fetch lead names for non-message entries
      const { data: leadsData } = await supabase.from("leads").select("lead_id, name").in("lead_id", leadIds)
      const leadNameMap: Record<string, string> = {}
      for (const l of leadsData || []) {
        leadNameMap[l.lead_id] = l.name || ""
      }

      const jobs = []
      const nonMessageEntries: Array<Record<string, string>> = []

      for (const leadId of leadIds) {
        const effectiveSeqId = routingMap?.[leadId] || sequenceId || ""
        const steps = seqMap[effectiveSeqId] || {}

        // Create non-message entries (follow, connect) directly in the messages table
        for (const [dayKey, stepPlatform] of Object.entries(steps)) {
          if (!stepPlatform) continue
          const { platform, action: stepAction } = parseStepPlatformAction(stepPlatform)
          if (isNonMessageAction(stepAction)) {
            const dayNum = dayKey.replace("day_", "")
            nonMessageEntries.push({
              message_id: `msg_${leadId}_${effectiveSeqId}_${dayKey}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              lead_id: leadId,
              business_name: leadNameMap[leadId] || "",
              sequence_id: effectiveSeqId,
              step_number: dayNum,
              platform: stepPlatform,
              action: stepAction,
              body: "",
              subject: "",
              status: "approved", // Auto-approved: no AI generation needed
              approach_id: approaches[0]?.approach_id || "",
              generated_at: new Date().toISOString(),
            })
          }
        }

        // Create AI generation jobs for message-type steps
        for (const approach of approaches) {
          jobs.push({
            lead_id: leadId,
            sequence_id: effectiveSeqId,
            approach_id: approach.approach_id,
            approach_name: approach.name,
            prompt_file: approach.prompt_file,
            ab_test_id: abTestId || "",
          })
        }
      }

      // Insert non-message entries directly
      let directInserted = 0
      if (nonMessageEntries.length > 0) {
        const { error: insertError } = await supabase.from("messages").insert(nonMessageEntries)
        if (!insertError) directInserted = nonMessageEntries.length
      }

      // Call the generation API to create messages via Claude Bridge
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"
        const genRes = await fetch(`${baseUrl}/api/generate-messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobs }),
        })
        const genResult = await genRes.json()

        if (!genResult.success && genResult.error) {
          return {
            success: false,
            error: `Generation failed: ${genResult.error}`,
            data: { direct_action_entries: directInserted },
          }
        }

        return {
          success: true, action,
          data: {
            ...genResult,
            direct_action_entries: directInserted,
          },
          message: `Generated ${genResult.total_created || 0} messages for ${leadIds.length} lead(s).${directInserted > 0 ? ` Also created ${directInserted} auto-approved action(s) (follow/connect).` : ""}`,
        }
      } catch (genErr) {
        // If generation API fails, fall back to returning jobs for manual processing
        return {
          success: true, action,
          data: {
            jobs,
            total_jobs: jobs.length,
            leads: leadIds.length,
            approaches: approaches.length,
            is_ab_test: approaches.length > 1,
            direct_action_entries: directInserted,
            generation_error: genErr instanceof Error ? genErr.message : String(genErr),
          },
          message: `Created ${jobs.length} job(s) but auto-generation failed: ${genErr instanceof Error ? genErr.message : "Unknown error"}. Ensure the Claude Bridge is running on port 3456.${directInserted > 0 ? ` Created ${directInserted} auto-approved action(s).` : ""}`,
        }
      }
    }

    // ── BULK UPDATE LEADS ──────────────────────────────────────────
    case "bulk_update_leads": {
      const ids = body.lead_ids as string[]
      if (!ids?.length) return { success: false, error: "No lead_ids provided" }
      const updates: Record<string, string> = {}
      for (const [k, v] of Object.entries(body)) {
        if (k !== "action" && k !== "lead_ids") updates[k] = String(v ?? "")
      }
      const { error } = await supabase.from("leads").update(updates).in("lead_id", ids)
      if (error) throw new Error(error.message)
      return { success: true, action, message: `Updated ${ids.length} leads` }
    }

    // ── BULK ADD TAGS ─────────────────────────────────────────────
    case "bulk_add_tags": {
      const ids = body.lead_ids as string[]
      const newTags = body.tags as string[]
      if (!ids?.length || !newTags?.length) return { success: false, error: "No lead_ids or tags provided" }

      // Fetch current tags for selected leads
      const existing = throwOnError(
        await supabase.from("leads").select("lead_id, tags").in("lead_id", ids)
      ) as { lead_id: string; tags: string }[]

      // Merge tags per lead and batch update
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
    }

    // ── GET LEAD FILTERS (distinct statuses, tags, counts per list) ──
    case "get_lead_filters": {
      const businessId = body.business_id as string | undefined

      let listCountResult: { data: Record<string, number> } | null = null
      try {
        const r = await supabase.rpc("get_list_counts")
        if (r.data) listCountResult = { data: r.data }
      } catch { /* RPC may not exist yet */ }

      let statusQuery = supabase.from("leads").select("status")
      let tagQuery = supabase.from("leads").select("tags")
      if (businessId) {
        statusQuery = statusQuery.eq("business_id", businessId)
        tagQuery = tagQuery.eq("business_id", businessId)
      }

      const [statusResult, tagResult] = await Promise.all([
        statusQuery,
        tagQuery,
      ])

      const statuses = new Set<string>()
      if (statusResult.data) {
        for (const row of statusResult.data) {
          if (row.status) statuses.add(row.status)
        }
      }

      const tags = new Set<string>()
      if (tagResult.data) {
        for (const row of tagResult.data) {
          if (row.tags) {
            row.tags.split(",").map((t: string) => t.trim()).filter(Boolean).forEach((t: string) => tags.add(t))
          }
        }
      }

      // List counts — try RPC first, fall back to manual
      let listCounts: Record<string, number> = {}
      if (listCountResult?.data) {
        listCounts = listCountResult.data
      }

      return {
        success: true,
        action,
        data: {
          statuses: [...statuses].sort(),
          tags: [...tags].sort(),
          listCounts,
        },
      }
    }

    // ── DELETE LEADS ─────────────────────────────────────────────────
    case "reset_all_leads": {
      // Reset all leads to fresh state (no sequence, no score)
      const { error } = await supabase.from("leads").update({
        sequence_id: "",
        current_step: "",
        status: "new",
        total_score: "0",
        ranking_tier: "",
        tags: "",
        next_action_date: "",
        last_platform_sent: "",
        messages_generated: "",
      }).neq("lead_id", "")
      if (error) throw new Error(error.message)
      return { success: true, action, message: "All leads reset to fresh state" }
    }

    case "delete_leads": {
      const ids = body.lead_ids as string[]
      if (!ids?.length) return { success: false, error: "No lead_ids provided" }
      const { error } = await supabase.from("leads").delete().in("lead_id", ids)
      if (error) throw new Error(error.message)
      return { success: true, action, message: `Deleted ${ids.length} leads` }
    }

    // ── UPDATE LEAD ──────────────────────────────────────────────────
    case "update_lead": {
      const lid = String(body.lead_id || "")
      if (!lid) return { success: false, error: "Missing lead_id" }
      const updates: Record<string, string> = {}
      for (const [k, v] of Object.entries(body)) {
        if (k !== "action" && k !== "lead_id") updates[k] = String(v ?? "")
      }
      await supabase.from("leads").update(updates).eq("lead_id", lid)
      return { success: true, action, message: `Lead ${lid} updated` }
    }

    // ── DELETE MESSAGES ──────────────────────────────────────────────
    case "delete_messages": {
      const ids = body.message_ids as string[]
      if (!ids?.length) return { success: false, error: "No message_ids provided" }
      await supabase.from("messages").delete().in("message_id", ids)
      return { success: true, action, message: `Deleted ${ids.length} messages` }
    }

    // ── UPDATE MESSAGE ───────────────────────────────────────────────
    case "update_message": {
      const mid = String(body.message_id || "")
      if (!mid) return { success: false, error: "Missing message_id" }
      const updates: Record<string, string> = {}
      for (const [k, v] of Object.entries(body)) {
        if (k !== "action" && k !== "message_id") updates[k] = String(v ?? "")
      }
      await supabase.from("messages").update(updates).eq("message_id", mid)
      return { success: true, action, message: `Message ${mid} updated` }
    }

    // ── BULK APPROVE MESSAGES ────────────────────────────────────────
    case "bulk_approve_messages": {
      const ids = body.message_ids as string[]
      const status = String(body.status || "approved")
      if (!ids?.length) return { success: false, error: "No message_ids provided" }
      await supabase.from("messages").update({ status }).in("message_id", ids)
      return { success: true, action, message: `${status} ${ids.length} messages` }
    }

    // ── DELETE SEQUENCES ─────────────────────────────────────────────
    case "delete_sequences": {
      const ids = body.sequence_ids as string[]
      if (!ids?.length) return { success: false, error: "No sequence_ids provided" }
      await supabase.from("sequences").delete().in("sequence_id", ids)
      return { success: true, action, message: `Deleted ${ids.length} sequences` }
    }

    // ── DELETE ACCOUNTS ──────────────────────────────────────────────
    case "delete_accounts": {
      const ids = body.account_ids as string[]
      if (!ids?.length) return { success: false, error: "No account_ids provided" }
      await supabase.from("accounts").delete().in("account_id", ids)
      return { success: true, action, message: `Deleted ${ids.length} accounts` }
    }

    // ── DELETE AB TESTS ──────────────────────────────────────────────
    case "delete_ab_tests": {
      const ids = body.test_ids as string[]
      if (!ids?.length) return { success: false, error: "No test_ids provided" }
      await supabase.from("ab_tests").delete().in("test_id", ids)
      return { success: true, action, message: `Deleted ${ids.length} A/B tests` }
    }

    // ── TRIGGER SCRAPE FOR LEADS ─────────────────────────────────────
    case "trigger_scrape": {
      const leadIds = body.lead_ids as string[]
      if (!leadIds?.length) return { success: false, error: "No lead_ids provided" }

      // Optional platform filter (e.g. ["instagram", "google"])
      const platformsFilter = body.platforms as string[] | undefined

      // Fetch leads to get their social URLs + location data
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("lead_id, name, city, state, website, instagram_url, facebook_url, linkedin_url")
        .in("lead_id", leadIds)

      if (leadsError) throw new Error(leadsError.message)
      if (!leads?.length) return { success: false, error: "No leads found" }

      // Look up scraping automations by platform
      const { data: scrapeAutomations, error: autoError } = await supabase
        .from("autobot_automations")
        .select("id, platform, name")
        .eq("category", "scrape")

      if (autoError) throw new Error(autoError.message)

      const automationByPlatform: Record<string, string> = {}
      for (const a of scrapeAutomations || []) {
        if (a.platform) automationByPlatform[a.platform] = a.id
      }

      // Helper to extract Instagram username from URL
      function extractIgUsername(url: string): string {
        try {
          const path = new URL(url).pathname.replace(/\/$/, "")
          return path.split("/").filter(Boolean).pop() || ""
        } catch {
          return url.replace(/.*instagram\.com\//, "").replace(/[\/?].*/, "")
        }
      }

      // Create activity log
      const activityId = await logActivity(
        "scrape",
        `Queuing scrape jobs for ${leads.length} leads`,
        { lead_ids: leadIds },
        leads.length
      )

      // Queue scraping jobs for each lead/platform combination
      const profileId = body.profile_id as string | undefined
      const jobs: Array<{
        lead_id: string
        platform: string
        url: string
        status: string
        priority: number
        job_type: string
        automation_id?: string
        variables?: Record<string, string>
        profile_id?: string
        retry_count: number
        max_retries: number
      }> = []

      const shouldInclude = (p: string) => !platformsFilter || platformsFilter.includes(p)

      for (const lead of leads) {
        const baseJob = {
          status: "pending" as const,
          priority: 1,
          job_type: "scrape" as const,
          ...(profileId ? { profile_id: profileId } : {}),
          retry_count: 0,
          max_retries: 3,
        }

        if (lead.instagram_url && shouldInclude("instagram")) {
          const username = extractIgUsername(lead.instagram_url)
          jobs.push({
            ...baseJob,
            lead_id: lead.lead_id,
            platform: "instagram",
            url: lead.instagram_url,
            automation_id: automationByPlatform["instagram"],
            variables: { username },
          })
        }
        if (lead.facebook_url && shouldInclude("facebook")) {
          jobs.push({
            ...baseJob,
            lead_id: lead.lead_id,
            platform: "facebook",
            url: lead.facebook_url,
            automation_id: automationByPlatform["facebook"],
            variables: { facebook_url: lead.facebook_url },
          })
        }
        if (lead.linkedin_url && shouldInclude("linkedin")) {
          jobs.push({
            ...baseJob,
            lead_id: lead.lead_id,
            platform: "linkedin",
            url: lead.linkedin_url,
            automation_id: automationByPlatform["linkedin"],
            variables: { linkedin_url: lead.linkedin_url },
          })
        }
        if (lead.website && shouldInclude("website")) {
          jobs.push({
            ...baseJob,
            lead_id: lead.lead_id,
            platform: "website",
            url: lead.website,
            automation_id: automationByPlatform["website"],
            variables: { website_url: lead.website },
          })
        }
        if (shouldInclude("google")) {
          const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent((lead.name || "") + " " + (lead.city || "") + " " + (lead.state || ""))}`
          jobs.push({
            ...baseJob,
            lead_id: lead.lead_id,
            platform: "google",
            url: searchUrl,
            automation_id: automationByPlatform["google"],
            variables: { business_name: lead.name || "", city: lead.city || "", state: lead.state || "" },
          })
        }
        if (shouldInclude("yelp")) {
          const searchUrl = `https://www.yelp.com/search?find_desc=${encodeURIComponent(lead.name || "")}&find_loc=${encodeURIComponent((lead.city || "") + " " + (lead.state || ""))}`
          jobs.push({
            ...baseJob,
            lead_id: lead.lead_id,
            platform: "yelp",
            url: searchUrl,
            automation_id: automationByPlatform["yelp"],
            variables: { business_name: lead.name || "", city: lead.city || "", state: lead.state || "" },
          })
        }
      }

      if (jobs.length === 0) {
        await updateActivity(activityId, {
          status: "completed",
          summary: `No scrape-eligible URLs found for ${leads.length} leads`,
          details: { lead_ids: leadIds, jobs_created: 0 },
        })
        return { success: true, action, message: "No URLs found to scrape" }
      }

      // Insert jobs into job_queue
      const { error: insertError } = await supabase
        .from("job_queue")
        .insert(jobs)

      if (insertError) {
        await updateActivity(activityId, {
          status: "failed",
          details: { error: insertError.message },
        })
        throw new Error(insertError.message)
      }

      // Count by platform for activity details
      const byPlatform: Record<string, number> = {}
      for (const j of jobs) {
        byPlatform[j.platform] = (byPlatform[j.platform] || 0) + 1
      }

      // Update activity
      await updateActivity(activityId, {
        status: "completed",
        summary: `Queued ${jobs.length} scrape jobs for ${leads.length} leads`,
        details: {
          lead_ids: leadIds,
          jobs_created: jobs.length,
          by_platform: byPlatform,
        },
      })

      return {
        success: true,
        action,
        message: `Queued ${jobs.length} scrape jobs`,
        data: {
          activity_id: activityId,
          jobs_created: jobs.length,
          by_platform: byPlatform,
        },
      }
    }

    // ── GET SCRAPING JOBS (job queue) ────────────────────────────────
    case "get_scraping_jobs": {
      const status = body.status as string | undefined
      const jobType = body.job_type as string | undefined
      const limit = Number(body.limit) || 50

      let query = supabase
        .from("job_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit)

      if (status) {
        query = query.eq("status", status)
      }
      if (jobType) {
        query = query.eq("job_type", jobType)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)

      return { success: true, action, data }
    }

    // ── PROCESS SCRAPING JOB (Called by AutoBot/n8n) ─────────────────
    case "process_scraping_job": {
      const jobId = body.job_id as string
      const result = body.result as Record<string, unknown> | undefined
      const error = body.error as string | undefined

      if (!jobId) return { success: false, error: "Missing job_id" }

      // Get the job
      const { data: job, error: jobError } = await supabase
        .from("job_queue")
        .select("*")
        .eq("id", jobId)
        .single()

      if (jobError || !job) {
        return { success: false, error: "Job not found" }
      }

      if (error) {
        // Job failed
        const retryCount = (job.retry_count || 0) + 1
        if (retryCount < (job.max_retries || 3)) {
          // Retry
          await supabase
            .from("job_queue")
            .update({
              status: "pending",
              retry_count: retryCount,
              error: error,
            })
            .eq("id", jobId)
        } else {
          // Max retries exceeded
          await supabase
            .from("job_queue")
            .update({
              status: "failed",
              completed_at: new Date().toISOString(),
              error: error,
            })
            .eq("id", jobId)
        }
        return { success: true, action, message: "Job marked as failed" }
      }

      // Job succeeded - update lead with scraped data
      if (result) {
        // Fetch existing _raw_scrape_data from lead (not from job)
        const { data: existingLead } = await supabase
          .from("leads")
          .select("_raw_scrape_data")
          .eq("lead_id", job.lead_id)
          .single()

        let existingRaw: Record<string, unknown> = {}
        try {
          existingRaw = JSON.parse(existingLead?._raw_scrape_data || "{}")
        } catch { /* ignore parse errors */ }

        // Merge new platform data into existing raw scrape data
        const mergedRaw = { ...existingRaw, [job.platform]: result }

        const updates: Record<string, string> = {}

        // Common fields (backwards compat)
        if (result.followers || result.ig_followers || result.fb_followers || result.li_followers) {
          updates.followers = String(result.followers || result.ig_followers || result.fb_followers || result.li_followers || "")
        }
        if (result.bio || result.ig_bio) updates.bio = String(result.bio || result.ig_bio || "")
        if (result.engagement_rate || result.ig_engagement_rate) {
          updates.engagement_rate = String(result.engagement_rate || result.ig_engagement_rate || "")
        }

        // Store merged raw scrape data
        updates._raw_scrape_data = JSON.stringify(mergedRaw)
        updates.scraped_at = new Date().toISOString()

        // Calculate platform scores from merged data
        const scores = calculatePlatformScores(mergedRaw)
        if (Object.keys(scores).length > 0) {
          // Embed scores into _raw_scrape_data
          const rawWithScores = { ...mergedRaw, ...scores }
          updates._raw_scrape_data = JSON.stringify(rawWithScores)
        }

        await supabase
          .from("leads")
          .update(updates)
          .eq("lead_id", job.lead_id)

        // Save to scraping_results table
        await supabase.from("scraping_results").insert({
          job_id: jobId,
          lead_id: job.lead_id,
          platform: job.platform,
          raw_data: result,
        })
      }

      // Mark job as completed
      await supabase
        .from("job_queue")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId)

      return { success: true, action, message: "Job completed" }
    }

    // ── GET SMART LISTS ──────────────────────────────────────────────
    case "get_smart_lists": {
      const businessId = body.business_id as string | undefined
      let query = supabase.from("smart_lists").select("*")
      if (businessId) query = query.eq("business_id", businessId)
      let data = throwOnError(await query)

      // Pre-seed default smart lists if empty
      if (data.length === 0) {
        const defaults = [
          { list_id: "sl_hot", name: "Hot Leads", emoji: "🔥", filters: { ranking_tier: "A" }, color: "red" },
          { list_id: "sl_followup", name: "Needs Follow-Up", emoji: "📨", filters: { status: "in_sequence", days_since_contact: 3 }, color: "orange" },
          { list_id: "sl_responded", name: "Responded", emoji: "💬", filters: { status: "responded" }, color: "green" },
          { list_id: "sl_new", name: "Never Contacted", emoji: "🆕", filters: { status: "new" }, color: "blue" },
          { list_id: "sl_enterprise", name: "Enterprise (Skip)", emoji: "🏢", filters: { ranking_tier: "X", tags_contains: "enterprise" }, color: "purple" },
        ]
        const rows = defaults.map((d) => ({
          ...d,
          filters: JSON.stringify(d.filters),
          description: "",
          notes: "",
          created_at: new Date().toISOString(),
          business_id: businessId || "default",
        }))
        await supabase.from("smart_lists").insert(rows)
        data = throwOnError(await supabase.from("smart_lists").select("*").eq("business_id", businessId || "default"))
      }

      return { success: true, action, data, count: data.length }
    }

    // ── CREATE SMART LIST ────────────────────────────────────────────
    case "create_smart_list": {
      const listId = `list_${Date.now()}`
      const row = {
        list_id: listId,
        name: String(body.name || ""),
        emoji: String(body.emoji || "📋"),
        description: String(body.description || ""),
        notes: String(body.notes || ""),
        filters: body.filters ? JSON.stringify(body.filters) : "{}",
        color: String(body.color || "purple"),
        created_at: new Date().toISOString(),
        business_id: (body.business_id as string) || "default",
      }
      throwOnError(await supabase.from("smart_lists").insert(row))
      return { success: true, action, data: row }
    }

    // ── UPDATE SMART LIST ────────────────────────────────────────────
    case "update_smart_list": {
      const lid = String(body.list_id || "")
      if (!lid) return { success: false, error: "Missing list_id" }
      const updates: Record<string, string> = {}
      for (const [k, v] of Object.entries(body)) {
        if (k !== "action" && k !== "list_id") updates[k] = String(v ?? "")
      }
      await supabase.from("smart_lists").update(updates).eq("list_id", lid)
      return { success: true, action, message: `Smart list ${lid} updated` }
    }

    // ── DELETE SMART LISTS ───────────────────────────────────────────
    case "delete_smart_lists": {
      const ids = body.list_ids as string[]
      if (!ids?.length) return { success: false, error: "No list_ids provided" }
      await supabase.from("smart_lists").delete().in("list_id", ids)
      return { success: true, action, message: `Deleted ${ids.length} smart lists` }
    }

    // ── ASSIGN SMART LIST ────────────────────────────────────────────
    case "assign_smart_list": {
      const leadIds = body.lead_ids as string[]
      const listId = String(body.list_id ?? "")
      if (!leadIds?.length) return { success: false, error: "No lead_ids provided" }
      await supabase.from("leads").update({ smart_list: listId }).in("lead_id", leadIds)
      return { success: true, action, message: `Assigned ${leadIds.length} leads to list ${listId}` }
    }

    // ── GET LEAD MESSAGES ────────────────────────────────────────────
    case "get_lead_messages": {
      const leadId = String(body.lead_id || "")
      const businessId = body.business_id as string | undefined
      if (!leadId) return { success: false, error: "Missing lead_id" }
      let query = supabase.from("messages").select("*").eq("lead_id", leadId)
      if (businessId) query = query.eq("business_id", businessId)
      const data = throwOnError(await query)
      return { success: true, action, data, count: data.length }
    }

    // ── GET LEAD LOG ─────────────────────────────────────────────────
    case "get_lead_log": {
      const leadId = String(body.lead_id || "")
      const businessId = body.business_id as string | undefined
      if (!leadId) return { success: false, error: "Missing lead_id" }
      let query = supabase.from("outreach_log").select("*").eq("lead_id", leadId)
      if (businessId) query = query.eq("business_id", businessId)
      const data = throwOnError(await query)
      return { success: true, action, data, count: data.length }
    }

    // ── REGENERATE MESSAGE ───────────────────────────────────────────
    case "regenerate_message": {
      const msgId = String(body.message_id || "")
      if (!msgId) return { success: false, error: "Missing message_id" }
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"
        const res = await fetch(`${baseUrl}/api/generate-messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "regenerate", message_id: msgId }),
        })
        const result = await res.json()
        if (!result.success) return { success: false, error: result.error || "Regeneration failed" }
        return { success: true, action, data: result, message: `Message regenerated: ${msgId}` }
      } catch {
        return { success: false, error: "Failed to reach generation API. Ensure Claude Bridge is running." }
      }
    }

    // ── GET PLATFORM PROFILE COUNTS ──────────────────────────────────
    case "get_platform_profile_counts": {
      const rows = throwOnError(
        await supabase.from("leads").select("platform_profile")
      ) as { platform_profile: string }[]
      const counts: Record<string, number> = {}
      for (const row of rows) {
        const p = row.platform_profile || "none"
        counts[p] = (counts[p] || 0) + 1
      }
      return { success: true, action, data: counts }
    }

    // ── CREATE TEMPLATE SEQUENCE ──────────────────────────────────────
    case "create_template_sequence": {
      const seqId = String(body.sequence_id || "")
      const seqName = String(body.sequence_name || "")
      const steps = (body.steps as Record<string, string>) || {}
      if (!seqId || !seqName) return { success: false, error: "Missing sequence_id or sequence_name" }

      const platforms = profileKey(getSequencePlatforms({ sequence_id: seqId, sequence_name: seqName, steps, required_platforms: "", template_id: "", is_template: false } as Sequence))

      // Create the template
      throwOnError(await supabase.from("sequences").insert({
        sequence_id: seqId,
        sequence_name: seqName,
        steps,
        required_platforms: platforms,
        template_id: "",
        is_template: true,
      }))

      // Get all distinct lead platform profiles
      const leads = throwOnError(
        await supabase.from("leads").select("lead_id, platform_profile, email, phone, instagram_url, facebook_url, linkedin_url")
      ) as Lead[]

      const profileGroups = new Map<string, string[]>()
      for (const lead of leads) {
        const key = lead.platform_profile || profileKey(getLeadPlatforms(lead))
        if (!profileGroups.has(key)) profileGroups.set(key, [])
        profileGroups.get(key)!.push(lead.lead_id)
      }

      const templatePlatforms = new Set(platforms.split(",").filter(Boolean))
      const variants: { id: string; name: string; platforms: string; stepCount: number; leadCount: number }[] = []

      for (const [profile, leadIds] of profileGroups) {
        const leadPlatforms = new Set(profile.split(",").filter(Boolean))
        // Check if this profile differs from the template (missing some platforms)
        const missingPlatforms = [...templatePlatforms].filter((p) => !leadPlatforms.has(p))

        if (missingPlatforms.length === 0) {
          // Full match — these leads use the template directly
          continue
        }

        // Generate variant: keep only steps for platforms the lead has
        const variantSteps = generateVariantSteps(steps, leadPlatforms)
        if (Object.keys(variantSteps).length === 0) continue // No usable steps

        const variantId = `${seqId}__${profile.replace(/,/g, "_")}`
        const variantPlatforms = profileKey(Object.values(variantSteps).filter(Boolean))
        const variantName = `${seqName} (${profile.split(",").map((p: string) => {
          const labels: Record<string, string> = { email: "EM", facebook_dm: "FB", instagram_dm: "IG", linkedin: "LI", sms: "SMS" }
          return labels[p] || p
        }).join("+")})`

        throwOnError(await supabase.from("sequences").insert({
          sequence_id: variantId,
          sequence_name: variantName,
          steps: variantSteps,
          required_platforms: variantPlatforms,
          template_id: seqId,
          is_template: false,
        }))

        variants.push({
          id: variantId,
          name: variantName,
          platforms: variantPlatforms,
          stepCount: Object.keys(variantSteps).length,
          leadCount: leadIds.length,
        })
      }

      return {
        success: true, action,
        data: { template_id: seqId, variants_created: variants.length, variants },
        message: `Template "${seqName}" created with ${variants.length} auto-generated variant(s).`,
      }
    }

    // ── REGENERATE VARIANTS ───────────────────────────────────────────
    case "regenerate_variants": {
      const templateId = String(body.template_id || "")
      if (!templateId) return { success: false, error: "Missing template_id" }

      const templates = throwOnError(
        await supabase.from("sequences").select("*").eq("sequence_id", templateId)
      ) as Sequence[]
      if (templates.length === 0) return { success: false, error: "Template not found" }
      const template = templates[0]
      const templateSteps = typeof template.steps === "string" ? JSON.parse(template.steps) : template.steps
      const templatePlatforms = new Set((template.required_platforms || "").split(",").filter(Boolean))

      // Get existing variants
      const existingVariants = throwOnError(
        await supabase.from("sequences").select("sequence_id, required_platforms").eq("template_id", templateId)
      ) as { sequence_id: string; required_platforms: string }[]
      const existingProfiles = new Set(existingVariants.map((v) => v.required_platforms))

      // Get all lead profiles
      const leads = throwOnError(
        await supabase.from("leads").select("lead_id, platform_profile, email, phone, instagram_url, facebook_url, linkedin_url")
      ) as Lead[]

      const profileGroups = new Map<string, string[]>()
      for (const lead of leads) {
        const key = lead.platform_profile || profileKey(getLeadPlatforms(lead))
        if (!profileGroups.has(key)) profileGroups.set(key, [])
        profileGroups.get(key)!.push(lead.lead_id)
      }

      let created = 0
      for (const [profile, leadIds] of profileGroups) {
        const leadPlatforms = new Set(profile.split(",").filter(Boolean))
        const missingPlatforms = [...templatePlatforms].filter((p) => !leadPlatforms.has(p))
        if (missingPlatforms.length === 0) continue // Full match, use template

        const variantSteps = generateVariantSteps(templateSteps, leadPlatforms)
        if (Object.keys(variantSteps).length === 0) continue
        const variantPlatforms = profileKey(Object.values(variantSteps).filter(Boolean))

        if (existingProfiles.has(variantPlatforms)) continue // Already exists

        const variantId = `${templateId}__${profile.replace(/,/g, "_")}`
        const variantName = `${template.sequence_name} (${profile.split(",").map((p: string) => {
          const labels: Record<string, string> = { email: "EM", facebook_dm: "FB", instagram_dm: "IG", linkedin: "LI", sms: "SMS" }
          return labels[p] || p
        }).join("+")})`

        throwOnError(await supabase.from("sequences").insert({
          sequence_id: variantId,
          sequence_name: variantName,
          steps: variantSteps,
          required_platforms: variantPlatforms,
          template_id: templateId,
          is_template: false,
        }))
        created++
      }

      return {
        success: true, action,
        data: { template_id: templateId, new_variants: created },
        message: `Regenerated variants: ${created} new variant(s) created.`,
      }
    }

    // ── UPDATE SEQUENCE STEPS ─────────────────────────────────────────
    case "update_sequence_steps": {
      const seqId = String(body.sequence_id || "")
      const steps = body.steps as Record<string, string>
      if (!seqId || !steps) return { success: false, error: "Missing sequence_id or steps" }

      const platforms = profileKey(getSequencePlatforms({ sequence_id: seqId, sequence_name: "", steps, required_platforms: "", template_id: "", is_template: false } as Sequence))

      await supabase.from("sequences").update({
        steps,
        required_platforms: platforms,
      }).eq("sequence_id", seqId)

      return { success: true, action, message: `Sequence ${seqId} steps updated`, data: { required_platforms: platforms } }
    }

    // ── CONVERT TO TEMPLATE ───────────────────────────────────────────
    case "convert_to_template": {
      const seqId = String(body.sequence_id || "")
      if (!seqId) return { success: false, error: "Missing sequence_id" }

      await supabase.from("sequences").update({ is_template: true, template_id: "" }).eq("sequence_id", seqId)

      // Now auto-generate variants using the same logic as create_template_sequence
      // Fetch the sequence
      const seqs = throwOnError(
        await supabase.from("sequences").select("*").eq("sequence_id", seqId)
      ) as Sequence[]
      if (seqs.length === 0) return { success: false, error: "Sequence not found" }

      const seq = seqs[0]
      const steps = typeof seq.steps === "string" ? JSON.parse(seq.steps) : seq.steps
      const templatePlatforms = new Set((seq.required_platforms || "").split(",").filter(Boolean))

      const leads = throwOnError(
        await supabase.from("leads").select("lead_id, platform_profile, email, phone, instagram_url, facebook_url, linkedin_url")
      ) as Lead[]

      const profileGroups = new Map<string, string[]>()
      for (const lead of leads) {
        const key = lead.platform_profile || profileKey(getLeadPlatforms(lead))
        if (!profileGroups.has(key)) profileGroups.set(key, [])
        profileGroups.get(key)!.push(lead.lead_id)
      }

      let created = 0
      for (const [profile] of profileGroups) {
        const leadPlatforms = new Set(profile.split(",").filter(Boolean))
        const missingPlatforms = [...templatePlatforms].filter((p) => !leadPlatforms.has(p))
        if (missingPlatforms.length === 0) continue

        const variantSteps = generateVariantSteps(steps, leadPlatforms)
        if (Object.keys(variantSteps).length === 0) continue

        const variantId = `${seqId}__${profile.replace(/,/g, "_")}`
        const variantPlatforms = profileKey(Object.values(variantSteps).filter(Boolean))
        const variantName = `${seq.sequence_name} (${profile.split(",").map((p: string) => {
          const labels: Record<string, string> = { email: "EM", facebook_dm: "FB", instagram_dm: "IG", linkedin: "LI", sms: "SMS" }
          return labels[p] || p
        }).join("+")})`

        try {
          throwOnError(await supabase.from("sequences").insert({
            sequence_id: variantId,
            sequence_name: variantName,
            steps: variantSteps,
            required_platforms: variantPlatforms,
            template_id: seqId,
            is_template: false,
          }))
          created++
        } catch { /* variant may already exist */ }
      }

      return {
        success: true, action,
        data: { template_id: seqId, variants_created: created },
        message: `Converted to template with ${created} variant(s).`,
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // SCRAPING JOBS
    // ══════════════════════════════════════════════════════════════════════

    // ── TRIGGER SCRAPE FOR LEADS ──────────────────────────────────────────
    case "trigger_scrape": {
      const leadIds = body.lead_ids as string[]
      const platforms = body.platforms as string[] | undefined

      if (!leadIds?.length) return { success: false, error: "No lead_ids provided" }

      // Get leads with their social URLs
      const { data: leadsData, error: fetchError } = await supabase
        .from("leads")
        .select("lead_id, name, instagram_url, facebook_url, linkedin_url")
        .in("lead_id", leadIds)

      if (fetchError) return { success: false, error: fetchError.message }
      if (!leadsData?.length) return { success: false, error: "No leads found" }

      const jobsToCreate: { lead_id: string; platform: string; url: string; status: string; priority: number }[] = []
      const targetPlatforms = platforms || ["instagram", "facebook", "linkedin"]

      for (const lead of leadsData) {
        // Check each platform for URLs
        if (targetPlatforms.includes("instagram") && lead.instagram_url) {
          jobsToCreate.push({
            lead_id: lead.lead_id,
            platform: "instagram",
            url: lead.instagram_url,
            status: "pending",
            priority: 1,
          })
        }
        if (targetPlatforms.includes("facebook") && lead.facebook_url) {
          jobsToCreate.push({
            lead_id: lead.lead_id,
            platform: "facebook",
            url: lead.facebook_url,
            status: "pending",
            priority: 2,
          })
        }
        if (targetPlatforms.includes("linkedin") && lead.linkedin_url) {
          jobsToCreate.push({
            lead_id: lead.lead_id,
            platform: "linkedin",
            url: lead.linkedin_url,
            status: "pending",
            priority: 3,
          })
        }
      }

      if (jobsToCreate.length === 0) {
        return { success: true, action, message: "No social URLs found for selected leads", data: { jobs_created: 0 } }
      }

      // Insert scraping jobs
      const { data: createdJobs, error: insertError } = await supabase
        .from("job_queue")
        .insert(jobsToCreate)
        .select()

      if (insertError) return { success: false, error: insertError.message }

      return {
        success: true, action,
        data: { jobs_created: createdJobs?.length || 0, leads_with_urls: leadsData.length },
        message: `Created ${createdJobs?.length || 0} scraping job(s) for ${leadsData.length} lead(s)`,
      }
    }

    // ── GET JOB QUEUE (alternate) ──────────────────────────────────────────
    case "get_job_queue": {
      const status = body.status as string | undefined
      const leadId = body.lead_id as string | undefined
      const jobType = body.job_type as string | undefined
      const limit = Number(body.limit) || 50

      let query = supabase.from("job_queue").select("*").order("created_at", { ascending: false }).limit(limit)

      if (status && status !== "all") {
        query = query.eq("status", status)
      }
      if (leadId) {
        query = query.eq("lead_id", leadId)
      }
      if (jobType) {
        query = query.eq("job_type", jobType)
      }

      const { data, error } = await query
      if (error) return { success: false, error: error.message }

      return { success: true, action, data: data || [], count: (data || []).length }
    }

    // ── GET SCRAPING STATS ────────────────────────────────────────────────
    case "get_scraping_stats": {
      const [pendingRes, runningRes, completedRes, failedRes] = await Promise.all([
        supabase.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "running"),
        supabase.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "failed"),
      ])

      return {
        success: true, action,
        data: {
          pending: pendingRes.count || 0,
          running: runningRes.count || 0,
          completed: completedRes.count || 0,
          failed: failedRes.count || 0,
          total: (pendingRes.count || 0) + (runningRes.count || 0) + (completedRes.count || 0) + (failedRes.count || 0),
        },
      }
    }

    // ── SAVE SCRAPING RESULT ──────────────────────────────────────────────
    case "save_scraping_result": {
      const jobId = String(body.job_id || "")
      const leadId = String(body.lead_id || "")
      const platform = String(body.platform || "")
      const data = body.data as Record<string, unknown>

      if (!jobId || !leadId || !platform || !data) {
        return { success: false, error: "Missing required fields" }
      }

      // Save to scraping_results table
      const { error: insertError } = await supabase.from("scraping_results").insert({
        job_id: jobId,
        lead_id: leadId,
        platform,
        data,
      })

      if (insertError) return { success: false, error: insertError.message }

      // Mark lead as scraped
      await supabase.from("leads").update({
        scraped_at: new Date().toISOString(),
      }).eq("lead_id", leadId)

      // Mark job as completed
      await supabase.from("job_queue").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", jobId)

      return { success: true, action, message: `Scraping result saved for ${leadId}` }
    }

    // ══════════════════════════════════════════════════════════════════════
    // RESPONSE TRACKING
    // ══════════════════════════════════════════════════════════════════════

    // ── LOG RESPONSE ───────────────────────────────────────────────────────
    case "log_response": {
      const leadId = String(body.lead_id || "")
      const platform = String(body.platform || "")
      const responseType = String(body.response_type || "reply")
      const sentiment = String(body.sentiment || "neutral")
      const messagePreview = String(body.message_preview || "")
      const notes = String(body.notes || "")
      const logId = body.log_id as string | undefined

      if (!leadId || !platform) {
        return { success: false, error: "Missing lead_id or platform" }
      }

      // Insert response record
      const { data: response, error: insertError } = await supabase
        .from("responses")
        .insert({
          lead_id: leadId,
          platform,
          response_type: responseType,
          sentiment,
          message_preview: messagePreview,
          notes,
          log_id: logId || null,
        })
        .select()
        .single()

      if (insertError) return { success: false, error: insertError.message }

      // Update lead status
      await supabase.from("leads").update({
        status: "responded",
        responded_at: new Date().toISOString(),
        response_platform: platform,
        response_sentiment: sentiment,
        response_notes: notes || messagePreview.slice(0, 200),
      }).eq("lead_id", leadId)

      // Update outreach_log if log_id provided
      if (logId) {
        await supabase.from("outreach_log").update({
          response_received: true,
          response_at: new Date().toISOString(),
          response_type: responseType,
        }).eq("log_id", logId)
      }

      return { success: true, action, data: response, message: `Response logged for ${leadId}` }
    }

    // ── GET RESPONSES ──────────────────────────────────────────────────────
    case "get_responses": {
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
    }

    // ── GET RESPONSE STATS ─────────────────────────────────────────────────
    case "get_response_stats": {
      const { count: totalResponses } = await supabase
        .from("responses")
        .select("*", { count: "exact", head: true })

      const { count: positiveResponses } = await supabase
        .from("responses")
        .select("*", { count: "exact", head: true })
        .eq("sentiment", "positive")

      const { count: interestedResponses } = await supabase
        .from("responses")
        .select("*", { count: "exact", head: true })
        .eq("response_type", "interested")

      const { count: totalSent } = await supabase
        .from("outreach_log")
        .select("*", { count: "exact", head: true })
        .eq("status", "sent")

      const responseRate = totalSent && totalSent > 0
        ? ((totalResponses || 0) / totalSent * 100).toFixed(1)
        : "0.0"

      return {
        success: true,
        action,
        data: {
          total_responses: totalResponses || 0,
          positive_responses: positiveResponses || 0,
          interested_responses: interestedResponses || 0,
          total_sent: totalSent || 0,
          response_rate: responseRate,
        }
      }
    }

    // ── MARK LEAD AS RESPONDED ─────────────────────────────────────────────
    case "mark_lead_responded": {
      const leadId = String(body.lead_id || "")
      const platform = String(body.platform || "")
      const sentiment = String(body.sentiment || "neutral")

      if (!leadId) return { success: false, error: "Missing lead_id" }

      await supabase.from("leads").update({
        status: "responded",
        responded_at: new Date().toISOString(),
        response_platform: platform,
        response_sentiment: sentiment,
      }).eq("lead_id", leadId)

      return { success: true, action, message: `Lead ${leadId} marked as responded` }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ERROR LOGGING
    // ══════════════════════════════════════════════════════════════════════

    // ── LOG ERROR ──────────────────────────────────────────────────────────
    case "log_error": {
      const entry = {
        source: String(body.source || "unknown"),
        severity: String(body.severity || "error"),
        message: String(body.message || ""),
        details: body.details || null,
        lead_id: body.lead_id ? String(body.lead_id) : null,
        automation_id: body.automation_id ? String(body.automation_id) : null,
        job_id: body.job_id ? String(body.job_id) : null,
      }

      const { data, error } = await supabase.from("error_log").insert(entry).select().single()
      if (error) return { success: false, error: error.message }
      return { success: true, action, data }
    }

    // ── GET ERRORS ─────────────────────────────────────────────────────────
    case "get_errors": {
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
    }

    // ── RESOLVE ERROR ──────────────────────────────────────────────────────
    case "resolve_error": {
      const errorId = String(body.error_id || "")
      if (!errorId) return { success: false, error: "Missing error_id" }

      const { error } = await supabase
        .from("error_log")
        .update({ resolved: true })
        .eq("id", errorId)

      if (error) return { success: false, error: error.message }
      return { success: true, action, message: `Error ${errorId} resolved` }
    }

    // ── CLEAR COMPLETED JOBS ──────────────────────────────────────────────
    case "clear_completed_jobs": {
      const { error } = await supabase
        .from("job_queue")
        .delete()
        .eq("status", "completed")

      if (error) return { success: false, error: error.message }
      return { success: true, action, message: "Completed jobs cleared" }
    }

    case "get_lead_status_counts": {
      const businessId = body.business_id as string | undefined
      let statusQuery = supabase.from("leads").select("status")
      if (businessId) statusQuery = statusQuery.eq("business_id", businessId)
      const { data, error } = await statusQuery
      if (error) throw new Error(error.message)
      const counts: Record<string, number> = {}
      ;(data || []).forEach((row: { status: string }) => {
        counts[row.status] = (counts[row.status] || 0) + 1
      })
      return { success: true, action, data: counts }
    }

    // ── GET PROFILES ─────────────────────────────────────────────────
    case "get_profiles": {
      const { data, error } = await supabase
        .from("playwright_profiles")
        .select("*")
        .order("created_at", { ascending: true })

      if (error) throw new Error(error.message)
      return { success: true, action, data }
    }

    // ── CREATE PROFILE ───────────────────────────────────────────────
    case "create_profile": {
      const name = String(body.name || "")
      const profilePath = String(body.profile_path || "")
      if (!name || !profilePath) return { success: false, error: "Name and profile_path required" }

      const { data, error } = await supabase.from("playwright_profiles").insert({
        name,
        profile_path: profilePath,
        purpose: String(body.purpose || "outreach"),
        platforms: body.platforms || [],
        notes: body.notes ? String(body.notes) : null,
        is_active: true,
      }).select("*").single()

      if (error) throw new Error(error.message)
      return { success: true, action, data }
    }

    // ── UPDATE PROFILE ───────────────────────────────────────────────
    case "update_profile": {
      const id = String(body.id || "")
      if (!id) return { success: false, error: "Missing id" }

      const updates: Record<string, unknown> = {}
      if (body.name !== undefined) updates.name = String(body.name)
      if (body.profile_path !== undefined) updates.profile_path = String(body.profile_path)
      if (body.purpose !== undefined) updates.purpose = String(body.purpose)
      if (body.platforms !== undefined) updates.platforms = body.platforms
      if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes) : null
      if (body.is_active !== undefined) updates.is_active = body.is_active

      const { error } = await supabase.from("playwright_profiles").update(updates).eq("id", id)
      if (error) throw new Error(error.message)
      return { success: true, action, message: `Profile ${id} updated` }
    }

    // ── DELETE PROFILE ───────────────────────────────────────────────
    case "delete_profile": {
      const id = String(body.id || "")
      if (!id) return { success: false, error: "Missing id" }

      const { error } = await supabase.from("playwright_profiles").delete().eq("id", id)
      if (error) throw new Error(error.message)
      return { success: true, action, message: `Profile ${id} deleted` }
    }

    // ── GET BUSINESSES ────────────────────────────────────────────────
    case "get_businesses": {
      const data = throwOnError(await supabase.from("businesses").select("*").order("created_at"))
      return { success: true, action, data, count: data.length }
    }

    // ── CREATE BUSINESS ────────────────────────────────────────────────
    case "create_business": {
      const id = String(body.id || `biz_${Date.now()}`)
      const row = {
        id,
        name: String(body.name || ""),
        description: String(body.description || ""),
        color: String(body.color || "purple"),
        icon: String(body.icon || ""),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      throwOnError(await supabase.from("businesses").insert(row))

      // Copy settings from default business
      const defaultSettings = throwOnError(
        await supabase.from("settings").select("*").eq("business_id", "default")
      ) as { setting_name: string; setting_value: string }[]
      if (defaultSettings.length > 0) {
        const newSettings = defaultSettings.map((s) => ({
          setting_name: s.setting_name,
          setting_value: s.setting_value,
          business_id: id,
        }))
        await supabase.from("settings").insert(newSettings)
      }

      return { success: true, action, data: row }
    }

    // ── UPDATE BUSINESS ────────────────────────────────────────────────
    case "update_business": {
      const id = String(body.id || "")
      if (!id) return { success: false, error: "Missing business id" }
      const updates: Record<string, string> = { updated_at: new Date().toISOString() }
      for (const [k, v] of Object.entries(body)) {
        if (k !== "action" && k !== "id") updates[k] = String(v ?? "")
      }
      await supabase.from("businesses").update(updates).eq("id", id)
      return { success: true, action, message: `Business ${id} updated` }
    }

    // ── DELETE BUSINESS ────────────────────────────────────────────────
    case "delete_business": {
      const id = String(body.id || "")
      if (!id || id === "default") return { success: false, error: "Cannot delete default business" }
      // Delete all business-scoped data
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
    }

    // ── GET BUSINESS OVERVIEW ──────────────────────────────────────────
    case "get_business_overview": {
      const id = String(body.id || "")
      if (!id) return { success: false, error: "Missing business id" }

      const [
        { count: leadsCount },
        { count: accountsCount },
        { count: sequencesCount },
      ] = await Promise.all([
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("business_id", id),
        supabase.from("accounts").select("*", { count: "exact", head: true }).eq("business_id", id),
        supabase.from("sequences").select("*", { count: "exact", head: true }).eq("business_id", id),
      ])

      const today = new Date().toISOString().split("T")[0]
      const { count: sendsToday } = await supabase
        .from("outreach_log")
        .select("*", { count: "exact", head: true })
        .eq("business_id", id)
        .gte("sent_at", `${today}T00:00:00`)

      return {
        success: true,
        action,
        data: {
          id,
          leads_count: leadsCount || 0,
          accounts_count: accountsCount || 0,
          sequences_count: sequencesCount || 0,
          sends_today: sendsToday || 0,
        },
      }
    }

    // ── GET SCHEDULED LEADS (due for outreach today) ─────────────────────
    case "get_scheduled_leads": {
      const businessId = body.business_id as string | undefined
      const today = new Date().toISOString().split("T")[0]

      let query = supabase
        .from("leads")
        .select("lead_id, name, sequence_id, current_step, next_action_date, status, business_id, instagram_url, facebook_url, linkedin_url, email, phone")
        .eq("status", "in_sequence")
        .lte("next_action_date", today)
        .not("sequence_id", "is", null)
        .order("next_action_date", { ascending: true })
        .limit(1000)

      if (businessId) query = query.eq("business_id", businessId)

      const data = throwOnError(await query)
      return { success: true, action, data, count: data.length }
    }

    // ── GET SCHEDULED MESSAGES (for calendar view) ────────────────────
    case "get_scheduled_messages": {
      const businessId = body.business_id as string | undefined
      const startDate = body.start_date as string
      const endDate = body.end_date as string

      let query = supabase
        .from("messages")
        .select(`
          message_id,
          lead_id,
          platform,
          action,
          status,
          scheduled_for,
          body,
          leads!inner(name)
        `)
        .not("scheduled_for", "is", null)
        .gte("scheduled_for", startDate)
        .lte("scheduled_for", endDate)
        .order("scheduled_for", { ascending: true })

      if (businessId) query = query.eq("business_id", businessId)

      const { data, error } = await query

      if (error) throw new Error(error.message)

      // Flatten the lead name into the message object
      const formatted = (data || []).map((msg: any) => ({
        ...msg,
        lead_name: msg.leads?.name || "Unknown Lead",
        leads: undefined // Remove nested object
      }))

      return { success: true, action, data: formatted, count: formatted.length }
    }

    // ── IMPORT LEADS FROM AUTOBOT RUN ──────────────────────────────────
    case "import_leads_from_run": {
      const runId = String(body.run_id || "")
      if (!runId) return { success: false, error: "Missing run_id" }

      const { data: run, error: runError } = await supabase
        .from("autobot_runs")
        .select("id, automation_id, data_collected, status")
        .eq("id", runId)
        .single()

      if (runError || !run) return { success: false, error: "Run not found" }
      if (!run.data_collected) return { success: false, error: "No data collected in this run" }

      const collected = typeof run.data_collected === "string" ? JSON.parse(run.data_collected) : run.data_collected
      const items = Array.isArray(collected) ? collected : [collected]

      if (items.length === 0) return { success: false, error: "No items to import" }

      const fieldMapping = (body.field_mapping as Record<string, string>) || {}
      const sequenceId = body.sequence_id as string | undefined
      const importBusinessId = (body.business_id as string) || "default"

      const defaultMap: Record<string, string> = {
        name: "name", business_name: "name", company: "name",
        city: "city", location: "city",
        state: "state",
        phone: "phone", phone_number: "phone",
        email: "email", email_address: "email",
        website: "website", site: "website", url: "website",
        instagram: "instagram_url", instagram_url: "instagram_url",
        facebook: "facebook_url", facebook_url: "facebook_url",
        linkedin: "linkedin_url", linkedin_url: "linkedin_url",
        type: "business_type", category: "business_type", business_type: "business_type",
        job_title: "notes", title: "notes",
      }

      const mapping = { ...defaultMap, ...fieldMapping }
      const leads: Record<string, string>[] = []

      for (const item of items) {
        if (!item || typeof item !== "object") continue
        const lead: Record<string, string> = {}

        for (const [srcKey, val] of Object.entries(item)) {
          const targetField = mapping[srcKey.toLowerCase()]
          if (targetField && val && !lead[targetField]) {
            lead[targetField] = String(val)
          }
        }

        if (!lead.name && !lead.email && !lead.instagram_url && !lead.linkedin_url) continue

        lead.lead_id = lead.lead_id || `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        lead.status = sequenceId ? "in_sequence" : "new"
        lead.total_score = lead.total_score || "0"
        lead.ranking_tier = lead.ranking_tier || "COLD"
        lead.business_id = importBusinessId
        lead.scraped_at = new Date().toISOString()
        if (sequenceId) {
          lead.sequence_id = sequenceId
          lead.current_step = "1"
          const nextDate = new Date()
          nextDate.setDate(nextDate.getDate() + 1)
          lead.next_action_date = nextDate.toISOString().split("T")[0]
        }

        leads.push(lead)
      }

      if (leads.length === 0) return { success: false, error: "No valid leads extracted from data" }

      // Dedup by platform URL or email
      const seen = new Set<string>()
      const uniqueLeads = leads.filter((l) => {
        const key = l.email || l.instagram_url || l.linkedin_url || l.facebook_url || l.name
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // Check for existing leads with same URLs/emails
      const emailsToCheck = uniqueLeads.map((l) => l.email).filter(Boolean)
      const instaToCheck = uniqueLeads.map((l) => l.instagram_url).filter(Boolean)
      const linkedinToCheck = uniqueLeads.map((l) => l.linkedin_url).filter(Boolean)

      const existingIds = new Set<string>()

      if (emailsToCheck.length) {
        const { data: existing } = await supabase
          .from("leads")
          .select("lead_id, email")
          .in("email", emailsToCheck)
        for (const e of existing || []) existingIds.add(e.email)
      }
      if (instaToCheck.length) {
        const { data: existing } = await supabase
          .from("leads")
          .select("lead_id, instagram_url")
          .in("instagram_url", instaToCheck)
        for (const e of existing || []) existingIds.add(e.instagram_url)
      }
      if (linkedinToCheck.length) {
        const { data: existing } = await supabase
          .from("leads")
          .select("lead_id, linkedin_url")
          .in("linkedin_url", linkedinToCheck)
        for (const e of existing || []) existingIds.add(e.linkedin_url)
      }

      const newLeads = uniqueLeads.filter((l) => {
        return !existingIds.has(l.email) && !existingIds.has(l.instagram_url) && !existingIds.has(l.linkedin_url)
      })

      let inserted = 0
      if (newLeads.length > 0) {
        const BATCH = 500
        for (let i = 0; i < newLeads.length; i += BATCH) {
          const batch = newLeads.slice(i, i + BATCH)
          const { error: insertError } = await supabase.from("leads").upsert(batch, { onConflict: "lead_id" })
          if (!insertError) inserted += batch.length
        }
      }

      return {
        success: true,
        action,
        data: {
          run_id: runId,
          items_in_run: items.length,
          mapped: leads.length,
          unique: uniqueLeads.length,
          duplicates_skipped: uniqueLeads.length - newLeads.length,
          inserted: inserted,
        },
        message: `Imported ${inserted} new leads from run ${runId}`,
      }
    }

    // ── GET OUTREACH SETTINGS ─────────────────────────────────────────
    case "get_outreach_settings": {
      const businessId = (body.business_id as string) || "default"
      const { data, error } = await supabase
        .from("outreach_settings")
        .select("*")
        .eq("business_id", businessId)
      if (error) {
        // Fallback to settings table if outreach_settings doesn't exist
        const settingsQuery = supabase.from("settings").select("*")
        if (businessId) settingsQuery.eq("business_id", businessId)
        const rows = throwOnError(await settingsQuery)
        const settings: Record<string, string> = {}
        rows.forEach((r: { setting_name: string; setting_value: string }) => {
          if (r.setting_name) settings[r.setting_name] = r.setting_value
        })
        return { success: true, action, data: settings, count: Object.keys(settings).length, source: "settings" }
      }
      const settings: Record<string, string> = {}
      ;(data || []).forEach((r: { setting_name: string; setting_value: string }) => {
        if (r.setting_name) settings[r.setting_name] = r.setting_value
      })
      return { success: true, action, data: settings, count: Object.keys(settings).length, source: "outreach_settings" }
    }

    // ── UPDATE OUTREACH SETTINGS ──────────────────────────────────────
    case "update_outreach_settings": {
      const updates = body.settings as Record<string, string>
      const businessId = (body.business_id as string) || "default"
      if (!updates) return { success: false, error: "Missing settings" }
      
      // Try outreach_settings table first, fall back to settings table
      let useTable = "outreach_settings"
      for (const [key, val] of Object.entries(updates)) {
        const { error } = await supabase.from(useTable).upsert(
          { setting_name: key, setting_value: val, business_id: businessId },
          { onConflict: "setting_name,business_id" }
        )
        if (error) {
          // Fallback to settings table
          useTable = "settings"
          await supabase.from("settings").upsert(
            { setting_name: key, setting_value: val, business_id: businessId },
            { onConflict: "setting_name,business_id" }
          )
        }
      }
      return { success: true, action, message: `Outreach settings updated (${useTable})` }
    }

    // ── GET BUILD PROGRESS ────────────────────────────────────────────
    case "get_build_progress": {
      // Try to read from build_progress table, fall back to empty
      const { data, error } = await supabase
        .from("build_progress")
        .select("*")
        .order("phase_order", { ascending: true })
      
      if (error) {
        // Return default phases if table doesn't exist
        return {
          success: true, action,
          data: null,
          source: "default"
        }
      }
      return { success: true, action, data, source: "supabase" }
    }

    // ── GET SYSTEM STATUS (orchestrator) ────────────────────────────────
    case "get_system_status": {
      let status = null
      let alerts: unknown[] = []

      // Only read files server-side
      if (typeof window === "undefined") {
        try {
          const fs = await import("fs")
          const path = await import("path")
          const statusPath = path.join(process.cwd(), "..", "..", "..", "orchestrator", "system-status.json")
          const altPath = "/home/clawd/.openclaw/workspace/orchestrator/system-status.json"
          const alertsPath = "/home/clawd/.openclaw/workspace/orchestrator/alerts-queue.json"

          for (const p of [statusPath, altPath]) {
            try {
              if (fs.existsSync(p)) {
                status = JSON.parse(fs.readFileSync(p, "utf-8"))
                break
              }
            } catch { /* skip */ }
          }

          try {
            if (fs.existsSync(alertsPath)) {
              alerts = JSON.parse(fs.readFileSync(alertsPath, "utf-8"))
            }
          } catch { /* skip */ }
        } catch { /* fs not available */ }
      }

      return {
        success: true,
        action,
        data: {
          status: status || { lastMonitorRun: null, lastSenderRun: null, activeAlerts: 0, nextScheduledRuns: {} },
          alerts: Array.isArray(alerts) ? alerts.slice(-20) : [],
        },
      }
    }

    // ── CREATE ACCOUNT (full setup with profile/cookies) ─────────────────
    case "create_account": {
      const accountId = body.account_id || `acct_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const row: Record<string, unknown> = {
        account_id: String(accountId),
        platform: String(body.platform || "instagram"),
        display_name: String(body.display_name || ""),
        username: String(body.username || ""),
        status: String(body.status || "active"),
        daily_limit: String(body.daily_limit || "30"),
        sends_today: "0",
        session_cookie: String(body.session_cookie || ""),
        chrome_profile_name: String(body.chrome_profile_name || ""),
        chrome_profile_path: String(body.chrome_profile_path || ""),
        profile_url: String(body.profile_url || ""),
        notes: String(body.notes || ""),
        business_id: (body.business_id as string) || "default",
        created_at: new Date().toISOString(),
      }
      const { error } = await supabase.from("accounts").upsert(row)
      if (error) return { success: false, error: error.message }
      return { success: true, action, data: row }
    }

    // ── DELETE ACCOUNT ────────────────────────────────────────────────────
    case "delete_account": {
      const accountId = String(body.account_id || "")
      if (!accountId) return { success: false, error: "Missing account_id" }
      const { error } = await supabase.from("accounts").delete().eq("account_id", accountId)
      if (error) return { success: false, error: error.message }
      return { success: true, action, message: `Account ${accountId} deleted` }
    }

    // ── GET OUTREACH SETTINGS ─────────────────────────────────────────────
    case "get_outreach_settings": {
      const businessId = body.business_id as string | undefined
      let query = supabase.from("settings").select("*")
      if (businessId) query = query.eq("business_id", businessId)
      const rows = throwOnError(await query)
      const settings: Record<string, string> = {}
      rows.forEach((r: { setting_name: string; setting_value: string }) => {
        if (r.setting_name) settings[r.setting_name] = r.setting_value
      })
      return { success: true, action, data: settings }
    }

    // ── UPDATE OUTREACH SETTINGS ──────────────────────────────────────────
    case "update_outreach_settings": {
      const updates = body.settings as Record<string, string>
      const businessId = (body.business_id as string) || "default"
      if (!updates) return { success: false, error: "Missing settings" }
      for (const [key, val] of Object.entries(updates)) {
        await supabase.from("settings").upsert({ setting_name: key, setting_value: val, business_id: businessId })
      }
      return { success: true, action, message: "Outreach settings updated" }
    }

    // ── GET PROXY SETTINGS ────────────────────────────────────────────────
    case "get_proxy_settings": {
      const businessId = body.business_id as string | undefined
      let query = supabase.from("settings").select("*")
      if (businessId) query = query.eq("business_id", businessId)
      const rows = throwOnError(await query)
      const settings: Record<string, string> = {}
      rows.forEach((r: { setting_name: string; setting_value: string }) => {
        if (r.setting_name && r.setting_name.startsWith("proxy_")) settings[r.setting_name] = r.setting_value
      })
      return {
        success: true, action,
        data: {
          proxy_enabled: settings.proxy_enabled || "FALSE",
          proxy_provider: settings.proxy_provider || "custom",
          proxy_list: settings.proxy_list || "",
        }
      }
    }

    // ── UPDATE PROXY SETTINGS ─────────────────────────────────────────────
    case "update_proxy_settings": {
      const businessId = (body.business_id as string) || "default"
      const proxySettings = body.settings as Record<string, string>
      if (!proxySettings) return { success: false, error: "Missing settings" }
      for (const [key, val] of Object.entries(proxySettings)) {
        if (key.startsWith("proxy_")) {
          await supabase.from("settings").upsert({ setting_name: key, setting_value: val, business_id: businessId })
        }
      }
      return { success: true, action, message: "Proxy settings updated" }
    }

    // ── GET PROFILES ──────────────────────────────────────────────────────
    case "get_profiles": {
      const businessId = body.business_id as string | undefined
      // Try chrome_profiles table, fall back to empty
      const { data, error } = await supabase.from("chrome_profiles").select("*")
      if (error) return { success: true, action, data: [], count: 0 }
      return { success: true, action, data: data || [], count: (data || []).length }
    }

    // ── CREATE PROFILE ────────────────────────────────────────────────────
    case "create_profile": {
      const id = `profile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const row = {
        id,
        name: String(body.name || ""),
        profile_path: String(body.profile_path || ""),
        purpose: String(body.purpose || "outreach"),
        platforms: body.platforms || [],
        notes: String(body.notes || ""),
        is_active: true,
        created_at: new Date().toISOString(),
      }
      const { error } = await supabase.from("chrome_profiles").insert(row)
      if (error) return { success: false, error: error.message }
      return { success: true, action, data: row }
    }

    // ── UPDATE PROFILE ────────────────────────────────────────────────────
    case "update_profile": {
      const id = String(body.id || "")
      if (!id) return { success: false, error: "Missing id" }
      const updates: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(body)) {
        if (k !== "action" && k !== "id" && k !== "business_id") updates[k] = v
      }
      const { error } = await supabase.from("chrome_profiles").update(updates).eq("id", id)
      if (error) return { success: false, error: error.message }
      return { success: true, action, message: `Profile ${id} updated` }
    }

    // ── DELETE PROFILE ────────────────────────────────────────────────────
    case "delete_profile": {
      const id = String(body.id || "")
      if (!id) return { success: false, error: "Missing id" }
      const { error } = await supabase.from("chrome_profiles").delete().eq("id", id)
      if (error) return { success: false, error: error.message }
      return { success: true, action, message: `Profile ${id} deleted` }
    }

    // ══════════════════════════════════════════════════════════════════════
    // PHASE C & D: Warmup, Analytics, Feed, Lead Detail
    // ══════════════════════════════════════════════════════════════════════

    // ── GET ANALYTICS DATA ───────────────────────────────────────────
    case "get_analytics": {
      const businessId = body.business_id as string | undefined
      const days = Number(body.days) || 30

      const since = new Date()
      since.setDate(since.getDate() - days)
      const sinceStr = since.toISOString()

      // Outreach logs in time range
      let logQuery = supabase.from("outreach_log").select("*").gte("sent_at", sinceStr)
      if (businessId) logQuery = logQuery.eq("business_id", businessId)
      const logs = throwOnError(await logQuery)

      // Daily send volumes
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

      // Response rates by platform
      const platformStats: Record<string, { sent: number; responded: number }> = {}
      for (const log of logs) {
        const p = (log.platform || "unknown").toLowerCase()
        if (!platformStats[p]) platformStats[p] = { sent: 0, responded: 0 }
        if (log.status === "sent") platformStats[p].sent++
        if (log.status === "responded") platformStats[p].responded++
      }

      // Top sequences
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
          daily_sends: dailySends,
          platform_counts: platformCounts,
          status_counts: statusCounts,
          platform_stats: platformStats,
          sequence_stats: sequenceCounts,
          total_logs: logs.length,
        },
      }
    }

    // ── GET LEAD DETAIL ──────────────────────────────────────────────
    case "get_lead_detail": {
      const leadId = String(body.lead_id || "")
      if (!leadId) return { success: false, error: "Missing lead_id" }

      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("*")
        .eq("lead_id", leadId)
        .single()
      if (leadError) return { success: false, error: leadError.message }

      // Get all messages for this lead
      const messages = throwOnError(
        await supabase.from("messages").select("*").eq("lead_id", leadId).order("step_number", { ascending: true })
      )

      // Get outreach log for this lead
      const logs = throwOnError(
        await supabase.from("outreach_log").select("*").eq("lead_id", leadId).order("sent_at", { ascending: false })
      )

      return { success: true, action, data: { lead, messages, logs } }
    }

    // ── GET OUTREACH FEED ────────────────────────────────────────────
    case "get_outreach_feed": {
      const limit = Number(body.limit) || 50
      const businessId = body.business_id as string | undefined
      const since = body.since as string | undefined

      let query = supabase.from("outreach_log").select("*").order("sent_at", { ascending: false }).limit(limit)
      if (businessId) query = query.eq("business_id", businessId)
      if (since) query = query.gt("sent_at", since)

      const data = throwOnError(await query)
      return { success: true, action, data, count: data.length }
    }

    // ── GET WARMUP STATUS ────────────────────────────────────────────
    case "get_warmup_status": {
      const businessId = body.business_id as string | undefined
      let query = supabase.from("outreach_accounts").select("*").eq("status", "warming")
      if (businessId) query = query.eq("business_id", businessId)
      const accounts = throwOnError(await query)

      // Get today's sends per account
      const today = new Date().toISOString().split("T")[0]
      const accountStatuses = []

      for (const acct of accounts) {
        const { count } = await supabase
          .from("outreach_log")
          .select("*", { count: "exact", head: true })
          .eq("account_id", acct.account_id)
          .eq("status", "sent")
          .gte("sent_at", `${today}T00:00:00`)

        const warmupStarted = acct.warmup_started_at || acct.created_at || new Date().toISOString()
        const daysSinceStart = Math.floor((Date.now() - new Date(warmupStarted).getTime()) / 86400000) + 1

        // Default warmup schedule: 5 (day 1), 10 (day 3), 20 (day 7), 30 (day 14)
        let dailyLimit = 5
        if (daysSinceStart >= 14) dailyLimit = 30
        else if (daysSinceStart >= 7) dailyLimit = 20
        else if (daysSinceStart >= 3) dailyLimit = 10

        accountStatuses.push({
          ...acct,
          warmup_day: daysSinceStart,
          warmup_total_days: 14,
          warmup_daily_limit: dailyLimit,
          sends_today_actual: count || 0,
          warmup_complete: daysSinceStart >= 14,
        })
      }

      return { success: true, action, data: accountStatuses }
    }

    // ── UPDATE WARMUP SETTINGS ───────────────────────────────────────
    case "update_warmup_settings": {
      const businessId = (body.business_id as string) || "default"
      const schedule = body.warmup_schedule as string | undefined
      if (schedule) {
        await supabase.from("settings").upsert({
          setting_name: "warmup_schedule",
          setting_value: schedule,
          business_id: businessId,
        })
      }
      return { success: true, action, message: "Warmup settings updated" }
    }

    // ── GET AB TEST RESULTS ──────────────────────────────────────────
    case "get_ab_test_results": {
      const businessId = body.business_id as string | undefined

      // Get approaches
      let approachQuery = supabase.from("approaches").select("*")
      if (businessId) approachQuery = approachQuery.eq("business_id", businessId)
      const approaches = throwOnError(await approachQuery)

      // Get messages grouped by approach
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

      return {
        success: true, action,
        data: { approaches, results },
      }
    }

    // ── LOG SCORING CHANGE ───────────────────────────────────────────
    case "log_scoring_change": {
      const entry = {
        log_id: `score_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        lead_id: String(body.lead_id || ""),
        business_name: String(body.business_name || ""),
        sequence_step: "",
        platform: "",
        action: "score_change",
        status: String(body.change_type || "bump"),
        sent_at: new Date().toISOString(),
        error_note: String(body.reason || ""),
        account_id: "",
      }
      await supabase.from("outreach_log").insert(entry)
      return { success: true, action, message: "Scoring change logged" }
    }

    // ══════════════════════════════════════════════════════════════════════
    // CHROME PROFILES & JOB QUEUE (Business Section Rebuild)
    // ══════════════════════════════════════════════════════════════════════

    // ── GET CHROME PROFILES ──────────────────────────────────────────
    case "get_chrome_profiles": {
      const businessId = body.business_id as string | undefined
      let query = supabase.from("chrome_profiles").select("*")
      if (businessId) query = query.eq("business_id", businessId)
      query = query.order("profile_name", { ascending: true })
      const { data, error } = await query
      if (error) {
        // Table might not exist yet — return empty
        return { success: true, action, data: [] }
      }
      return { success: true, action, data: data || [] }
    }

    // ── GET JOB QUEUE (per profile) ─────────────────────────────────
    case "get_job_queue": {
      const profileId = body.profile_id as string | undefined
      const businessId = body.business_id as string | undefined
      const limit = Number(body.limit) || 100

      let query = supabase
        .from("job_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit)

      if (profileId) query = query.eq("profile_id", profileId)
      if (businessId) query = query.eq("business_id", businessId)

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return { success: true, action, data: data || [] }
    }

    // ── TOGGLE QUEUE PAUSE ──────────────────────────────────────────
    case "toggle_queue_pause": {
      const profileId = body.profile_id as string
      if (!profileId) return { success: false, error: "Missing profile_id" }

      const { data: profile } = await supabase
        .from("chrome_profiles")
        .select("paused")
        .eq("profile_id", profileId)
        .single()

      const newPaused = !(profile?.paused || false)
      await supabase
        .from("chrome_profiles")
        .update({ paused: newPaused })
        .eq("profile_id", profileId)

      return { success: true, action, message: `Queue ${newPaused ? "paused" : "resumed"}` }
    }

    // ── GET LIVE VIEW LOG ───────────────────────────────────────────
    case "get_live_view_log": {
      const profileId = body.profile_id as string | undefined
      const businessId = body.business_id as string | undefined
      const limit = Number(body.limit) || 100

      let query = supabase
        .from("outreach_log")
        .select("*")
        .order("sent_at", { ascending: true })
        .limit(limit)

      if (profileId) query = query.eq("profile_id", profileId)
      if (businessId) query = query.eq("business_id", businessId)

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return { success: true, action, data: data || [] }
    }

    // ── IMPORT LEADS WITH COLUMN MAPPING ────────────────────────────
    case "import_leads_mapped": {
      const rows = body.rows as Record<string, string>[]
      const mapping = body.mapping as Record<string, string>
      const businessId = (body.business_id as string) || "default"

      if (!rows?.length) return { success: false, error: "No rows provided" }
      if (!mapping) return { success: false, error: "No column mapping provided" }

      // Parse and deduplicate
      const seen = new Map<string, Record<string, string>>()
      for (const row of rows) {
        const lead: Record<string, string> = { business_id: businessId }
        for (const [csvCol, dbField] of Object.entries(mapping)) {
          if (dbField === "skip" || !dbField) continue
          lead[dbField] = row[csvCol] || ""
        }
        if (!lead.status) lead.status = "new"

        // Dedup key: name + instagram (or name + email, or just name)
        const dedupKey = [
          (lead.name || "").toLowerCase().trim(),
          (lead.instagram_url || lead.email || "").toLowerCase().trim(),
        ].join("|")

        if (!dedupKey || dedupKey === "|") {
          // No name at all — skip empty rows
          continue
        }

        if (seen.has(dedupKey)) {
          // Merge: fill in blanks from duplicate row
          const existing = seen.get(dedupKey)!
          for (const [k, v] of Object.entries(lead)) {
            if (v && !existing[k]) existing[k] = v
          }
        } else {
          if (!lead.lead_id) {
            lead.lead_id = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          }
          seen.set(dedupKey, lead)
        }
      }

      const leads = [...seen.values()]
      const duped = rows.length - leads.length

      const BATCH = 500
      let upserted = 0
      for (let i = 0; i < leads.length; i += BATCH) {
        const batch = leads.slice(i, i + BATCH)
        const { error } = await supabase.from("leads").upsert(batch, { onConflict: "lead_id" })
        if (!error) upserted += batch.length
      }

      return {
        success: true, action,
        message: `Imported ${upserted} leads (${duped} duplicates removed)`,
        data: { imported: upserted, total: rows.length, duplicates_removed: duped },
      }
    }

    // ── QUEUE SCRAPE FOR LEADS ──────────────────────────────────────
    case "queue_scrape_jobs": {
      const leadIds = body.lead_ids as string[]
      const businessId = body.business_id as string | undefined
      if (!leadIds?.length) return { success: false, error: "No lead_ids" }

      const { data: leads } = await supabase
        .from("leads")
        .select("lead_id, instagram_url, facebook_url, linkedin_url")
        .in("lead_id", leadIds)

      const jobs: Array<Record<string, unknown>> = []
      for (const lead of leads || []) {
        if (lead.instagram_url) {
          jobs.push({
            lead_id: lead.lead_id, platform: "instagram", url: lead.instagram_url,
            status: "pending", priority: 1, job_type: "scrape",
            business_id: businessId, retry_count: 0, max_retries: 3,
          })
        }
        if (lead.facebook_url) {
          jobs.push({
            lead_id: lead.lead_id, platform: "facebook", url: lead.facebook_url,
            status: "pending", priority: 2, job_type: "scrape",
            business_id: businessId, retry_count: 0, max_retries: 3,
          })
        }
        if (lead.linkedin_url) {
          jobs.push({
            lead_id: lead.lead_id, platform: "linkedin", url: lead.linkedin_url,
            status: "pending", priority: 3, job_type: "scrape",
            business_id: businessId, retry_count: 0, max_retries: 3,
          })
        }
      }

      if (jobs.length > 0) {
        const { error } = await supabase.from("job_queue").insert(jobs)
        if (error) throw new Error(error.message)
      }

      return {
        success: true, action,
        message: `Queued ${jobs.length} scrape jobs`,
        data: { jobs_created: jobs.length },
      }
    }

    // ── GET AUTOBOT AUTOMATIONS (outreach only) ─────────────────────
    case "get_outreach_automations": {
      const { data, error } = await supabase
        .from("autobot_automations")
        .select("*")
        .in("category", ["outreach", "dm", "follow", "connect", "message", "add_friend"])
        .order("name", { ascending: true })

      if (error) {
        // Table may not exist
        return { success: true, action, data: [] }
      }
      return { success: true, action, data: data || [] }
    }

    // ── QUEUE OUTREACH TO JOB QUEUE ─────────────────────────────────
    case "queue_outreach_jobs": {
      const messageIds = body.message_ids as string[]
      const businessId = body.business_id as string | undefined
      if (!messageIds?.length) return { success: false, error: "No message_ids" }

      const { data: msgs, error: fetchErr } = await supabase
        .from("messages")
        .select("*")
        .in("message_id", messageIds)

      if (fetchErr) throw new Error(fetchErr.message)

      const jobs = (msgs || []).map((msg: Record<string, unknown>) => ({
        lead_id: msg.lead_id,
        platform: msg.platform,
        job_type: msg.action || "dm",
        status: "queued",
        priority: 1,
        business_id: businessId,
        message_id: msg.message_id,
        created_at: new Date().toISOString(),
        retry_count: 0,
        max_retries: 3,
      }))

      if (jobs.length > 0) {
        const { error } = await supabase.from("job_queue").insert(jobs)
        if (error) throw new Error(error.message)
      }

      // Mark messages as scheduled
      await supabase
        .from("messages")
        .update({ status: "scheduled" })
        .in("message_id", messageIds)

      return {
        success: true, action,
        message: `Queued ${jobs.length} outreach jobs`,
        data: { jobs_queued: jobs.length },
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // VA OUTREACH SYSTEM
    // ══════════════════════════════════════════════════════════════════════

    case "get_outreach_accounts": {
      const data = throwOnError(await supabase.from("outreach_accounts").select("*").order("created_at", { ascending: true }))
      return { success: true, action, data, count: data.length }
    }

    case "create_outreach_account": {
      const row = {
        username: String(body.username || ""),
        password: String(body.password || ""),
        email: String(body.email || ""),
        email_password: String(body.email_password || ""),
        proxy_host: String(body.proxy_host || ""),
        proxy_port: String(body.proxy_port || ""),
        proxy_username: String(body.proxy_username || ""),
        proxy_password: String(body.proxy_password || ""),
        status: String(body.status || "warming"),
        daily_limit: Number(body.daily_limit) || 5,
        sends_today: 0,
        warmup_start_date: new Date().toISOString().split("T")[0],
        warmup_day: 1,
        notes: String(body.notes || ""),
      }
      const data = throwOnError(await supabase.from("outreach_accounts").insert(row).select().single() as any)
      return { success: true, action, data }
    }

    case "update_outreach_account": {
      const accountId = String(body.account_id || "")
      if (!accountId) return { success: false, error: "Missing account_id" }
      const updates: Record<string, unknown> = {}
      const allowed = ["username", "password", "email", "email_password", "proxy_host", "proxy_port", "proxy_username", "proxy_password", "status", "daily_limit", "sends_today", "warmup_start_date", "warmup_day", "notes", "last_used_at"]
      for (const k of allowed) {
        if (body[k] !== undefined) updates[k] = body[k]
      }
      await supabase.from("outreach_accounts").update(updates).eq("account_id", accountId)
      return { success: true, action, message: `Account ${accountId} updated` }
    }

    case "delete_outreach_account": {
      const accountId = String(body.account_id || "")
      if (!accountId) return { success: false, error: "Missing account_id" }
      await supabase.from("outreach_accounts").delete().eq("account_id", accountId)
      return { success: true, action, message: `Account ${accountId} deleted` }
    }

    case "get_va_sessions": {
      const data = throwOnError(await supabase.from("va_sessions").select("*").order("created_at", { ascending: true }))
      return { success: true, action, data, count: data.length }
    }

    case "create_va_session": {
      const row = { va_name: String(body.va_name || ""), pin: String(body.pin || ""), is_active: true }
      const data = throwOnError(await supabase.from("va_sessions").insert(row).select().single() as any)
      return { success: true, action, data }
    }

    case "update_va_session": {
      const sessionId = String(body.session_id || "")
      if (!sessionId) return { success: false, error: "Missing session_id" }
      const updates: Record<string, unknown> = {}
      if (body.va_name !== undefined) updates.va_name = body.va_name
      if (body.pin !== undefined) updates.pin = body.pin
      if (body.is_active !== undefined) updates.is_active = body.is_active
      await supabase.from("va_sessions").update(updates).eq("session_id", sessionId)
      return { success: true, action, message: "VA session updated" }
    }

    case "delete_va_session": {
      const sessionId = String(body.session_id || "")
      if (!sessionId) return { success: false, error: "Missing session_id" }
      await supabase.from("va_sessions").delete().eq("session_id", sessionId)
      return { success: true, action, message: "VA session deleted" }
    }

    case "va_login": {
      const pin = String(body.pin || "")
      if (!pin) return { success: false, error: "Missing PIN" }
      const { data, error } = await supabase.from("va_sessions").select("*").eq("pin", pin).eq("is_active", true).single()
      if (error || !data) return { success: false, error: "Invalid PIN" }
      return { success: true, action, data }
    }

    case "get_va_queue": {
      // Get next unsent leads for VA queue
      const limit = Number(body.limit) || 50
      const excludeIds = (body.exclude_ids as string[]) || []

      // Get leads that are in_sequence and haven't been sent today
      const today = new Date().toISOString().split("T")[0]
      const { data: sentToday } = await supabase
        .from("va_send_log")
        .select("lead_id")
        .gte("sent_at", `${today}T00:00:00`)
        .in("status", ["sent", "skipped"])

      const sentLeadIds = (sentToday || []).map((s: { lead_id: string }) => s.lead_id)
      const allExclude = [...new Set([...sentLeadIds, ...excludeIds])]

      // Sort by lowest score first (warmup = weak leads first, then graduate to better ones)
      let query = supabase
        .from("leads")
        .select("lead_id, name, instagram_url, city, state, business_type, status, notes, _raw_scrape_data, total_score, ranking_tier")
        .not("instagram_url", "is", null)
        .neq("instagram_url", "")
        .in("status", ["in_sequence", "messages_ready"])
        .order("total_score", { ascending: true, nullsFirst: false })
        .order("lead_id", { ascending: true })
        .limit(limit)

      if (allExclude.length > 0) {
        // Filter out already-sent leads
        query = query.not("lead_id", "in", `(${allExclude.join(",")})`)
      }

      const data = throwOnError(await query)

      // Attach previous account info for follow-ups
      if (data.length > 0) {
        const leadIds = data.map((l: { lead_id: string }) => l.lead_id)
        const { data: prevSends } = await supabase
          .from("va_send_log")
          .select("lead_id, account_id")
          .in("lead_id", leadIds)
          .eq("status", "sent")
          .order("sent_at", { ascending: false })
        
        const lastAccountMap: Record<string, string> = {}
        for (const s of (prevSends || [])) {
          if (!lastAccountMap[s.lead_id]) lastAccountMap[s.lead_id] = s.account_id
        }
        for (const lead of data) {
          (lead as Record<string, unknown>).preferred_account_id = lastAccountMap[(lead as Record<string, string>).lead_id] || null
        }
      }

      return { success: true, action, data, count: data.length }
    }

    case "log_va_send": {
      const row = {
        lead_id: String(body.lead_id || ""),
        account_id: String(body.account_id || ""),
        va_session_id: String(body.va_session_id || ""),
        status: String(body.status || "sent"),
      }
      throwOnError(await supabase.from("va_send_log").insert(row))
      // Increment sends_today on account
      if (row.account_id && row.status === "sent") {
        const { data: acct } = await supabase.from("outreach_accounts").select("sends_today, username").eq("account_id", row.account_id).single()
        await supabase.from("outreach_accounts").update({
          sends_today: (acct?.sends_today || 0) + 1,
          last_used_at: new Date().toISOString(),
        }).eq("account_id", row.account_id)
        // Log to lead_activity
        try {
          await supabase.from("lead_activity").insert({
            lead_id: row.lead_id,
            activity_type: "message_sent",
            content: `DM sent via Instagram`,
            account_used: acct?.username || row.account_id,
            va_name: String(body.va_name || ""),
            business_id: (body.business_id as string) || "default",
          })
        } catch { /* ignore */ }
      }
      return { success: true, action, message: "Send logged" }
    }

    case "report_warning": {
      const accountId = String(body.account_id || "")
      if (!accountId) return { success: false, error: "Missing account_id" }
      await supabase.from("outreach_accounts").update({ status: "paused" }).eq("account_id", accountId)
      if (body.lead_id) {
        throwOnError(await supabase.from("va_send_log").insert({
          lead_id: String(body.lead_id),
          account_id: accountId,
          va_session_id: String(body.va_session_id || ""),
          status: "warning",
        }))
      }
      return { success: true, action, message: `Account ${accountId} paused (warning)` }
    }

    case "report_logged_out": {
      const accountId = String(body.account_id || "")
      if (!accountId) return { success: false, error: "Missing account_id" }
      await supabase.from("outreach_accounts").update({ status: "logged_out" }).eq("account_id", accountId)
      if (body.lead_id) {
        throwOnError(await supabase.from("va_send_log").insert({
          lead_id: String(body.lead_id),
          account_id: accountId,
          va_session_id: String(body.va_session_id || ""),
          status: "logged_out",
        }))
      }
      return { success: true, action, message: `Account ${accountId} marked logged out` }
    }

    case "report_response": {
      const row = {
        lead_id: String(body.lead_id || ""),
        account_id: String(body.account_id || ""),
        reported_by_va: String(body.reported_by_va || ""),
        notes: String(body.notes || ""),
      }
      throwOnError(await supabase.from("lead_responses").insert(row))
      if (body.lead_id) {
        throwOnError(await supabase.from("va_send_log").insert({
          lead_id: row.lead_id,
          account_id: row.account_id,
          va_session_id: String(body.va_session_id || ""),
          status: "response",
        }))
        // Log to lead_activity
        try {
          await supabase.from("lead_activity").insert({
            lead_id: row.lead_id,
            activity_type: "response_received",
            content: `Response reported: ${row.notes || "No details"}`,
            account_used: row.account_id,
            va_name: row.reported_by_va,
            business_id: "default",
          })
        } catch { /* ignore */ }
        // If category is "Interested", update lead status
        if (body.category === "Interested") {
          await supabase.from("leads").update({ status: "responded" }).eq("lead_id", row.lead_id)
        }
      }
      return { success: true, action, message: "Response reported" }
    }

    case "get_va_stats": {
      const today = new Date().toISOString().split("T")[0]
      const { data: logs } = await supabase
        .from("va_send_log")
        .select("account_id, status")
        .gte("sent_at", `${today}T00:00:00`)

      const byAccount: Record<string, number> = {}
      let totalSent = 0
      for (const log of logs || []) {
        if (log.status === "sent") {
          totalSent++
          byAccount[log.account_id] = (byAccount[log.account_id] || 0) + 1
        }
      }

      const accounts = throwOnError(await supabase.from("outreach_accounts").select("account_id, username, status, daily_limit, sends_today"))
      const totalLimit = accounts.reduce((s: number, a: { daily_limit: number }) => s + (a.daily_limit || 0), 0)

      return { success: true, action, data: { total_sent: totalSent, total_limit: totalLimit, by_account: byAccount, accounts } }
    }

    case "reset_va_daily_sends": {
      await supabase.from("outreach_accounts").update({ sends_today: 0 }).neq("sends_today", 0)
      // Update warmup days
      const accounts = throwOnError(await supabase.from("outreach_accounts").select("account_id, warmup_start_date"))
      const today = new Date()
      for (const acct of accounts) {
        if (acct.warmup_start_date) {
          const start = new Date(acct.warmup_start_date)
          const dayNum = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1
          // Warmup ramp: Week 1 = 5, Week 2 = 10, Week 3 = 20, Week 4+ = 30
          let limit = 30
          if (dayNum <= 7) limit = 5
          else if (dayNum <= 14) limit = 10
          else if (dayNum <= 21) limit = 20
          await supabase.from("outreach_accounts").update({ warmup_day: dayNum, daily_limit: limit }).eq("account_id", acct.account_id)
        }
      }
      return { success: true, action, message: "Daily sends reset and warmup updated" }
    }

    // ══════════════════════════════════════════════════════════════════════
    // CONTENT SYSTEM
    // ══════════════════════════════════════════════════════════════════════

    // ── CONTENT PERSONAS CRUD ───────────────────────────────────────────
    case "get_content_personas": {
      const data = throwOnError(await supabase.from("content_personas").select("*").order("created_at", { ascending: false }))
      return { success: true, action, data, count: data.length }
    }

    case "create_content_persona": {
      const row = {
        name: String(body.name || ""),
        description: String(body.description || ""),
        niche: String(body.niche || ""),
        tone: String(body.tone || ""),
        content_types: String(body.content_types || "reels,images"),
        hashtag_groups: String(body.hashtag_groups || ""),
        posting_frequency: Number(body.posting_frequency) || 5,
      }
      const data = throwOnError(await supabase.from("content_personas").insert(row).select().single())
      return { success: true, action, data }
    }

    case "update_content_persona": {
      const pid = String(body.persona_id || "")
      if (!pid) return { success: false, error: "Missing persona_id" }
      const updates: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(body)) {
        if (k !== "action" && k !== "persona_id") updates[k] = v
      }
      await supabase.from("content_personas").update(updates).eq("persona_id", pid)
      return { success: true, action, message: `Persona ${pid} updated` }
    }

    case "delete_content_persona": {
      const pid = String(body.persona_id || "")
      if (!pid) return { success: false, error: "Missing persona_id" }
      await supabase.from("content_personas").delete().eq("persona_id", pid)
      return { success: true, action, message: `Persona ${pid} deleted` }
    }

    case "assign_persona_to_account": {
      const accountId = String(body.account_id || "")
      const personaId = body.persona_id ? String(body.persona_id) : null
      if (!accountId) return { success: false, error: "Missing account_id" }
      await supabase.from("outreach_accounts").update({ persona_id: personaId }).eq("account_id", accountId)
      return { success: true, action, message: `Persona assigned to account ${accountId}` }
    }

    // ── CONTENT CALENDAR CRUD ───────────────────────────────────────────
    case "get_content_calendar": {
      const accountId = body.account_id as string | undefined
      const status = body.post_status as string | undefined
      const from = body.from_date as string | undefined
      const to = body.to_date as string | undefined

      let query = supabase.from("content_calendar").select("*").order("scheduled_for", { ascending: true })
      if (accountId) query = query.eq("account_id", accountId)
      if (status && status !== "all") query = query.eq("post_status", status)
      if (from) query = query.gte("scheduled_for", from)
      if (to) query = query.lte("scheduled_for", to)

      const data = throwOnError(await query)
      return { success: true, action, data, count: data.length }
    }

    case "create_content_item": {
      const row = {
        account_id: String(body.account_id || ""),
        persona_id: body.persona_id ? String(body.persona_id) : null,
        title: String(body.title || ""),
        caption: String(body.caption || ""),
        hashtags: String(body.hashtags || ""),
        content_type: String(body.content_type || "image"),
        media_url: String(body.media_url || ""),
        media_status: String(body.media_status || "pending"),
        post_status: String(body.post_status || "draft"),
        scheduled_for: body.scheduled_for || null,
        ai_prompt: String(body.ai_prompt || ""),
      }
      const data = throwOnError(await supabase.from("content_calendar").insert(row).select().single())
      return { success: true, action, data }
    }

    case "update_content_item": {
      const cid = String(body.content_id || "")
      if (!cid) return { success: false, error: "Missing content_id" }
      const updates: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(body)) {
        if (k !== "action" && k !== "content_id") updates[k] = v
      }
      await supabase.from("content_calendar").update(updates).eq("content_id", cid)
      return { success: true, action, message: `Content ${cid} updated` }
    }

    case "delete_content_item": {
      const cid = String(body.content_id || "")
      if (!cid) return { success: false, error: "Missing content_id" }
      await supabase.from("content_calendar").delete().eq("content_id", cid)
      return { success: true, action, message: `Content ${cid} deleted` }
    }

    case "bulk_create_content": {
      const items = body.items as Record<string, unknown>[]
      if (!items?.length) return { success: false, error: "No items provided" }
      const rows = items.map(item => ({
        account_id: String(item.account_id || ""),
        persona_id: item.persona_id ? String(item.persona_id) : null,
        title: String(item.title || ""),
        caption: String(item.caption || ""),
        hashtags: String(item.hashtags || ""),
        content_type: String(item.content_type || "image"),
        media_status: "pending",
        post_status: "draft",
        scheduled_for: item.scheduled_for || null,
        ai_prompt: String(item.ai_prompt || ""),
      }))
      const data = throwOnError(await supabase.from("content_calendar").insert(rows).select())
      return { success: true, action, data, count: data.length }
    }

    // ── CONTENT TEMPLATES CRUD ──────────────────────────────────────────
    case "get_content_templates": {
      const personaId = body.persona_id as string | undefined
      let query = supabase.from("content_templates").select("*").order("created_at", { ascending: false })
      if (personaId) query = query.eq("persona_id", personaId)
      const data = throwOnError(await query)
      return { success: true, action, data, count: data.length }
    }

    case "create_content_template": {
      const row = {
        persona_id: body.persona_id ? String(body.persona_id) : null,
        name: String(body.name || ""),
        content_type: String(body.content_type || "image"),
        prompt_template: String(body.prompt_template || ""),
        caption_template: String(body.caption_template || ""),
      }
      const data = throwOnError(await supabase.from("content_templates").insert(row).select().single())
      return { success: true, action, data }
    }

    case "update_content_template": {
      const tid = String(body.template_id || "")
      if (!tid) return { success: false, error: "Missing template_id" }
      const updates: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(body)) {
        if (k !== "action" && k !== "template_id") updates[k] = v
      }
      await supabase.from("content_templates").update(updates).eq("template_id", tid)
      return { success: true, action, message: `Template ${tid} updated` }
    }

    case "delete_content_template": {
      const tid = String(body.template_id || "")
      if (!tid) return { success: false, error: "Missing template_id" }
      await supabase.from("content_templates").delete().eq("template_id", tid)
      return { success: true, action, message: `Template ${tid} deleted` }
    }

    // ── CONTENT STATS ───────────────────────────────────────────────────
    case "get_content_stats": {
      const [
        { count: totalContent },
        { count: draftCount },
        { count: scheduledCount },
        { count: postedCount },
        { count: pendingMedia },
      ] = await Promise.all([
        supabase.from("content_calendar").select("*", { count: "exact", head: true }),
        supabase.from("content_calendar").select("*", { count: "exact", head: true }).eq("post_status", "draft"),
        supabase.from("content_calendar").select("*", { count: "exact", head: true }).eq("post_status", "scheduled"),
        supabase.from("content_calendar").select("*", { count: "exact", head: true }).eq("post_status", "posted"),
        supabase.from("content_calendar").select("*", { count: "exact", head: true }).eq("media_status", "pending"),
      ])
      return {
        success: true, action,
        data: {
          total: totalContent || 0,
          drafts: draftCount || 0,
          scheduled: scheduledCount || 0,
          posted: postedCount || 0,
          pending_media: pendingMedia || 0,
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // VA ENHANCED ACTIONS
    // ══════════════════════════════════════════════════════════════════════

    case "log_va_problem": {
      const leadId = String(body.lead_id || "")
      const problem = String(body.problem || "")
      const accountId = String(body.account_id || "")
      const vaSessionId = String(body.va_session_id || "")
      if (!leadId || !problem) return { success: false, error: "Missing lead_id or problem" }

      // Log to va_send_log
      await supabase.from("va_send_log").insert({
        lead_id: leadId,
        account_id: accountId,
        va_session_id: vaSessionId,
        status: "problem",
      })

      // Log to lead_activity
      await supabase.from("lead_activity").insert({
        lead_id: leadId,
        activity_type: "problem_reported",
        content: problem,
        account_used: accountId,
        va_name: String(body.va_name || ""),
        business_id: "default",
      })

      // Update lead status for certain problems
      const statusMap: Record<string, string> = {
        "Business closed": "paused",
        "Profile not found": "paused",
        "Already messaged": "skipped",
        "Account flagged": "paused",
      }
      if (statusMap[problem]) {
        await supabase.from("leads").update({ status: statusMap[problem] }).eq("lead_id", leadId)
      }

      return { success: true, action, message: "Problem logged" }
    }

    case "log_va_response_category": {
      const leadId = String(body.lead_id || "")
      const category = String(body.category || "")
      const accountId = String(body.account_id || "")
      const notes = String(body.notes || "")
      if (!leadId || !category) return { success: false, error: "Missing lead_id or category" }

      // Log response
      await supabase.from("lead_responses").insert({
        lead_id: leadId,
        account_id: accountId,
        reported_by_va: String(body.va_name || ""),
        notes: `[${category}] ${notes}`.trim(),
      })

      // Log to va_send_log
      await supabase.from("va_send_log").insert({
        lead_id: leadId,
        account_id: accountId,
        va_session_id: String(body.va_session_id || ""),
        status: "response",
      })

      // Log to lead_activity
      await supabase.from("lead_activity").insert({
        lead_id: leadId,
        activity_type: "response_received",
        content: `Response: ${category}${notes ? ` - ${notes}` : ""}`,
        account_used: accountId,
        va_name: String(body.va_name || ""),
        business_id: "default",
      })

      // Auto-update lead status based on category
      if (category === "Interested") {
        await supabase.from("leads").update({ status: "responded" }).eq("lead_id", leadId)
      } else if (category === "Not Interested") {
        await supabase.from("leads").update({ status: "not_interested" }).eq("lead_id", leadId)
      }

      return { success: true, action, message: "Response categorized" }
    }

    case "get_agency_analytics": {
      const today = new Date().toISOString().split("T")[0]
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]

      // DMs sent today
      const { count: dmsToday } = await supabase.from("va_send_log").select("*", { count: "exact", head: true })
        .gte("sent_at", `${today}T00:00:00`).eq("status", "sent")

      // DMs sent this week
      const { count: dmsWeek } = await supabase.from("va_send_log").select("*", { count: "exact", head: true })
        .gte("sent_at", `${weekAgo}T00:00:00`).eq("status", "sent")

      // DMs sent all time
      const { count: dmsAllTime } = await supabase.from("va_send_log").select("*", { count: "exact", head: true })
        .eq("status", "sent")

      // Responses all time
      const { count: responsesAllTime } = await supabase.from("lead_responses").select("*", { count: "exact", head: true })

      // Responses this week
      const { count: responsesWeek } = await supabase.from("lead_responses").select("*", { count: "exact", head: true })
        .gte("created_at", `${weekAgo}T00:00:00`)

      // Account health
      const accounts = throwOnError(await supabase.from("outreach_accounts").select("account_id, username, status, daily_limit, sends_today, warmup_day, last_used_at"))
      const accountHealth = {
        active: accounts.filter((a: { status: string }) => a.status === "active").length,
        warming: accounts.filter((a: { status: string }) => a.status === "warming").length,
        at_limit: accounts.filter((a: { status: string; sends_today: number; daily_limit: number }) => a.status === "active" && a.sends_today >= a.daily_limit).length,
        banned: accounts.filter((a: { status: string }) => a.status === "banned").length,
        paused: accounts.filter((a: { status: string }) => a.status === "paused").length,
      }

      // Top VAs (by sends today)
      const { data: vaLogs } = await supabase.from("va_send_log").select("va_session_id, status")
        .gte("sent_at", `${today}T00:00:00`)
      const vaStats: Record<string, { sent: number; responses: number }> = {}
      for (const log of vaLogs || []) {
        if (!log.va_session_id) continue
        if (!vaStats[log.va_session_id]) vaStats[log.va_session_id] = { sent: 0, responses: 0 }
        if (log.status === "sent") vaStats[log.va_session_id].sent++
        if (log.status === "response") vaStats[log.va_session_id].responses++
      }
      const vaSessions = throwOnError(await supabase.from("va_sessions").select("session_id, va_name, is_active"))
      const topVAs = vaSessions
        .filter((v: { session_id: string }) => vaStats[v.session_id])
        .map((v: { session_id: string; va_name: string; is_active: boolean }) => ({
          ...v,
          sent: vaStats[v.session_id]?.sent || 0,
          responses: vaStats[v.session_id]?.responses || 0,
        }))
        .sort((a: { sent: number }, b: { sent: number }) => b.sent - a.sent)

      // Conversion funnel
      const { count: totalLeads } = await supabase.from("leads").select("*", { count: "exact", head: true })
      const { count: messaged } = await supabase.from("leads").select("*", { count: "exact", head: true }).in("status", ["in_sequence", "sent", "messaged"])
      const { count: responded } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "responded")
      const { count: booked } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "booked")
      const { count: closed } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "closed")

      return {
        success: true, action, data: {
          dms_today: dmsToday || 0,
          dms_week: dmsWeek || 0,
          dms_all_time: dmsAllTime || 0,
          responses_all_time: responsesAllTime || 0,
          responses_week: responsesWeek || 0,
          response_rate: (dmsAllTime || 0) > 0 ? (((responsesAllTime || 0) / (dmsAllTime || 1)) * 100).toFixed(1) : "0",
          account_health: accountHealth,
          accounts,
          top_vas: topVAs,
          active_vas: vaSessions.filter((v: { is_active: boolean }) => v.is_active).length,
          funnel: {
            total_leads: totalLeads || 0,
            messaged: messaged || 0,
            responded: responded || 0,
            booked: booked || 0,
            closed: closed || 0,
          },
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // LEAD ACTIVITY & NOTES
    // ══════════════════════════════════════════════════════════════════════

    case "get_lead_activity": {
      const leadId = String(body.lead_id || "")
      if (!leadId) return { success: false, error: "Missing lead_id" }
      const limit = Number(body.limit) || 50
      const { data, error } = await supabase
        .from("lead_activity")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(limit)
      if (error) throw new Error(error.message)
      return { success: true, action, data: data || [] }
    }

    case "add_lead_note": {
      const leadId = String(body.lead_id || "")
      const content = String(body.content || "")
      if (!leadId || !content) return { success: false, error: "Missing lead_id or content" }
      const { data, error } = await supabase.from("lead_activity").insert({
        lead_id: leadId,
        activity_type: "note",
        content,
        account_used: String(body.account_used || ""),
        va_name: String(body.va_name || ""),
        business_id: (body.business_id as string) || "default",
      }).select().single()
      if (error) throw new Error(error.message)
      return { success: true, action, data }
    }

    case "log_lead_activity": {
      const leadId = String(body.lead_id || "")
      const activityType = String(body.activity_type || "")
      if (!leadId || !activityType) return { success: false, error: "Missing lead_id or activity_type" }
      const { error } = await supabase.from("lead_activity").insert({
        lead_id: leadId,
        activity_type: activityType,
        content: String(body.content || ""),
        account_used: String(body.account_used || ""),
        va_name: String(body.va_name || ""),
        business_id: (body.business_id as string) || "default",
      })
      if (error) throw new Error(error.message)
      return { success: true, action, message: "Activity logged" }
    }

    // ══════════════════════════════════════════════════════════════════════
    // BULK REMOVE TAGS
    // ══════════════════════════════════════════════════════════════════════

    case "bulk_remove_tags": {
      const ids = body.lead_ids as string[]
      const removeTags = body.tags as string[]
      if (!ids?.length || !removeTags?.length) return { success: false, error: "No lead_ids or tags provided" }
      const existing = throwOnError(
        await supabase.from("leads").select("lead_id, tags").in("lead_id", ids)
      ) as { lead_id: string; tags: string }[]
      const updates = existing.map((lead) => {
        const current = lead.tags ? lead.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : []
        const filtered = current.filter((t: string) => !removeTags.includes(t))
        return { lead_id: lead.lead_id, tags: filtered.join(",") }
      })
      const BATCH = 500
      for (let i = 0; i < updates.length; i += BATCH) {
        const batch = updates.slice(i, i + BATCH)
        await supabase.from("leads").upsert(batch, { onConflict: "lead_id" })
      }
      return { success: true, action, message: `Removed tags from ${ids.length} leads` }
    }

    // ── UPDATE PIPELINE STAGE ─────────────────────────────────────────
    case "update_pipeline_stage": {
      const leadId = String(body.lead_id || "")
      const stage = String(body.pipeline_stage || "new")
      if (!leadId) return { success: false, error: "Missing lead_id" }
      await supabase.from("leads").update({ pipeline_stage: stage }).eq("lead_id", leadId)
      return { success: true, action, message: `Lead ${leadId} moved to ${stage}` }
    }

    // ── PIPELINE LEADS ──────────────────────────────────────────────
    case "get_pipeline_leads": {
      const businessId = body.business_id as string | undefined

      let query = supabase
        .from("leads")
        .select("lead_id, name, city, business_type, total_score, ranking_tier, status, pipeline_stage, tags, last_contacted_at, instagram_url, email, phone")
        .order("total_score", { ascending: false })
        .limit(1000)

      if (businessId) query = query.eq("business_id", businessId)

      const data = throwOnError(await query)
      return { success: true, action, data }
    }

    // ── FOLLOW-UP LEADS ──────────────────────────────────────────────
    case "get_follow_up_leads": {
      const businessId = body.business_id as string | undefined
      const minDays = (body.min_days as number) || 5

      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - minDays)
      const cutoffStr = cutoff.toISOString()

      let query = supabase
        .from("leads")
        .select("lead_id, name, city, status, instagram_url, email, follow_up_count, last_contacted_at, sequence_id")
        .in("status", ["in_sequence", "completed", "messages_ready"])
        .not("status", "eq", "responded")
        .lt("last_contacted_at", cutoffStr)
        .not("last_contacted_at", "is", null)
        .order("last_contacted_at", { ascending: true })
        .limit(200)

      if (businessId) query = query.eq("business_id", businessId)

      const leads = throwOnError(await query) as Record<string, unknown>[]

      const now = Date.now()
      const result = leads.map((l) => ({
        ...l,
        days_since_contact: Math.floor((now - new Date(l.last_contacted_at as string).getTime()) / 86400000),
      }))

      return { success: true, action, data: result }
    }

    case "queue_follow_up": {
      const leadId = body.lead_id as string
      const businessId = body.business_id as string
      if (!leadId) return { success: false, error: "Missing lead_id" }

      // Increment follow_up_count
      const { data: lead } = await supabase.from("leads").select("follow_up_count, name").eq("lead_id", leadId).single()
      const newCount = ((lead?.follow_up_count as number) || 0) + 1
      await supabase.from("leads").update({
        follow_up_count: newCount,
        status: "in_sequence",
      }).eq("lead_id", leadId)

      return { success: true, action, data: { lead_id: leadId, follow_up_count: newCount } }
    }

    // ── RESPONDED LEADS ──────────────────────────────────────────────
    case "get_responded_leads": {
      const businessId = body.business_id as string | undefined

      let query = supabase
        .from("leads")
        .select("lead_id, name, city, status, instagram_url, email, response_category, notes, tags")
        .in("status", ["responded", "booked", "proposal_sent", "closed"])
        .order("scraped_at", { ascending: false })
        .limit(500)

      if (businessId) query = query.eq("business_id", businessId)

      const leads = throwOnError(await query)
      return { success: true, action, data: leads }
    }

    // ── OUTREACH TEMPLATES ──────────────────────────────────────────
    case "get_outreach_templates": {
      const businessId = body.business_id as string | undefined
      let query = supabase.from("outreach_templates").select("*").order("created_at", { ascending: false })
      if (businessId) query = query.eq("business_id", businessId)
      const templates = throwOnError(await query)
      return { success: true, action, data: templates }
    }

    case "create_outreach_template": {
      const { business_id, name, category, body: templateBody, variant } = body as {
        business_id: string; name: string; category: string; body: string; variant: string
      }
      if (!name || !templateBody) return { success: false, error: "Name and body required" }

      const { data, error } = await supabase.from("outreach_templates").insert({
        business_id: business_id || "default",
        name,
        category: category || "Custom",
        body: templateBody,
        variant: variant || "A",
        sends: 0,
        responses: 0,
      }).select().single()

      if (error) throw new Error(error.message)
      return { success: true, action, data }
    }

    case "update_outreach_template": {
      const templateId = body.template_id as string
      const updates = body.updates as Record<string, unknown>
      if (!templateId || !updates) return { success: false, error: "Missing template_id or updates" }

      const { error } = await supabase.from("outreach_templates").update(updates).eq("template_id", templateId)
      if (error) throw new Error(error.message)
      return { success: true, action }
    }

    case "delete_outreach_template": {
      const templateId = body.template_id as string
      if (!templateId) return { success: false, error: "Missing template_id" }

      const { error } = await supabase.from("outreach_templates").delete().eq("template_id", templateId)
      if (error) throw new Error(error.message)
      return { success: true, action }
    }

    // ══════════════════════════════════════════════════════════════════════
    // PROXY IDENTITIES & MULTI-PLATFORM ACCOUNTS
    // ══════════════════════════════════════════════════════════════════════

    case "get_proxy_identities": {
      const data = throwOnError(
        await supabase.from("proxy_identities").select("*").order("group_number", { ascending: true })
      )
      return { success: true, action, data, count: data.length }
    }

    case "create_proxy_identity": {
      const row = {
        group_number: Number(body.group_number),
        proxy_host: String(body.proxy_host || "brd.superproxy.io"),
        proxy_port: String(body.proxy_port || "33335"),
        proxy_username: String(body.proxy_username || ""),
        proxy_password: String(body.proxy_password || ""),
        status: String(body.status || "active"),
        notes: String(body.notes || ""),
      }
      const data = throwOnError(await supabase.from("proxy_identities").insert(row).select())
      return { success: true, action, data }
    }

    case "update_proxy_identity": {
      const id = Number(body.id)
      if (!id) return { success: false, error: "Missing id" }
      const updates: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(body)) {
        if (k !== "action" && k !== "id") updates[k] = v
      }
      const { error } = await supabase.from("proxy_identities").update(updates).eq("id", id)
      if (error) throw new Error(error.message)
      return { success: true, action, message: `Proxy identity ${id} updated` }
    }

    case "delete_proxy_identity": {
      const id = Number(body.id)
      if (!id) return { success: false, error: "Missing id" }
      const { error } = await supabase.from("proxy_identities").delete().eq("id", id)
      if (error) throw new Error(error.message)
      return { success: true, action }
    }

    case "get_outreach_accounts": {
      const platform = body.platform as string | undefined
      const identityGroup = body.identity_group as number | undefined
      let query = supabase.from("outreach_accounts").select("*")
      if (platform && platform !== "all") query = query.eq("platform", platform)
      if (identityGroup !== undefined) query = query.eq("identity_group", identityGroup)
      query = query.order("identity_group", { ascending: true, nullsFirst: false })
      const data = throwOnError(await query)
      return { success: true, action, data, count: data.length }
    }

    case "get_accounts_by_group": {
      const group = Number(body.identity_group)
      const data = throwOnError(
        await supabase.from("outreach_accounts").select("*").eq("identity_group", group)
      )
      return { success: true, action, data, count: data.length }
    }

    case "update_outreach_account": {
      const id = Number(body.id)
      if (!id) return { success: false, error: "Missing id" }
      const updates: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(body)) {
        if (k !== "action" && k !== "id") updates[k] = v
      }
      const { error } = await supabase.from("outreach_accounts").update(updates).eq("id", id)
      if (error) throw new Error(error.message)
      return { success: true, action, message: `Account ${id} updated` }
    }

    case "delete_outreach_account": {
      const id = Number(body.id)
      if (!id) return { success: false, error: "Missing id" }
      const { error } = await supabase.from("outreach_accounts").delete().eq("id", id)
      if (error) throw new Error(error.message)
      return { success: true, action }
    }

    case "bulk_import_accounts": {
      const accounts = body.accounts as Record<string, unknown>[]
      if (!accounts?.length) return { success: false, error: "No accounts provided" }
      const rows = accounts.map((a) => ({
        username: String(a.username || ""),
        password: String(a.password || ""),
        email: String(a.email || ""),
        email_password: String(a.email_password || ""),
        platform: String(a.platform || "instagram"),
        identity_group: a.identity_group ? Number(a.identity_group) : null,
        two_factor_secret: String(a.two_factor_secret || ""),
        cookie: String(a.cookie || ""),
        external_id: String(a.external_id || ""),
        profile_url: String(a.profile_url || ""),
        status: String(a.status || "warming"),
        daily_limit: String(a.daily_limit || "10"),
        sends_today: "0",
        proxy_host: a.identity_group ? String(a.proxy_host || "brd.superproxy.io") : "",
        proxy_port: a.identity_group ? String(a.proxy_port || "33335") : "",
        proxy_username: a.identity_group ? String(a.proxy_username || "") : "",
        proxy_password: a.identity_group ? String(a.proxy_password || "") : "",
      }))
      const { error } = await supabase.from("outreach_accounts").insert(rows)
      if (error) throw new Error(error.message)
      return { success: true, action, message: `Imported ${rows.length} accounts`, count: rows.length }
    }

    // ══════════════════════════════════════════════════════════════════
    // UNIFIED QUEUE SYSTEM
    // ══════════════════════════════════════════════════════════════════

    case "get_queue_state": {
      const vaId = String(body.va_id || "")
      if (!vaId) return { success: false, error: "Missing va_id" }
      const { data, error } = await supabase.from("va_queue_state").select("*").eq("va_id", vaId).single()
      if (error || !data) return { success: true, action, data: null }
      return { success: true, action, data }
    }

    case "save_queue_state": {
      const vaId = String(body.va_id || "")
      if (!vaId) return { success: false, error: "Missing va_id" }
      const row = {
        va_id: vaId,
        queue_type: String(body.queue_type || "content"),
        current_step: String(body.current_step || "content"),
        current_account_idx: Number(body.current_account_idx) || 0,
        current_lead_idx: Number(body.current_lead_idx) || 0,
        updated_at: new Date().toISOString(),
      }
      await supabase.from("va_queue_state").upsert(row, { onConflict: "va_id" })
      return { success: true, action, message: "Queue state saved" }
    }

    case "log_content_post": {
      const row = {
        account_id: String(body.account_id || ""),
        va_id: String(body.va_id || ""),
        content_id: String(body.content_id || ""),
        status: String(body.status || "posted"),
      }
      throwOnError(await supabase.from("content_post_log").insert(row))
      return { success: true, action, message: "Content post logged" }
    }

    case "get_today_content_posts": {
      const vaId = String(body.va_id || "")
      const today = new Date().toISOString().split("T")[0]
      const { data } = await supabase
        .from("content_post_log")
        .select("*")
        .eq("va_id", vaId)
        .gte("posted_at", `${today}T00:00:00`)
      return { success: true, action, data: data || [] }
    }

    case "log_dm_send": {
      const row = {
        lead_id: String(body.lead_id || ""),
        account_id: String(body.account_id || ""),
        va_id: String(body.va_id || ""),
        message_sent: String(body.message_sent || ""),
        status: String(body.status || "sent"),
        notes: body.notes ? String(body.notes) : null,
      }
      throwOnError(await supabase.from("dm_send_log").insert(row))
      // Increment account sends_today
      if (row.status === "sent" && row.account_id) {
        const { data: acct } = await supabase.from("outreach_accounts").select("sends_today").eq("account_id", row.account_id).single()
        await supabase.from("outreach_accounts").update({
          sends_today: (acct?.sends_today || 0) + 1,
          last_used_at: new Date().toISOString(),
        }).eq("account_id", row.account_id)
      }
      // Set account-lead mapping for first contact
      if (row.status === "sent") {
        await supabase.from("account_lead_mapping").upsert(
          { lead_id: row.lead_id, account_id: row.account_id },
          { onConflict: "lead_id", ignoreDuplicates: true }
        )
      }
      return { success: true, action, message: "DM send logged" }
    }

    case "get_today_dm_stats": {
      const vaId = String(body.va_id || "")
      const today = new Date().toISOString().split("T")[0]
      const { data } = await supabase
        .from("dm_send_log")
        .select("status")
        .eq("va_id", vaId)
        .gte("sent_at", `${today}T00:00:00`)
      const logs = data || []
      const sent = logs.filter((l: { status: string }) => l.status === "sent").length
      return { success: true, action, data: { total: logs.length, sent, failed: logs.length - sent } }
    }

    case "get_account_for_lead": {
      const leadId = String(body.lead_id || "")
      const { data } = await supabase.from("account_lead_mapping").select("account_id").eq("lead_id", leadId).single()
      return { success: true, action, data: data?.account_id || null }
    }

    case "set_account_for_lead": {
      await supabase.from("account_lead_mapping").upsert(
        { lead_id: String(body.lead_id), account_id: String(body.account_id) },
        { onConflict: "lead_id" }
      )
      return { success: true, action, message: "Mapping saved" }
    }

    case "get_dm_queue_leads": {
      // Get leads that have AI-generated messages and haven't been DM'd today
      const limit = Number(body.limit) || 200
      const today = new Date().toISOString().split("T")[0]
      
      // Get leads already sent today
      const { data: sentToday } = await supabase
        .from("dm_send_log")
        .select("lead_id")
        .gte("sent_at", `${today}T00:00:00`)
        .in("status", ["sent", "user_not_found"])
      const sentIds = (sentToday || []).map((s: { lead_id: string }) => s.lead_id)

      // Get leads with messages ready
      let query = supabase
        .from("leads")
        .select("lead_id, name, instagram_url, city, state, business_type, status, total_score, ranking_tier")
        .not("instagram_url", "is", null)
        .neq("instagram_url", "")
        .in("status", ["in_sequence", "messages_ready"])
        .order("total_score", { ascending: true })
        .limit(limit)

      if (sentIds.length > 0) {
        query = query.not("lead_id", "in", `(${sentIds.join(",")})`)
      }

      const data = throwOnError(await query)

      // Attach AI messages from messages table
      if (data.length > 0) {
        const leadIds = data.map((l: { lead_id: string }) => l.lead_id)
        const { data: msgs } = await supabase
          .from("messages")
          .select("lead_id, message_body")
          .in("lead_id", leadIds)
          .eq("status", "approved")
        const msgMap: Record<string, string> = {}
        for (const m of (msgs || [])) {
          if (!msgMap[m.lead_id]) msgMap[m.lead_id] = m.message_body
        }

        // Attach account mappings for follow-ups
        const { data: mappings } = await supabase
          .from("account_lead_mapping")
          .select("lead_id, account_id")
          .in("lead_id", leadIds)
        const acctMap: Record<string, string> = {}
        for (const m of (mappings || [])) {
          acctMap[m.lead_id] = m.account_id
        }

        for (const lead of data) {
          const l = lead as Record<string, unknown>
          l.ai_message = msgMap[l.lead_id as string] || null
          l.preferred_account_id = acctMap[l.lead_id as string] || null
        }
      }

      // Only return leads WITH messages
      const withMessages = data.filter((l: Record<string, unknown>) => l.ai_message)
      return { success: true, action, data: withMessages, count: withMessages.length }
    }

    case "get_all_va_queue_status": {
      // Get all VA sessions with their queue state and today's stats
      const today = new Date().toISOString().split("T")[0]
      const { data: sessions } = await supabase.from("va_sessions").select("*").eq("is_active", true)
      const { data: states } = await supabase.from("va_queue_state").select("*")
      const { data: dmLogs } = await supabase
        .from("dm_send_log")
        .select("va_id, status")
        .gte("sent_at", `${today}T00:00:00`)
      const { data: contentLogs } = await supabase
        .from("content_post_log")
        .select("va_id, status")
        .gte("posted_at", `${today}T00:00:00`)

      const stateMap: Record<string, Record<string, unknown>> = {}
      for (const s of (states || [])) stateMap[s.va_id] = s

      const dmCountMap: Record<string, number> = {}
      for (const l of (dmLogs || [])) {
        if (l.status === "sent") dmCountMap[l.va_id] = (dmCountMap[l.va_id] || 0) + 1
      }
      const contentCountMap: Record<string, number> = {}
      for (const l of (contentLogs || [])) {
        if (l.status === "posted") contentCountMap[l.va_id] = (contentCountMap[l.va_id] || 0) + 1
      }

      const result = (sessions || []).map((s: Record<string, unknown>) => {
        const state = stateMap[s.session_id as string] || {}
        return {
          va_id: s.session_id,
          va_name: s.va_name,
          queue_type: state.queue_type || "content",
          current_step: state.current_step || "content",
          current_account_idx: state.current_account_idx || 0,
          current_lead_idx: state.current_lead_idx || 0,
          dms_today: dmCountMap[s.session_id as string] || 0,
          content_today: contentCountMap[s.session_id as string] || 0,
        }
      })

      return { success: true, action, data: result }
    }

    case "get_admin_dm_log": {
      const limit = Number(body.limit) || 100
      const { data } = await supabase
        .from("dm_send_log")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(limit)
      return { success: true, action, data: data || [] }
    }

    default:
      return { success: false, error: `Unknown action: ${action}` }
  }
}
