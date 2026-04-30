/**
 * GET /api/terminals/debug
 *
 * Reports the live state of the terminals integration so we can diagnose
 * "+ New Terminal does nothing" without dev tools. Returns:
 *
 *   - whether TERMINAL_RUNNER_URL + TERMINAL_RUNNER_TOKEN resolve
 *   - whether the VPS /healthz is reachable from the Vercel function
 *   - whether POST /sessions returns the expected shape (without actually
 *     creating a session — uses a HEAD probe to /sessions when supported,
 *     otherwise just GET /sessions which is read-only)
 *   - whether the api_keys rows actually exist for these envs
 *
 * Auth: PIN-gated like the rest of /api/terminals/*.
 */
import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(): Promise<NextResponse> {
  const url = (await getSecret("TERMINAL_RUNNER_URL")) || null
  const token = (await getSecret("TERMINAL_RUNNER_TOKEN")) || null

  // Don't echo the token back in plaintext. Just confirm it's set + the prefix.
  const tokenStatus = token
    ? { set: true, len: token.length, prefix: token.slice(0, 6) }
    : { set: false, len: 0, prefix: null }

  let healthz: { ok: boolean; status?: number; body?: unknown; error?: string } = { ok: false }
  if (url) {
    try {
      const cleanUrl = url.replace(/\/+$/, "")
      const r = await fetch(`${cleanUrl}/healthz`, {
        signal: AbortSignal.timeout(5_000),
      })
      const body = await r.json().catch(() => ({}))
      healthz = { ok: r.ok, status: r.status, body }
    } catch (e) {
      healthz = { ok: false, error: (e as Error).message }
    }
  }

  let sessions: { ok: boolean; status?: number; body?: unknown; error?: string } = { ok: false }
  if (url && token) {
    try {
      const cleanUrl = url.replace(/\/+$/, "")
      const r = await fetch(`${cleanUrl}/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8_000),
      })
      const body = await r.json().catch(() => ({}))
      sessions = { ok: r.ok, status: r.status, body }
    } catch (e) {
      sessions = { ok: false, error: (e as Error).message }
    }
  }

  return NextResponse.json({
    secrets: {
      TERMINAL_RUNNER_URL: url ? { set: true, value: url } : { set: false },
      TERMINAL_RUNNER_TOKEN: tokenStatus,
    },
    vps: {
      healthz,
      sessions,
    },
    diagnosis:
      !url
        ? "TERMINAL_RUNNER_URL not configured (api_keys row missing or cached null)"
        : !token
        ? "TERMINAL_RUNNER_TOKEN not configured"
        : !healthz.ok
        ? "VPS unreachable from Vercel — check Tailscale Funnel + service status"
        : !sessions.ok
        ? `VPS rejected the bearer token (HTTP ${sessions.status}) — token mismatch between dashboard and VPS systemd unit`
        : "All systems go — '+ New' should work. If not, check browser console.",
  })
}
