import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Platform → critical session cookie name(s). If missing, treat as expired.
const CRITICAL_COOKIES: Record<string, string[]> = {
  instagram: ["sessionid"],
  facebook: ["c_user", "xs"],
  linkedin: ["li_at"],
  tiktok: ["sessionid"],
  twitter: ["auth_token"],
  x: ["auth_token"],
  youtube: ["SAPISID"],
  pinterest: ["_pinterest_sess"],
  snapchat: ["sc-a-session"],
}

// Typical cookie lifespan — after this many hours of silence we mark "stale"
// (but not expired; user can still try).
const STALE_AFTER_HOURS = 24
const EXPIRED_AFTER_HOURS = 24 * 14 // 2 weeks without use → treat as dead

// GET /api/accounts/:id/cookies/health
// Returns: { health, updated_at, age_minutes, missing_critical, cookie_count }
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const account_id = params.id
  if (!account_id) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 })
  }

  const { data: account, error } = await supabase
    .from("accounts")
    .select("account_id, platform, session_cookie, cookies_updated_at")
    .eq("account_id", account_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 })

  const platform = String(account.platform || "").toLowerCase()
  const critical = CRITICAL_COOKIES[platform] || []

  let cookies: any[] = []
  if (account.session_cookie) {
    try {
      const parsed =
        typeof account.session_cookie === "string"
          ? JSON.parse(account.session_cookie)
          : account.session_cookie
      if (Array.isArray(parsed)) cookies = parsed
    } catch {
      // non-JSON cookie string — treat as unparseable
    }
  }

  const cookieNames = new Set(cookies.map((c) => c && c.name).filter(Boolean))
  const missing_critical = critical.filter((n) => !cookieNames.has(n))

  const updatedAt = account.cookies_updated_at
    ? new Date(account.cookies_updated_at).getTime()
    : null
  const now = Date.now()
  const age_minutes =
    updatedAt !== null ? Math.floor((now - updatedAt) / 60000) : null

  let health: "healthy" | "stale" | "expired" | "unknown" = "unknown"
  if (cookies.length === 0) {
    health = "expired"
  } else if (missing_critical.length > 0) {
    health = "expired"
  } else if (age_minutes === null) {
    health = "unknown"
  } else if (age_minutes > EXPIRED_AFTER_HOURS * 60) {
    health = "expired"
  } else if (age_minutes > STALE_AFTER_HOURS * 60) {
    health = "stale"
  } else {
    health = "healthy"
  }

  // Persist latest computation so the cron doesn't need to re-derive
  await supabase
    .from("accounts")
    .update({
      cookies_health: health,
      cookies_last_check: new Date().toISOString(),
    })
    .eq("account_id", account_id)

  return NextResponse.json({
    health,
    updated_at: account.cookies_updated_at,
    age_minutes,
    missing_critical,
    cookie_count: cookies.length,
  })
}
