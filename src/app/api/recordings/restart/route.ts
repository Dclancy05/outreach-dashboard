import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"
import { rateLimitDb, retryAfterHeaders, ipFromRequest } from "@/lib/rate-limit"
import { extractAdminId, withAudit } from "@/lib/audit"

// Per CLAUDE.md ban-risk policy: every Chrome-driving endpoint is rate-limited.
const RECORDING_LIMIT = 5
const RECORDING_WINDOW_MS = 60 * 1000

async function postHandler(req: Request) {
  const adminId = extractAdminId(req.headers.get("cookie")) || `ip:${ipFromRequest(req)}`
  const limit = await rateLimitDb(`recording-restart:${adminId}`, RECORDING_LIMIT, RECORDING_WINDOW_MS)
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Recording control rate-limited. Try again in a minute.", retryAt: new Date(limit.resetAt).toISOString() },
      { status: 429, headers: retryAfterHeaders(limit.resetAt) }
    )
  }

  const VPS_URL =
    (await getSecret("VPS_URL")) ||
    (await getSecret("RECORDING_SERVER_URL")) ||
    "http://srv1197943.hstgr.cloud:3848"
  try {
    const restartRes = await fetch(`${VPS_URL}/restart`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    })
    if (restartRes.status !== 404) {
      const body = await restartRes.json().catch(() => ({}))
      return NextResponse.json(
        { ok: restartRes.ok, method: "restart", vps_response: body },
        { status: restartRes.status }
      )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown"
    return NextResponse.json(
      { ok: false, method: "unreachable", vps_response: { error: msg } },
      { status: 502 }
    )
  }

  try {
    const startRes = await fetch(`${VPS_URL}/start`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    })
    const body = await startRes.json().catch(() => ({}))
    return NextResponse.json(
      { ok: startRes.ok, method: "start", vps_response: body },
      { status: startRes.status }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown"
    return NextResponse.json(
      { ok: false, method: "unreachable", vps_response: { error: msg } },
      { status: 502 }
    )
  }
}

export const POST = withAudit("POST /api/recordings/restart", postHandler)
