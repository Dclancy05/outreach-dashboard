/**
 * SSE proxy: forwards Server-Sent Events from the vault API to the browser.
 * The vault API's /events endpoint keeps a long-lived stream open and emits
 * one JSON message per file change. We pipe that through to the dashboard.
 *
 * Vercel: must run on Edge or Node runtime; we choose Node so we can use
 * fetch streams without quirks. Long-running stream is fine on Fluid Compute.
 */
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const API_URL = (process.env.MEMORY_VAULT_API_URL || "").replace(/\/+$/, "")
const TOKEN = process.env.MEMORY_VAULT_TOKEN || ""

export async function GET(req: NextRequest): Promise<Response> {
  if (!API_URL || !TOKEN) {
    return NextResponse.json(
      { error: "memory-vault not configured" },
      { status: 503 }
    )
  }
  const upstream = await fetch(`${API_URL}/events`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${TOKEN}` },
    // Important: don't buffer
    cache: "no-store",
    signal: req.signal,
  }).catch((err) => {
    return new Response(JSON.stringify({ error: "vault upstream unreachable", detail: String(err) }), { status: 502 })
  })

  if (!upstream.ok || !upstream.body) {
    const body = await upstream.text().catch(() => "(no body)")
    return new Response(body, { status: upstream.status || 502 })
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  })
}
