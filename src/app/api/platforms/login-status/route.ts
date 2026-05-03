import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"
import { rateLimitDb, retryAfterHeaders, ipFromRequest } from "@/lib/rate-limit"
import { extractAdminId } from "@/lib/audit"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Why the rate limit on the refresh branch:
// `?refresh=1` calls /login-status/refresh on the VPS, which CLEARS the
// 15-minute cache and forces Chrome to navigate through every requested
// platform sequentially to read each cookie jar. That's the same Chrome-
// rotation pattern that put us at ban risk on 2026-05-02. Cached probes
// (without refresh=1) never navigate Chrome, so they stay free.
//
// Limit: 3 refreshes per 60s per admin. A real user clicking "Verify Now" on
// the accounts page or "I'm Logged In" in the modal might fire 1-3 times in
// a row if Instagram is slow to confirm. 3/60s gives them headroom while
// still killing any rogue setInterval pattern. Was 1/60s but that 429'd
// legitimate user clicks and produced "still logged out" misreports.
const REFRESH_LIMIT = 3
const REFRESH_WINDOW_MS = 60 * 1000

export async function GET(req: Request) {
  const url = new URL(req.url)
  const platforms = url.searchParams.get("platforms") || "instagram,facebook,linkedin,tiktok"
  const refresh = url.searchParams.get("refresh") === "1"
  const VPS_URL = (await getSecret("VPS_URL")) || "https://srv1197943.taild42583.ts.net:10000"

  if (refresh) {
    const adminId = extractAdminId(req.headers.get("cookie")) || `ip:${ipFromRequest(req)}`
    const limit = await rateLimitDb(`login-status-refresh:${adminId}`, REFRESH_LIMIT, REFRESH_WINDOW_MS)
    if (!limit.ok) {
      return NextResponse.json(
        {
          error: "Login status refresh is rate-limited to once per minute. Cached results coming back.",
          retryAt: new Date(limit.resetAt).toISOString(),
        },
        { status: 429, headers: retryAfterHeaders(limit.resetAt) }
      )
    }
  }

  try {
    if (refresh) {
      await fetch(`${VPS_URL}/login-status/refresh`, { signal: AbortSignal.timeout(5000) }).catch(() => {})
    }
    const res = await fetch(`${VPS_URL}/login-status?platforms=${encodeURIComponent(platforms)}`, {
      signal: AbortSignal.timeout(55000),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ cached: false, results: [], error: (e as Error).message }, { status: 502 })
  }
}
