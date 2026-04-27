/**
 * Connection status for the Memory Vault — used by the status pill on
 * /agency/memory so Dylan can see at a glance which VPS is serving the vault.
 *
 * Pings the vault's /health endpoint with the configured token and returns:
 *   { ok, host, port, path, url, latency_ms, vault_root, ts, error? }
 *
 * Auth: only PIN-authed dashboard sessions reach this (admin_session middleware).
 */
import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"

export async function GET(): Promise<NextResponse> {
  const apiUrl = ((await getSecret("MEMORY_VAULT_API_URL")) || "").replace(/\/+$/, "")
  const token = (await getSecret("MEMORY_VAULT_TOKEN")) || ""

  if (!apiUrl) {
    return NextResponse.json(
      { ok: false, configured: false, error: "MEMORY_VAULT_API_URL is not set" },
      { status: 200 }
    )
  }

  let parsed: URL
  try {
    parsed = new URL(apiUrl)
  } catch {
    return NextResponse.json(
      { ok: false, configured: false, error: `Invalid MEMORY_VAULT_API_URL: ${apiUrl}` },
      { status: 200 }
    )
  }

  const host = parsed.hostname
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80")
  const path = parsed.pathname || "/"
  const t0 = Date.now()
  try {
    const headers: Record<string, string> = {}
    if (token) headers["Authorization"] = `Bearer ${token}`
    const res = await fetch(`${apiUrl}/health`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    })
    const latency_ms = Date.now() - t0
    const body = (await res.json().catch(() => ({}))) as { vault?: string; ts?: string }
    return NextResponse.json({
      ok: res.ok,
      configured: true,
      url: apiUrl,
      host,
      port,
      path,
      latency_ms,
      vault_root: body?.vault ?? null,
      remote_ts: body?.ts ?? null,
      ts: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      configured: true,
      url: apiUrl,
      host,
      port,
      path,
      latency_ms: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
      ts: new Date().toISOString(),
    })
  }
}
