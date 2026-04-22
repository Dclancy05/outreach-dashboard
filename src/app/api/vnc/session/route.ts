import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const VNC_MANAGER_URL = process.env.VNC_MANAGER_URL || "http://127.0.0.1:18790"
const VNC_API_KEY = process.env.VNC_API_KEY || "vnc-mgr-2026-dylan"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { proxy_group_id, platform, platforms, proxy_config, use_chrome_profile, account_id } = body

    if (!proxy_group_id) {
      return NextResponse.json({ error: "proxy_group_id required" }, { status: 400 })
    }

    // P5.1: multi-platform single-session support. If the caller sends
    // `platforms: string[]` (e.g. ["instagram","twitter","linkedin"]) we forward
    // it to the VNC Manager so ONE Chrome instance opens every social as its
    // own tab instead of spawning N separate sessions. `platform` (singular)
    // is kept for backward compat — if only one is given, we still send a
    // `platforms` array so the manager only has to implement one code path.
    const platformList: string[] = Array.isArray(platforms) && platforms.length > 0
      ? platforms.filter((p: unknown): p is string => typeof p === "string" && !!p)
      : platform ? [platform] : []

    // Fetch geo from the proxy_groups row so the stealth profile builder can
    // pin the browser timezone + locale to the proxy's real-world location.
    let geo: { city?: string; country?: string } = {}
    let effectiveProxyConfig = proxy_config
    try {
      const { data: pg } = await supabase
        .from("proxy_groups")
        .select("location_city, location_country, ip, port, username, password")
        .eq("id", proxy_group_id)
        .maybeSingle()
      if (pg) {
        geo = { city: pg.location_city || "", country: pg.location_country || "" }
        if (!effectiveProxyConfig && pg.ip && pg.port) {
          effectiveProxyConfig = `${pg.ip}:${pg.port}:${pg.username || ""}:${pg.password || ""}`
        }
      }
    } catch (e) {
      // Non-fatal — session can still launch without geo, just with default fingerprint
    }

    // If an account was picked, pull its imported cookies so Chrome starts the
    // session already logged in (skips the login form entirely). We check two
    // places: accounts.session_cookie (the mirror populated at capture time)
    // and account_sessions (the authoritative capture history). The VNC
    // Manager will also auto-hydrate from account_sessions on its own when it
    // receives no cookies — this hop just gives it an explicit head start.
    let cookies: any[] | undefined
    if (account_id) {
      try {
        const { data: acct } = await supabase
          .from("accounts")
          .select("session_cookie")
          .eq("account_id", account_id)
          .maybeSingle()
        if (acct?.session_cookie) {
          try {
            const parsed = typeof acct.session_cookie === "string"
              ? JSON.parse(acct.session_cookie)
              : acct.session_cookie
            if (Array.isArray(parsed) && parsed.length > 0) cookies = parsed
          } catch {}
        }
      } catch {}

      if (!cookies || cookies.length === 0) {
        try {
          const { data: sess } = await supabase
            .from("account_sessions")
            .select("cookies")
            .eq("account_id", account_id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
          if (sess?.cookies && Array.isArray(sess.cookies) && sess.cookies.length > 0) {
            cookies = sess.cookies
          }
        } catch {}
      }
    }

    const res = await fetch(`${VNC_MANAGER_URL}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": VNC_API_KEY },
      body: JSON.stringify({
        proxy_group_id,
        platform: platformList[0] || platform,
        platforms: platformList,
        proxy_config: effectiveProxyConfig,
        use_chrome_profile: !!use_chrome_profile,
        geo,
        cookies,
        account_id,
      }),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "VNC Manager unreachable" }, { status: 502 })
  }
}

export async function GET() {
  try {
    const res = await fetch(`${VNC_MANAGER_URL}/api/sessions`, {
      headers: { "X-API-Key": VNC_API_KEY },
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "VNC Manager unreachable" }, { status: 502 })
  }
}
