import { supabase, throwOnError } from "./helpers"
import type { ActionHandler } from "../types"

// Per-platform STRICT auth cookies — only names that, on their own, prove an
// active logged-in session. Names like `JSESSIONID` (LinkedIn) or `ds_user_id`
// (Instagram) get set even on a logged-out / first-touch session, so they
// were producing false-positive "Active" badges. The hardened list below is
// the single cookie each platform sets exclusively after a successful login.
//
// Reference: live verification on 2026-05-04 confirmed LinkedIn @dclancy05
// had JSESSIONID but NO li_at — the old logic was reporting Active when
// the platform had no auth at all.
const AUTH_COOKIE_NAMES: Record<string, string[]> = {
  instagram: ["sessionid"],
  facebook: ["c_user"],
  linkedin: ["li_at"],
  tiktok: ["sessionid"],
  youtube: ["__Secure-1PSID"],
  snapchat: ["sc-a-session"],
  x: ["auth_token"],
  twitter: ["auth_token"],
  pinterest: ["_auth"],
  threads: ["sessionid"],
  google: ["__Secure-1PSID"],
}

// Cookie jars show up in three shapes depending on source:
// (1) array of {name, value, expires} — from account_sessions.cookies
// (2) JSON string of that array — from accounts.session_cookie (new captures)
// (3) legacy empty string — pre-noVNC imports
// Normalize all three to the array form so the caller has one thing to scan.
function parseCookies(raw: unknown): Array<{ name: string; value?: string; expires?: number }> {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as Array<{ name: string; value?: string; expires?: number }>
  if (typeof raw === "string") {
    if (!raw.trim()) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

const handlers: Record<string, ActionHandler> = {
  get_accounts: async (action, body) => {
    const businessId = body.business_id as string | undefined
    const limit = Number(body.limit) || 50
    const offset = Number(body.offset) || 0
    let query = supabase.from("accounts").select("*", { count: "exact" })
    if (businessId) query = query.eq("business_id", businessId)
    query = query.range(offset, offset + limit - 1)
    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    const accounts = (data || []) as Array<Record<string, unknown>>

    // Pull the freshest active account_sessions row per account so the UI can
    // compute a REAL login state instead of trusting the stale accounts.status
    // column (which never gets downgraded when cookies expire).
    const accountIds = accounts.map(a => String((a as Record<string, unknown>).account_id || "")).filter(Boolean)
    const sessionByAccount: Record<string, { cookies: unknown; last_verified_at: string | null; created_at: string | null }> = {}
    if (accountIds.length > 0) {
      const { data: sessRows } = await supabase
        .from("account_sessions")
        .select("account_id, cookies, last_verified_at, created_at, status")
        .in("account_id", accountIds)
        .eq("status", "active")
        .order("created_at", { ascending: false })
      for (const row of (sessRows || []) as Array<{
        account_id: string; cookies: unknown; last_verified_at: string | null; created_at: string | null
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

    const now = Date.now()
    const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000    // 7d — still considered logged in
    const EXPIRED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000  // 7-30d — "expired", very likely needs sign-in

    const enriched = accounts.map(acct => {
      const a = acct as Record<string, unknown> & { account_id?: string; platform?: string; status?: string; session_cookie?: unknown }
      const platform = String(a.platform || "").toLowerCase()
      const wanted = AUTH_COOKIE_NAMES[platform] || []

      const sess = a.account_id ? sessionByAccount[String(a.account_id)] : undefined
      const sessionCookies = sess ? parseCookies(sess.cookies) : []
      const mirrorCookies = parseCookies(a.session_cookie)
      const allCookies = sessionCookies.length > 0 ? sessionCookies : mirrorCookies

      const hasAuthCookie = wanted.length > 0 && allCookies.some(c => {
        if (!c || typeof c !== "object") return false
        if (!wanted.includes(c.name)) return false
        if (!c.value) return false
        // Chrome CDP emits `expires` as fractional seconds-since-epoch.
        // Session cookies have expires=0 or undefined — those are OK to trust
        // (they die when the browser closes, but that's a Chrome problem).
        if (typeof c.expires === "number" && c.expires > 0) {
          if (c.expires * 1000 < now) return false
        }
        return true
      })

      const verifiedAt = sess?.last_verified_at || sess?.created_at || null
      const ageMs = verifiedAt ? (now - new Date(verifiedAt).getTime()) : Infinity
      const sessionAgeHours = verifiedAt ? Math.floor(ageMs / (60 * 60 * 1000)) : null

      // Derive real status. Banned/flagged/cooldown are lifecycle states we
      // preserve from the DB — they're not overridden by cookie freshness.
      let derivedStatus: string
      const raw = String(a.status || "")
      if (raw === "banned" || raw === "flagged" || raw === "cooldown") {
        derivedStatus = raw
      } else if (!sess && !hasAuthCookie) {
        derivedStatus = "needs_signin"
      } else if (!hasAuthCookie) {
        derivedStatus = "needs_signin"
      } else if (ageMs > EXPIRED_WINDOW_MS) {
        derivedStatus = "needs_signin"
      } else if (ageMs > ACTIVE_WINDOW_MS) {
        derivedStatus = "expired"
      } else if (raw === "warming") {
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

    return { success: true, action, data: enriched, count: count || enriched.length }
  },

  update_account: async (action, body) => {
    const acct = body as Record<string, unknown>
    if (!acct.account_id) return { success: false, error: "Missing account_id" }

    // Server-side enforcement: one account per platform per proxy group
    const proxyGroupId = acct.proxy_group_id ? String(acct.proxy_group_id) : null
    const platform = acct.platform ? String(acct.platform) : null
    if (proxyGroupId && platform) {
      const { data: existing } = await supabase
        .from("accounts")
        .select("account_id")
        .eq("proxy_group_id", proxyGroupId)
        .eq("platform", platform)
        .neq("account_id", String(acct.account_id))
        .limit(1)
      if (existing && existing.length > 0) {
        return { success: false, error: `This proxy group already has a ${platform} account. Each proxy can only have one account per platform.` }
      }
    }

    // Columns that can't take empty strings — null them instead
    const nullIfEmpty = new Set([
      "proxy_group_id", "warmup_sequence_id", "chrome_profile_id", "persona_id",
      "daily_limit", "warmup_day", "health_score", "sends_today",
      "cooldown_until", "last_used_at", "profile_screenshot_at", "warmup_started_at", "warmup_complete_at",
    ])
    const data: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(acct)) {
      if (k === "action") continue
      const str = v == null ? "" : String(v)
      if (nullIfEmpty.has(k) && str === "") { data[k] = null; continue }
      data[k] = str
    }
    const { error } = await supabase.from("accounts").upsert(data)
    if (error) return { success: false, error: error.message }
    return { success: true, action, message: "Account updated" }
  },

  create_account: async (action, body) => {
    // Legacy /api/dashboard action — kept for callers that still POST
    // {action:"create_account",...}. Used to write `chrome_profile_name`,
    // `chrome_profile_path`, and `created_at`, none of which exist on the
    // deployed `accounts` table (they were recording-service-era columns).
    // Dropped 2026-05-02 after a real-browser test surfaced the
    // schema-cache 500. Modern callers should use POST /api/accounts.
    const accountId = body.account_id || `acct_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const row: Record<string, unknown> = {
      account_id: String(accountId), platform: String(body.platform || "instagram"),
      display_name: String(body.display_name || ""), username: String(body.username || ""),
      status: String(body.status || "active"), daily_limit: String(body.daily_limit || "30"), sends_today: "0",
      session_cookie: String(body.session_cookie || ""), profile_url: String(body.profile_url || ""),
      notes: String(body.notes || ""), business_id: (body.business_id as string) || "default",
    }
    const { error } = await supabase.from("accounts").upsert(row)
    if (error) return { success: false, error: error.message }
    return { success: true, action, data: row }
  },

  delete_account: async (action, body) => {
    const accountId = String(body.account_id || "")
    if (!accountId) return { success: false, error: "Missing account_id" }
    const { error } = await supabase.from("accounts").delete().eq("account_id", accountId)
    if (error) return { success: false, error: error.message }
    return { success: true, action, message: `Account ${accountId} deleted` }
  },

  delete_accounts: async (action, body) => {
    const ids = body.account_ids as string[]
    if (!ids?.length) return { success: false, error: "No account_ids provided" }
    await supabase.from("accounts").delete().in("account_id", ids)
    return { success: true, action, message: `Deleted ${ids.length} accounts` }
  },

  get_available_account: async (action, body) => {
    const platform = String(body.platform || "")
    if (!platform) return { success: false, error: "Missing platform" }
    const now = new Date()
    const { data: accounts, error } = await supabase.from("accounts").select("*").eq("platform", platform.replace("_dm", "")).eq("status", "active")
    if (error) return { success: false, error: error.message }
    if (!accounts?.length) return { success: true, action, data: null, message: "No accounts available for this platform" }
    for (const account of accounts) {
      const sendsToday = parseInt(account.sends_today || "0"); const dailyLimit = parseInt(account.daily_limit || "50")
      if (sendsToday >= dailyLimit) continue
      if (account.cooldown_until) { const cooldownUntil = new Date(account.cooldown_until); if (cooldownUntil > now) continue }
      return { success: true, action, data: account }
    }
    return { success: true, action, data: null, message: "All accounts at limit or on cooldown" }
  },

  increment_account_sends: async (action, body) => {
    const accountId = String(body.account_id || "")
    if (!accountId) return { success: false, error: "Missing account_id" }
    const { data: account, error: fetchError } = await supabase.from("accounts").select("sends_today").eq("account_id", accountId).single()
    if (fetchError) return { success: false, error: fetchError.message }
    const currentSends = parseInt(account?.sends_today || "0")
    const { error } = await supabase.from("accounts").update({ sends_today: String(currentSends + 1), last_used_at: new Date().toISOString() }).eq("account_id", accountId)
    if (error) return { success: false, error: error.message }
    return { success: true, action, message: `Account ${accountId} sends incremented` }
  },

  reset_daily_send_counts: async (action) => {
    const { error } = await supabase.from("accounts").update({ sends_today: "0" }).neq("sends_today", "0")
    if (error) return { success: false, error: error.message }
    return { success: true, action, message: "Daily send counts reset" }
  },

  // Outreach accounts (VA system)
  get_outreach_accounts: async (action, body) => {
    const platform = body.platform as string | undefined
    const identityGroup = body.identity_group as number | undefined
    let query = supabase.from("outreach_accounts").select("*")
    if (platform && platform !== "all") query = query.eq("platform", platform)
    if (identityGroup !== undefined) query = query.eq("identity_group", identityGroup)
    query = query.order("identity_group", { ascending: true, nullsFirst: false })
    const data = throwOnError(await query)
    return { success: true, action, data, count: data.length }
  },

  create_outreach_account: async (action, body) => {
    const row = {
      username: String(body.username || ""), password: String(body.password || ""),
      email: String(body.email || ""), email_password: String(body.email_password || ""),
      proxy_host: String(body.proxy_host || ""), proxy_port: String(body.proxy_port || ""),
      proxy_username: String(body.proxy_username || ""), proxy_password: String(body.proxy_password || ""),
      status: String(body.status || "warming"), daily_limit: Number(body.daily_limit) || 5,
      sends_today: 0, warmup_start_date: new Date().toISOString().split("T")[0], warmup_day: 1,
      notes: String(body.notes || ""),
    }
    const data = throwOnError(await supabase.from("outreach_accounts").insert(row).select().single() as any)
    return { success: true, action, data }
  },

  update_outreach_account: async (action, body) => {
    // Support both account_id (string) and id (number) lookups
    const accountId = body.account_id ? String(body.account_id) : null
    const id = body.id ? Number(body.id) : null
    if (!accountId && !id) return { success: false, error: "Missing account_id or id" }
    const updates: Record<string, unknown> = {}
    const allowed = ["username", "password", "email", "email_password", "proxy_host", "proxy_port", "proxy_username", "proxy_password", "status", "daily_limit", "sends_today", "warmup_start_date", "warmup_day", "notes", "last_used_at", "platform", "identity_group", "persona_id"]
    for (const k of allowed) { if (body[k] !== undefined) updates[k] = body[k] }
    // Also accept generic updates
    for (const [k, v] of Object.entries(body)) { if (k !== "action" && k !== "id" && k !== "account_id") updates[k] = v }
    if (accountId) {
      await supabase.from("outreach_accounts").update(updates).eq("account_id", accountId)
      return { success: true, action, message: `Account ${accountId} updated` }
    } else {
      const { error } = await supabase.from("outreach_accounts").update(updates).eq("id", id!)
      if (error) throw new Error(error.message)
      return { success: true, action, message: `Account ${id} updated` }
    }
  },

  delete_outreach_account: async (action, body) => {
    const accountId = body.account_id ? String(body.account_id) : null
    const id = body.id ? Number(body.id) : null
    if (!accountId && !id) return { success: false, error: "Missing account_id or id" }
    if (accountId) {
      await supabase.from("outreach_accounts").delete().eq("account_id", accountId)
      return { success: true, action, message: `Account ${accountId} deleted` }
    } else {
      const { error } = await supabase.from("outreach_accounts").delete().eq("id", id!)
      if (error) throw new Error(error.message)
      return { success: true, action }
    }
  },

  get_accounts_by_group: async (action, body) => {
    const group = Number(body.identity_group)
    const data = throwOnError(await supabase.from("outreach_accounts").select("*").eq("identity_group", group))
    return { success: true, action, data, count: data.length }
  },

  bulk_import_accounts: async (action, body) => {
    const accounts = body.accounts as Record<string, unknown>[]
    if (!accounts?.length) return { success: false, error: "No accounts provided" }
    const rows = accounts.map((a) => ({
      username: String(a.username || ""), password: String(a.password || ""), email: String(a.email || ""),
      email_password: String(a.email_password || ""), platform: String(a.platform || "instagram"),
      identity_group: a.identity_group ? Number(a.identity_group) : null,
      two_factor_secret: String(a.two_factor_secret || ""), cookie: String(a.cookie || ""),
      external_id: String(a.external_id || ""), profile_url: String(a.profile_url || ""),
      status: String(a.status || "warming"), daily_limit: String(a.daily_limit || "10"), sends_today: "0",
      proxy_host: a.identity_group ? String(a.proxy_host || "brd.superproxy.io") : "",
      proxy_port: a.identity_group ? String(a.proxy_port || "33335") : "",
      proxy_username: a.identity_group ? String(a.proxy_username || "") : "",
      proxy_password: a.identity_group ? String(a.proxy_password || "") : "",
    }))
    const { error } = await supabase.from("outreach_accounts").insert(rows)
    if (error) throw new Error(error.message)
    return { success: true, action, message: `Imported ${rows.length} accounts`, count: rows.length }
  },

  // Chrome/Playwright profiles (merged - uses chrome_profiles table with playwright_profiles fallback)
  get_profiles: async (action, body) => {
    // Try chrome_profiles first, fall back to playwright_profiles
    const { data, error } = await supabase.from("chrome_profiles").select("*")
    if (error) {
      const { data: pwData, error: pwError } = await supabase.from("playwright_profiles").select("*").order("created_at", { ascending: true })
      if (pwError) return { success: true, action, data: [], count: 0 }
      return { success: true, action, data: pwData || [], count: (pwData || []).length }
    }
    return { success: true, action, data: data || [], count: (data || []).length }
  },

  create_profile: async (action, body) => {
    const id = `profile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const row = {
      id, name: String(body.name || ""), profile_path: String(body.profile_path || ""),
      purpose: String(body.purpose || "outreach"), platforms: body.platforms || [],
      notes: String(body.notes || ""), is_active: true, created_at: new Date().toISOString(),
    }
    const { error } = await supabase.from("chrome_profiles").insert(row)
    if (error) {
      // Fallback to playwright_profiles
      const { data, error: pwError } = await supabase.from("playwright_profiles").insert(row).select("*").single()
      if (pwError) throw new Error(pwError.message)
      return { success: true, action, data }
    }
    return { success: true, action, data: row }
  },

  update_profile: async (action, body) => {
    const id = String(body.id || "")
    if (!id) return { success: false, error: "Missing id" }
    const updates: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) { if (k !== "action" && k !== "id" && k !== "business_id") updates[k] = v }
    const { error } = await supabase.from("chrome_profiles").update(updates).eq("id", id)
    if (error) {
      const { error: pwError } = await supabase.from("playwright_profiles").update(updates).eq("id", id)
      if (pwError) throw new Error(pwError.message)
    }
    return { success: true, action, message: `Profile ${id} updated` }
  },

  delete_profile: async (action, body) => {
    const id = String(body.id || "")
    if (!id) return { success: false, error: "Missing id" }
    const { error } = await supabase.from("chrome_profiles").delete().eq("id", id)
    if (error) {
      const { error: pwError } = await supabase.from("playwright_profiles").delete().eq("id", id)
      if (pwError) throw new Error(pwError.message)
    }
    return { success: true, action, message: `Profile ${id} deleted` }
  },

  get_chrome_profiles: async (action, body) => {
    const businessId = body.business_id as string | undefined
    let query = supabase.from("chrome_profiles").select("*")
    if (businessId) query = query.eq("business_id", businessId)
    query = query.order("profile_name", { ascending: true })
    const { data, error } = await query
    if (error) return { success: true, action, data: [] }
    return { success: true, action, data: data || [] }
  },

  // Proxy identities
  get_proxy_identities: async (action) => {
    const data = throwOnError(await supabase.from("proxy_identities").select("*").order("group_number", { ascending: true }))
    return { success: true, action, data, count: data.length }
  },

  create_proxy_identity: async (action, body) => {
    const row = {
      group_number: Number(body.group_number), proxy_host: String(body.proxy_host || "brd.superproxy.io"),
      proxy_port: String(body.proxy_port || "33335"), proxy_username: String(body.proxy_username || ""),
      proxy_password: String(body.proxy_password || ""), status: String(body.status || "active"),
      notes: String(body.notes || ""),
    }
    const data = throwOnError(await supabase.from("proxy_identities").insert(row).select())
    return { success: true, action, data }
  },

  update_proxy_identity: async (action, body) => {
    const id = Number(body.id)
    if (!id) return { success: false, error: "Missing id" }
    const updates: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) { if (k !== "action" && k !== "id") updates[k] = v }
    const { error } = await supabase.from("proxy_identities").update(updates).eq("id", id)
    if (error) throw new Error(error.message)
    return { success: true, action, message: `Proxy identity ${id} updated` }
  },

  delete_proxy_identity: async (action, body) => {
    const id = Number(body.id)
    if (!id) return { success: false, error: "Missing id" }
    const { error } = await supabase.from("proxy_identities").delete().eq("id", id)
    if (error) throw new Error(error.message)
    return { success: true, action }
  },

  assign_persona_to_account: async (action, body) => {
    const accountId = String(body.account_id || "")
    const personaId = body.persona_id ? String(body.persona_id) : null
    if (!accountId) return { success: false, error: "Missing account_id" }
    await supabase.from("outreach_accounts").update({ persona_id: personaId }).eq("account_id", accountId)
    return { success: true, action, message: `Persona assigned to account ${accountId}` }
  },
}

export default handlers
