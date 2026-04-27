// Accounts are Supabase-backed. NEVER embed credentials in source.
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

interface GoLoginProfile {
  id: string
  name: string
  proxyEnabled: boolean
  proxy?: { host?: string; port?: number; mode?: string }
  canBeRunning: boolean
  runDisabledReason?: string | null
  os: string
  browserType: string
  createdAt: string
  updatedAt: string
  navigator?: { userAgent?: string }
  startUrl?: string
  notes?: string
  s3Path?: string
  s3Date?: string
  checkCookies?: boolean
  tags?: string[]
  lockEnabled?: boolean
  autoLang?: boolean
  geolocation?: { fillBasedOnIp?: boolean }
  timezone?: { fillBasedOnIp?: boolean }
}

interface AccountRecord {
  platform: "instagram" | "facebook" | "linkedin"
  index: number
  username?: string
  password?: string
  twofa?: string
  email?: string
  emailPassword?: string
  cookie?: string
  phone?: string
  displayName?: string
  profileUrl?: string
  profileUuid?: string
  goLoginId?: string
  goLoginName?: string
  proxyInfo?: string
  goLoginStatus: "ready" | "no-proxy" | "not-setup"
  // GoLogin live data
  goLoginProfileName?: string
  goLoginCanRun?: boolean
  goLoginRunDisabled?: string | null
  goLoginOS?: string
  goLoginBrowser?: string
  goLoginLastUpdated?: string
  goLoginCreated?: string
  goLoginProxyEnabled?: boolean
  goLoginProxyHost?: string
  goLoginStartUrl?: string
  goLoginHasSession?: boolean
  goLoginUserAgent?: string
  goLoginTags?: string[]
  goLoginLocked?: boolean
  goLoginNotes?: string
}

const GOLOGIN_IDS: Record<string, string> = {
  "instagram_1": "69a4a3dd4172109758da71d1",
  "instagram_2": "69a4a3f0e8ed6d21d1dab88f",
  "instagram_3": "69a4a3f2c7235af0af2fe4d4",
  "instagram_4": "69a4a3f37c294c30f827cced",
  "instagram_5": "69a4a3f4d5d68dd11e5ac885",
  "instagram_6": "69a4a3f582c5099a461fe193",
  "instagram_7": "69a4a3f6efb0fd4a2fe9a91c",
  "instagram_8": "69a4a3f84172109758da9160",
  "instagram_9": "69a4a3f94172109758da9422",
  "instagram_10": "69a4a3fad5d68dd11e5acb76",
  "facebook_1": "69a4a3fb2c59fa363a4d1777",
  "facebook_2": "69a4a3fc82c5099a461fe7b6",
  "facebook_3": "69a4a3fe82c5099a461fe90e",
  "facebook_4": "69a4a3ff3d9ce0afe7c2edeb",
  "facebook_5": "69a4a4003cf3ea5b9af1a206",
  "facebook_6": "69a4a4012c59fa363a4d1bd8",
  "facebook_7": "69a4a4024172109758da98ac",
  "facebook_8": "69a4a404c7235af0af2ff50f",
  "facebook_9": "69a4a40582c5099a461ff2aa",
  "facebook_10": "69a4a4064172109758da9b67",
  "linkedin_1": "69a4a407a2495392a2acc16a",
  "linkedin_2": "69a4a4082c59fa363a4d2379",
  "linkedin_3": "69a4a40a82c5099a461ff641",
  "linkedin_4": "69a4a40b4172109758da9d52",
  "linkedin_5": "69a4a40c2c59fa363a4d2895",
  "linkedin_6": "69a4a40da998b00580d026f0",
  "linkedin_7": "69a4a40e2c59fa363a4d2b28",
  "linkedin_8": "69a4a40f82c5099a461ffc0f",
  "linkedin_9": "69a4a4117c294c30f827f648",
  "linkedin_10": "69a4a4124172109758daa4b5",
}

// Row as stored in Supabase `outreach_accounts`. Columns are superset;
// only those used here are typed. Unknown columns are tolerated.
interface OutreachAccountRow {
  username?: string | null
  password?: string | null
  email?: string | null
  email_password?: string | null
  two_factor_secret?: string | null
  cookie?: string | null
  platform?: string | null
  identity_group?: number | null
  external_id?: string | null
  profile_url?: string | null
  status?: string | null
  display_name?: string | null
}

// Pull accounts from Supabase and shape them into the AccountRecord the
// UI consumes. We deliberately keep the wire format identical to the
// previous route so no frontend changes are required.
async function loadAccountsFromSupabase(): Promise<AccountRecord[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error("[accounts/all] Supabase env not configured; returning empty list.")
    return []
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await supabase
    .from("outreach_accounts")
    .select("username,password,email,email_password,two_factor_secret,cookie,platform,identity_group,external_id,profile_url,status,display_name")

  if (error) {
    console.error("[accounts/all] Supabase fetch failed:", error.message)
    return []
  }

  const rows = (data || []) as OutreachAccountRow[]
  const PLATFORMS = ["instagram", "facebook", "linkedin"] as const
  type Platform = typeof PLATFORMS[number]
  const counters: Record<Platform, number> = { instagram: 0, facebook: 0, linkedin: 0 }
  const accounts: AccountRecord[] = []

  for (const r of rows) {
    const platform = (r.platform || "").toLowerCase()
    if (!PLATFORMS.includes(platform as Platform)) continue
    const p = platform as Platform
    // Prefer the identity_group column (1..N) so ordering stays stable.
    // Fall back to an insertion-order counter when it's missing.
    const index = typeof r.identity_group === "number" && r.identity_group > 0
      ? r.identity_group
      : ++counters[p]
    if (r.identity_group == null) counters[p] = Math.max(counters[p], index)

    const base: AccountRecord = {
      platform: p,
      index,
      goLoginStatus: "not-setup",
    }
    if (r.username) base.username = r.username
    if (r.password) base.password = r.password
    if (r.two_factor_secret) base.twofa = r.two_factor_secret
    if (r.email) base.email = r.email
    if (r.email_password) base.emailPassword = r.email_password
    if (r.cookie) base.cookie = r.cookie
    if (p === "facebook" && r.external_id) base.phone = r.external_id
    if (p === "facebook" && r.display_name) base.displayName = r.display_name
    if (p === "instagram" && r.display_name) base.displayName = r.display_name
    if (p === "linkedin" && r.profile_url) base.profileUrl = r.profile_url
    if (p !== "facebook" && r.external_id) base.profileUuid = r.external_id
    accounts.push(base)
  }

  // Deterministic order: platform, then index.
  accounts.sort((a, b) => {
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform)
    return a.index - b.index
  })
  return accounts
}

export async function GET() {
  try {
    const accounts = await loadAccountsFromSupabase()

    // Fetch live GoLogin profiles (list + individual details for session status)
    let goLoginProfiles: Record<string, GoLoginProfile> = {}
    const { getSecret } = await import("@/lib/secrets")
    const token = await getSecret("GOLOGIN_API_TOKEN")
    if (token) {
      try {
        // First get list for basic info
        const res = await fetch("https://api.gologin.com/browser/v2?limit=100", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        if (res.ok) {
          const data = await res.json()
          for (const p of (data.profiles || [])) {
            goLoginProfiles[p.id] = p
          }

          // Fetch individual profiles + cookies in parallel for real login status
          const ids = Object.keys(goLoginProfiles)
          const [details, cookies] = await Promise.all([
            Promise.allSettled(
              ids.map(id =>
                fetch(`https://api.gologin.com/browser/${id}`, {
                  headers: { Authorization: `Bearer ${token}` },
                  cache: "no-store",
                }).then(r => r.ok ? r.json() : null)
              )
            ),
            Promise.allSettled(
              ids.map(id =>
                fetch(`https://api.gologin.com/browser/${id}/cookies`, {
                  headers: { Authorization: `Bearer ${token}` },
                  cache: "no-store",
                }).then(r => r.ok ? r.json() : null)
              )
            ),
          ])

          for (let i = 0; i < ids.length; i++) {
            const detailResult = details[i]
            if (detailResult.status === "fulfilled" && detailResult.value) {
              goLoginProfiles[ids[i]] = { ...goLoginProfiles[ids[i]], ...detailResult.value }
            }
            // Check cookies for actual platform login
            const cookieResult = cookies[i]
            if (cookieResult.status === "fulfilled" && Array.isArray(cookieResult.value)) {
              const cookieList = cookieResult.value as Array<{ name: string; domain: string }>
              const igCookies = cookieList.filter(c => c.domain?.includes("instagram"))
              const fbCookies = cookieList.filter(c => c.domain?.includes("facebook"))
              const liCookies = cookieList.filter(c => c.domain?.includes("linkedin"))
              const hasIgSession = igCookies.some(c => c.name === "sessionid")
              const hasFbSession = fbCookies.some(c => c.name === "c_user")
              const hasLiSession = liCookies.some(c => c.name === "li_at")
              ;(goLoginProfiles[ids[i]] as any)._loggedIn = hasIgSession || hasFbSession || hasLiSession
              ;(goLoginProfiles[ids[i]] as any)._cookieCount = cookieList.length
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch GoLogin profiles:", e)
      }
    }

    // Enrich with GoLogin data
    const enriched = accounts.map((acct) => {
      const key = `${acct.platform}_${acct.index}`
      const goLoginId = GOLOGIN_IDS[key]
      if (goLoginId) {
        const profile = goLoginProfiles[goLoginId]
        const proxySession = `session-${acct.platform.slice(0,2)}${String(acct.index).padStart(2,"0")}`
        const base: AccountRecord = {
          ...acct,
          goLoginId,
          goLoginStatus: "ready" as const,
          proxyInfo: `brd.superproxy.io:33335 (${proxySession})`,
        }
        if (profile) {
          base.goLoginProfileName = profile.name
          base.goLoginCanRun = profile.canBeRunning
          base.goLoginRunDisabled = profile.runDisabledReason
          base.goLoginOS = profile.os
          base.goLoginBrowser = profile.browserType
          base.goLoginLastUpdated = profile.updatedAt
          base.goLoginCreated = profile.createdAt
          base.goLoginProxyEnabled = profile.proxyEnabled
          base.goLoginProxyHost = profile.proxy?.host
          base.goLoginStartUrl = profile.startUrl || undefined
          // Use cookie check for real login status, fall back to s3Path for "browser opened"
          base.goLoginHasSession = !!(profile as any)._loggedIn
          base.goLoginUserAgent = profile.navigator?.userAgent
          base.goLoginTags = profile.tags
          base.goLoginLocked = profile.lockEnabled
          base.goLoginNotes = profile.notes
          base.goLoginName = profile.name
        }
        return base
      }
      return acct
    })

    return NextResponse.json({ accounts: enriched, total: enriched.length })
  } catch (error) {
    console.error("Error loading accounts:", error)
    return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 })
  }
}
