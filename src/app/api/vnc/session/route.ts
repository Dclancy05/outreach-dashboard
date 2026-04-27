import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { generateFingerprint, deriveGeoFields } from "@/lib/fingerprint"
import { PLATFORM_LOGIN_URLS } from "@/lib/platform-login-urls"

const VNC_MANAGER_URL = process.env.VNC_MANAGER_URL || "http://127.0.0.1:18790"
if (!process.env.VNC_API_KEY) {
  throw new Error("VNC_API_KEY env var is required")
}
const VNC_API_KEY = process.env.VNC_API_KEY

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Default login URL per platform now lives in src/lib/platform-login-urls.ts
// so the VNC session bootstrapper, the platform-login modal, and the goto
// helper all read from one source. Lookup is case-insensitive (see below).

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { proxy_group_id, platform, platforms, proxy_config, use_chrome_profile, account_id, initial_url, initialUrl } = body

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

    // Per-account fingerprint: generate + persist on first launch, then pin
    // forever. We forward it to the VNC Manager even if the manager doesn't
    // consume it yet — the dashboard side is ready for when it does, and the
    // fingerprint row is permanently stored in Supabase either way.
    let fingerprint: any = null
    if (account_id) {
      try {
        const { data: existing } = await supabase
          .from("account_fingerprints")
          .select("*")
          .eq("account_id", account_id)
          .maybeSingle()

        if (existing) {
          fingerprint = existing
        } else {
          const fp = generateFingerprint()
          const geoDerived = deriveGeoFields(geo.country || null, geo.city || null)
          const row = {
            account_id,
            user_agent: fp.user_agent,
            platform: fp.platform,
            screen_width: fp.screen_width,
            screen_height: fp.screen_height,
            device_pixel_ratio: fp.device_pixel_ratio,
            color_depth: fp.color_depth,
            hardware_concurrency: fp.hardware_concurrency,
            device_memory: fp.device_memory,
            webgl_vendor: fp.webgl_vendor,
            webgl_renderer: fp.webgl_renderer,
            canvas_noise_seed: fp.canvas_noise_seed,
            audio_noise_seed: fp.audio_noise_seed,
            timezone: geoDerived.timezone,
            locale: geoDerived.locale,
            accept_language: geoDerived.accept_language,
            geo_lat: geoDerived.geo_lat,
            geo_lon: geoDerived.geo_lon,
            proxy_group_id,
            chrome_profile_dir: `/vps/profiles/${account_id}`,
            updated_at: new Date().toISOString(),
          }
          const { data: saved } = await supabase
            .from("account_fingerprints")
            .upsert(row, { onConflict: "account_id" })
            .select()
            .single()
          fingerprint = saved || row
        }
      } catch (e) {
        // Non-fatal — session launches without fingerprint on failure
      }
    }

    // Resolve the URL Chrome should open on first paint. Explicit caller input
    // wins; otherwise we default to the platform's canonical login URL so a
    // click on "Open Browser" for an existing account lands on the login page
    // instead of the default new-tab page. `about:blank` is allowed through if
    // the caller really wants a blank tab.
    const primaryPlatform = platformList[0] || platform
    const resolvedInitialUrl: string | undefined =
      (typeof initial_url === "string" && initial_url) ||
      (typeof initialUrl === "string" && initialUrl) ||
      (primaryPlatform
        ? PLATFORM_LOGIN_URLS[String(primaryPlatform).toLowerCase()]
        : undefined)

    // Per-account profile dir: we pin it to /vps/profiles/<account_id> so the
    // VPS VNC Manager can mount a persistent --user-data-dir that survives
    // across sessions. The fingerprint row already stores this path; we
    // forward it explicitly here so the manager doesn't have to re-derive it.
    const chromeProfileDir: string | undefined = account_id ? `/vps/profiles/${account_id}` : undefined

    const res = await fetch(`${VNC_MANAGER_URL}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": VNC_API_KEY },
      body: JSON.stringify({
        proxy_group_id,
        platform: primaryPlatform,
        platforms: platformList,
        proxy_config: effectiveProxyConfig,
        use_chrome_profile: !!use_chrome_profile,
        geo,
        cookies,
        account_id,
        fingerprint,
        initial_url: resolvedInitialUrl,
        chrome_profile_dir: chromeProfileDir,
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
