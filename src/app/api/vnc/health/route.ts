import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

/**
 * Server-side reachability probe for the VNC Manager. Dashboard clients hit
 * this (cheap, no auth header leak) instead of calling the VNC Manager
 * directly with the API key.
 *
 * Returns { ok: true } if the manager answers /health, otherwise a 502.
 */
export async function GET() {
  try {
    const VNC_MANAGER_URL = (await getSecret("VNC_MANAGER_URL")) || "http://127.0.0.1:18790"
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    const res = await fetch(`${VNC_MANAGER_URL}/health`, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `VNC Manager returned HTTP ${res.status}` },
        { status: 502 },
      )
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "VNC Manager unreachable" },
      { status: 502 },
    )
  }
}
