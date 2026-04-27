import { NextRequest, NextResponse } from "next/server"
import WebSocket from "ws"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const maxDuration = 30 // Allow up to 30s for this endpoint

const GOLOGIN_API = "https://api.gologin.com/browser"

// Platform-specific login cookies
const LOGIN_COOKIES: Record<string, string> = {
  instagram: "sessionid",
  facebook: "c_user",
  linkedin: "li_at",
}

/**
 * Extract all cookies from a running cloud browser via Chrome DevTools Protocol (CDP).
 * Connects to the browser's WebSocket debug endpoint and calls Network.getAllCookies.
 */
async function extractCookiesViaCDP(wsUrl: string, timeoutMs = 10000): Promise<any[] | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { ws.close() } catch {}
      resolve(null)
    }, timeoutMs)

    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl, { handshakeTimeout: 5000 })
    } catch {
      clearTimeout(timer)
      return resolve(null)
    }

    ws.on("open", () => {
      // Send CDP command to get all cookies
      ws.send(JSON.stringify({
        id: 1,
        method: "Network.getAllCookies",
        params: {},
      }))
    })

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.id === 1 && msg.result?.cookies) {
          clearTimeout(timer)
          ws.close()
          resolve(msg.result.cookies)
        }
      } catch {}
    })

    ws.on("error", () => {
      clearTimeout(timer)
      resolve(null)
    })

    ws.on("close", () => {
      clearTimeout(timer)
      resolve(null)
    })
  })
}

/**
 * Convert CDP cookie format to GoLogin cookie format and upload via POST.
 */
async function uploadCookiesToProfile(profileId: string, cdpCookies: any[], token: string): Promise<boolean> {
  // Convert CDP format to GoLogin/Netscape format
  const glCookies = cdpCookies.map((c) => ({
    url: `https://${c.domain?.replace(/^\./, "")}${c.path || "/"}`,
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || "/",
    secure: c.secure || false,
    httpOnly: c.httpOnly || false,
    sameSite: c.sameSite?.toLowerCase() === "none" ? "no_restriction"
      : c.sameSite?.toLowerCase() === "lax" ? "lax"
      : c.sameSite?.toLowerCase() === "strict" ? "strict"
      : "unspecified",
    expirationDate: c.expires && c.expires > 0 ? c.expires : undefined,
    session: !c.expires || c.expires <= 0,
  }))

  try {
    const res = await fetch(`${GOLOGIN_API}/${profileId}/cookies`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(glCookies),
    })
    return res.status === 204 || res.ok
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const TOKEN = await getSecret("GOLOGIN_API_TOKEN")
  if (!TOKEN) {
    return NextResponse.json({ error: "GOLOGIN_API_TOKEN not configured" }, { status: 500 })
  }

  try {
    const { profileId, platform, wsUrl } = await req.json()
    if (!profileId) {
      return NextResponse.json({ error: "profileId is required" }, { status: 400 })
    }

    const headers = {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    }

    // ── STEP 1: Extract cookies from the LIVE browser via CDP ────────────
    let cdpCookies: any[] | null = null
    let cdpExtracted = false
    let cdpUploaded = false

    if (wsUrl) {
      console.log(`[stop] Attempting CDP cookie extraction for ${profileId}`)
      cdpCookies = await extractCookiesViaCDP(wsUrl)
      if (cdpCookies && cdpCookies.length > 0) {
        cdpExtracted = true
        console.log(`[stop] Extracted ${cdpCookies.length} cookies via CDP`)

        // Upload cookies to GoLogin profile BEFORE stopping
        cdpUploaded = await uploadCookiesToProfile(profileId, cdpCookies, TOKEN)
        console.log(`[stop] Cookie upload: ${cdpUploaded ? "success" : "failed"}`)
      }
    }

    // ── STEP 2: Stop the cloud browser session ───────────────────────────
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    let stopStatus: string

    try {
      const res = await fetch(`${GOLOGIN_API}/${profileId}/web`, {
        method: "DELETE",
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeout)
      stopStatus = res.status === 404 ? "already_stopped" : "stopped"
    } catch (e) {
      clearTimeout(timeout)
      if (e instanceof Error && e.name === "AbortError") {
        return NextResponse.json(
          { error: "Stop request timed out. The session may still be active." },
          { status: 504 }
        )
      }
      throw e
    }

    // ── STEP 3: Wait for GoLogin to sync cookies ────────────────────────
    // Even with CDP extraction, give GoLogin time to do its own sync
    await new Promise((resolve) => setTimeout(resolve, 4000))

    // ── STEP 4: Verify cookies ──────────────────────────────────────────
    let cookieVerified = false
    let cookieCount = 0

    try {
      const cookieRes = await fetch(`${GOLOGIN_API}/${profileId}/cookies`, { headers })
      if (cookieRes.ok) {
        const cookies = await cookieRes.json()
        cookieCount = Array.isArray(cookies) ? cookies.length : 0

        if (platform && LOGIN_COOKIES[platform]) {
          cookieVerified = Array.isArray(cookies) &&
            cookies.some((c: any) => c.name === LOGIN_COOKIES[platform])
        } else {
          cookieVerified = Array.isArray(cookies) &&
            cookies.some((c: any) => Object.values(LOGIN_COOKIES).includes(c.name))
        }
      }
    } catch {}

    // ── STEP 5: If verification failed but we have CDP cookies, retry upload ─
    if (!cookieVerified && cdpCookies && cdpCookies.length > 0) {
      console.log(`[stop] Verification failed, retrying cookie upload...`)
      const retryUpload = await uploadCookiesToProfile(profileId, cdpCookies, TOKEN)

      if (retryUpload) {
        // Wait and re-verify
        await new Promise((resolve) => setTimeout(resolve, 2000))
        try {
          const cookieRes = await fetch(`${GOLOGIN_API}/${profileId}/cookies`, { headers })
          if (cookieRes.ok) {
            const cookies = await cookieRes.json()
            cookieCount = Array.isArray(cookies) ? cookies.length : 0
            if (platform && LOGIN_COOKIES[platform]) {
              cookieVerified = Array.isArray(cookies) &&
                cookies.some((c: any) => c.name === LOGIN_COOKIES[platform])
            }
          }
        } catch {}
      }
    }

    return NextResponse.json({
      status: stopStatus,
      cookieVerified,
      cookieCount,
      cdpExtracted,
      cdpCookieCount: cdpCookies?.length || 0,
      cdpUploaded,
      message: cookieVerified
        ? "Session stopped and login verified ✓"
        : cdpExtracted && cdpUploaded
          ? `Cookies extracted (${cdpCookies!.length}) and uploaded, but login cookie not found — Instagram may not have set it yet.`
          : cookieCount > 0
            ? "Session stopped. Cookies saved but login cookie not found — you may need to log in again."
            : "Session stopped but no cookies found. The login may not have been saved.",
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    )
  }
}
