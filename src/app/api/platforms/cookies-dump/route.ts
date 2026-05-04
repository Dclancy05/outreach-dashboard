import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"
import { rateLimitDb, retryAfterHeaders, ipFromRequest } from "@/lib/rate-limit"
import { extractAdminId } from "@/lib/audit"

const VALID_PLATFORMS = new Set([
  "instagram", "facebook", "linkedin", "tiktok",
  "youtube", "twitter", "x", "threads", "pinterest", "snapchat",
])
const COOKIES_DUMP_LIMIT = 5
const COOKIES_DUMP_WINDOW_MS = 60 * 1000

/**
 * GET /api/platforms/cookies-dump?platform=instagram
 *
 * Thin proxy to the VPS Manager's cookie-dump endpoint. The VPS currently
 * exposes `/health`, `/status`, `/goto`, `/login-status` and `/login-status/refresh`
 * on port 10000 but NOT a cookie dump. When Dylan ships that endpoint (spec
 * below), this route wires up automatically and the Log-in modal starts
 * persisting fresh cookies to Supabase after every successful login.
 *
 * Expected VPS response shape:
 *   {
 *     platform: "instagram",
 *     cookies: [{ name, value, domain, path, expires, httpOnly, secure, sameSite }...],
 *     localStorage?: Record<string, string>,
 *     capturedAt: "2026-04-24T..."
 *   }
 *
 * Until the VPS exposes it, this route quietly returns 502 and the modal
 * treats that as "no cookies to save, just run the login-status probe."
 */
export const dynamic = "force-dynamic"
export const maxDuration = 20

export async function GET(req: Request) {
  const url = new URL(req.url)
  const platform = (url.searchParams.get("platform") || "").toLowerCase()
  if (!platform || !VALID_PLATFORMS.has(platform)) {
    return NextResponse.json(
      { ok: false, error: `Unsupported platform "${platform}". Allowed: ${Array.from(VALID_PLATFORMS).join(", ")}` },
      { status: 400 }
    )
  }

  const adminId = extractAdminId(req.headers.get("cookie")) || `ip:${ipFromRequest(req)}`
  const limit = await rateLimitDb(`cookies-dump:${adminId}`, COOKIES_DUMP_LIMIT, COOKIES_DUMP_WINDOW_MS)
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Cookie-dump rate-limited.", retryAt: new Date(limit.resetAt).toISOString() },
      { status: 429, headers: retryAfterHeaders(limit.resetAt) }
    )
  }

  const VPS_URL = (await getSecret("VPS_URL")) || "https://srv1197943.taild42583.ts.net:10000"
  try {
    const res = await fetch(
      `${VPS_URL}/cookies/dump?platform=${encodeURIComponent(platform)}`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) {
      // Expected while the VPS endpoint doesn't exist yet. The caller treats
      // this as "no cookies available" and skips the snapshot.
      return NextResponse.json(
        { ok: false, status: res.status, error: `VPS returned ${res.status}` },
        { status: 502 }
      )
    }
    const body = await res.json()
    return NextResponse.json(body)
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || "VPS unreachable" },
      { status: 502 }
    )
  }
}
