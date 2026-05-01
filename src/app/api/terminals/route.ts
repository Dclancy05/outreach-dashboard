/**
 * Terminals API — list + create.
 *
 * GET  /api/terminals          → list active sessions (proxies to VPS)
 * POST /api/terminals          → create session, returns id + ws connection details
 *
 * The browser does NOT WebSocket through this route — Vercel functions can't
 * proxy long-lived WS gracefully. Instead, this returns the public Tailscale
 * Funnel URL of the terminal-server so xterm.js can connect direct, mirroring
 * the noVNC pattern in src/components/novnc-viewer.tsx.
 *
 * Auth: PIN-gated by middleware (the dashboard auth covers the whole /api/* tree).
 *
 * The dashboard never sees the bearer token in the browser — it gets a session-
 * specific signed token, and the VPS verifies. For Phase 1 we ship the simpler
 * "shared bearer" model: the route reads TERMINAL_RUNNER_TOKEN server-side and
 * returns it to the authenticated browser. Replacing this with per-session
 * signed tokens is a Phase 3 polish item.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface CreateBody {
  title?: string
  command?: string
  initial_prompt?: string
}

async function getRunner(): Promise<{ url: string; token: string; wsUrl: string } | { error: string }> {
  const url = ((await getSecret("TERMINAL_RUNNER_URL")) || "").replace(/\/+$/, "")
  const token = (await getSecret("TERMINAL_RUNNER_TOKEN")) || ""
  if (!url) return { error: "TERMINAL_RUNNER_URL not configured — set it in the API Keys tab" }
  if (!token) return { error: "TERMINAL_RUNNER_TOKEN not configured" }
  // The browser-side WS URL — we surface this so xterm.js can connect direct.
  // Vercel can't proxy WebSockets cleanly; the noVNC viewer already uses this
  // pattern. The terminal-server should be reachable at the same host but
  // with the wss:// protocol.
  const wsUrl = url.replace(/^http/, "ws")
  return { url, token, wsUrl }
}

export async function GET(): Promise<NextResponse> {
  const r = await getRunner()
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 503 })
  try {
    const res = await fetch(`${r.url}/sessions`, {
      headers: { Authorization: `Bearer ${r.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) {
      return NextResponse.json({ error: `terminal-server ${res.status}` }, { status: 502 })
    }
    const body = await res.json() as { sessions?: Array<{ id: string }> }
    // Decorate each session with the WS URL. The bearer token rides as a
    // `?token=` query param so Tailscale Funnel's path-prefix proxy preserves
    // it through the WebSocket upgrade (the Sec-WebSocket-Protocol header is
    // dropped by --set-path proxies). Browser-side this is delivered to a
    // PIN-authed origin, and the token only authorizes this VPS service —
    // same threat model as the noVNC password we already ship.
    const tokQ = `?token=${encodeURIComponent(r.token)}`
    const decorated = (body.sessions || []).map((s) => ({
      ...s,
      ws_url: `${r.wsUrl}/sessions/${s.id}/stream${tokQ}`,
    }))
    return NextResponse.json({ sessions: decorated })
  } catch (e) {
    return NextResponse.json(
      { error: `terminal-server unreachable: ${(e as Error).message}` },
      { status: 502 },
    )
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const r = await getRunner()
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 503 })

  let body: CreateBody = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  try {
    const res = await fetch(`${r.url}/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${r.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || `terminal-server ${res.status}` },
        { status: res.status },
      )
    }
    // Return everything the front-end needs to attach xterm.js. The bearer
    // token is embedded in ws_url as ?token= so Tailscale Funnel's
    // path-prefix proxy preserves it through the WebSocket upgrade.
    const tokQ = `?token=${encodeURIComponent(r.token)}`
    return NextResponse.json({
      ...data,
      ws_url: `${r.wsUrl}${data.ws_path}${tokQ}`,
    })
  } catch (e) {
    return NextResponse.json(
      { error: `terminal-server unreachable: ${(e as Error).message}` },
      { status: 502 },
    )
  }
}
