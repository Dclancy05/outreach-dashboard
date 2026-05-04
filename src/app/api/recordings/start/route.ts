import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"
import { rateLimitDb, retryAfterHeaders, ipFromRequest } from "@/lib/rate-limit"
import { extractAdminId, withAudit } from "@/lib/audit"

// Recording control endpoints drive Chrome on the VPS. Per CLAUDE.md
// ban-risk policy, every Chrome-driving endpoint must be rate-limited.
// 5 starts per minute per admin is loose enough for legit retries (the
// VPS sometimes needs a kick) and tight enough to catch a runaway script.
const RECORDING_LIMIT = 5
const RECORDING_WINDOW_MS = 60 * 1000

async function postHandler(req: Request) {
  const adminId = extractAdminId(req.headers.get("cookie")) || `ip:${ipFromRequest(req)}`
  const limit = await rateLimitDb(`recording-start:${adminId}`, RECORDING_LIMIT, RECORDING_WINDOW_MS)
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Recording control rate-limited. Try again in a minute.", retryAt: new Date(limit.resetAt).toISOString() },
      { status: 429, headers: retryAfterHeaders(limit.resetAt) }
    )
  }
  try {
    const VPS_URL =
      (await getSecret("VPS_URL")) ||
      (await getSecret("RECORDING_SERVER_URL")) ||
      "http://srv1197943.hstgr.cloud:3848"
    const res = await fetch(`${VPS_URL}/start`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown"
    return NextResponse.json({ error: "Failed to connect to recording service", details: msg }, { status: 502 })
  }
}

export const POST = withAudit("POST /api/recordings/start", postHandler)
