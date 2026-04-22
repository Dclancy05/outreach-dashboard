import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

const STALE_AFTER_HOURS = 24
const EXPIRED_AFTER_HOURS = 24 * 14

// Hourly cron — scans every account, re-computes cookies_health, writes it
// back. Dashboard UI reads the cached column so the health badge stays fast
// even with 100+ accounts.
async function handle(req: NextRequest) {
  // Vercel Cron sends GET with a signed header. For safety also accept the
  // same Bearer CRON_SECRET pattern other routes use.
  const auth = req.headers.get("authorization") || ""
  const expected = process.env.CRON_SECRET || ""
  const userAgent = req.headers.get("user-agent") || ""
  const isVercelCron = userAgent.toLowerCase().includes("vercel")
  if (!isVercelCron) {
    if (!expected)
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
    if (auth !== `Bearer ${expected}`)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const startedAt = Date.now()

  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("account_id, platform, session_cookie, cookies_updated_at")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let healthy = 0
  let stale = 0
  let expired = 0
  let unknown = 0
  const updates: Array<{ account_id: string; cookies_health: string }> = []

  for (const acct of accounts || []) {
    const platform = String(acct.platform || "").toLowerCase()
    const critical = CRITICAL_COOKIES[platform] || []

    let cookies: any[] = []
    if (acct.session_cookie) {
      try {
        const parsed =
          typeof acct.session_cookie === "string"
            ? JSON.parse(acct.session_cookie)
            : acct.session_cookie
        if (Array.isArray(parsed)) cookies = parsed
      } catch {}
    }
    const cookieNames = new Set(cookies.map((c) => c && c.name).filter(Boolean))
    const missing_critical = critical.filter((n) => !cookieNames.has(n))

    const updatedAt = acct.cookies_updated_at
      ? new Date(acct.cookies_updated_at).getTime()
      : null
    const age_minutes =
      updatedAt !== null ? Math.floor((Date.now() - updatedAt) / 60000) : null

    let health: "healthy" | "stale" | "expired" | "unknown" = "unknown"
    if (cookies.length === 0 || missing_critical.length > 0) {
      health = "expired"
      expired++
    } else if (age_minutes === null) {
      health = "unknown"
      unknown++
    } else if (age_minutes > EXPIRED_AFTER_HOURS * 60) {
      health = "expired"
      expired++
    } else if (age_minutes > STALE_AFTER_HOURS * 60) {
      health = "stale"
      stale++
    } else {
      health = "healthy"
      healthy++
    }

    updates.push({ account_id: acct.account_id, cookies_health: health })
  }

  // Batch the updates (Supabase has no true batch update via UPSERT on a
  // table with constraints, so we fire them in parallel with a modest cap).
  const now = new Date().toISOString()
  const chunkSize = 20
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize)
    await Promise.all(
      chunk.map((u) =>
        supabase
          .from("accounts")
          .update({ cookies_health: u.cookies_health, cookies_last_check: now })
          .eq("account_id", u.account_id)
      )
    )
  }

  return NextResponse.json({
    ok: true,
    scanned: accounts?.length || 0,
    healthy,
    stale,
    expired,
    unknown,
    ms: Date.now() - startedAt,
  })
}

export async function GET(req: NextRequest) {
  return handle(req)
}
export async function POST(req: NextRequest) {
  return handle(req)
}
