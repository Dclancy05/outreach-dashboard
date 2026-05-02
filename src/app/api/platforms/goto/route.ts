import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"
import { rateLimitDb, retryAfterHeaders, ipFromRequest } from "@/lib/rate-limit"
import { extractAdminId } from "@/lib/audit"

export const dynamic = "force-dynamic"

// Per-admin rate limit on Chrome navigation. Real users click platform-jump
// buttons at most a couple of times a minute. Anything above 5 navigations per
// 30 seconds is a bug or an attack — refuse with 429 + Retry-After.
//
// Why this exists: 2026-05-02 a global 30s health-status poller was driving
// /login-status which navigated Chrome through every platform sequentially,
// putting real Instagram cookies at ban risk. The polling source was removed
// and login-status decoupled, but we add this server-side fence as
// defense-in-depth so the next stray setInterval can't silently re-create the
// same incident. See /root/.claude/plans/funnel-restored-goofy-stearns.md.
const GOTO_LIMIT = 5
const GOTO_WINDOW_MS = 30 * 1000

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const url = (body as { url?: string }).url
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })

  // Per-admin (or per-IP fallback) so two admins racing buttons don't starve
  // each other. The dashboard's PIN gate ensures most callers have an admin
  // cookie; service-role / cron callers bypass this route entirely.
  const adminId = extractAdminId(req.headers.get("cookie")) || `ip:${ipFromRequest(req)}`
  const limit = await rateLimitDb(`goto:${adminId}`, GOTO_LIMIT, GOTO_WINDOW_MS)
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "Too many Chrome navigations. Slow down to avoid ban-risk patterns.",
        retryAt: new Date(limit.resetAt).toISOString(),
      },
      { status: 429, headers: retryAfterHeaders(limit.resetAt) }
    )
  }

  const VPS_URL = (await getSecret("VPS_URL")) || "https://srv1197943.taild42583.ts.net:10000"
  try {
    const res = await fetch(`${VPS_URL}/goto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
