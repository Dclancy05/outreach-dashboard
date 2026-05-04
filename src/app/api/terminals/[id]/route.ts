/**
 * Per-session ops:
 *   DELETE /api/terminals/:id          → kill tmux + remove worktree
 *   PATCH  /api/terminals/:id          → rename + update color/icon/nickname
 *   POST   /api/terminals/:id/resize   → tell VPS the new viewport size (handled in [id]/resize)
 *
 * The PATCH handler is split-brained on purpose:
 *   - `title` → forwarded to the VPS so the tmux session name updates too.
 *   - `color` / `icon` / `nickname` → updated in Postgres directly (the VPS
 *     terminal-server doesn't know about these fields yet — they're a
 *     dashboard-only ergonomics layer added in Phase 4 of the terminals
 *     overhaul). Doing it dashboard-side avoids a hard coupling to a VPS
 *     redeploy whenever we add a UI-only column.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function proxy(
  method: string,
  pathSuffix: string,
  bodyText: string | null,
): Promise<NextResponse> {
  const url = ((await getSecret("TERMINAL_RUNNER_URL")) || "").replace(/\/+$/, "")
  const token = (await getSecret("TERMINAL_RUNNER_TOKEN")) || ""
  if (!url || !token) {
    return NextResponse.json({ error: "TERMINAL_RUNNER_URL / TOKEN not configured" }, { status: 503 })
  }
  try {
    const res = await fetch(`${url}${pathSuffix}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: bodyText,
      signal: AbortSignal.timeout(10_000),
    })
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json" },
    })
  } catch (e) {
    return NextResponse.json(
      { error: `terminal-server unreachable: ${(e as Error).message}` },
      { status: 502 },
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return proxy("DELETE", `/sessions/${params.id}`, null)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  let parsed: Record<string, unknown> = {}
  const raw = await req.text()
  try { parsed = raw ? JSON.parse(raw) : {} } catch { /* */ }

  // Split: dashboard-only fields go to Postgres; everything else proxies.
  const dashOnlyKeys = ["color", "icon", "nickname"] as const
  const dashPatch: Record<string, string | null> = {}
  for (const k of dashOnlyKeys) {
    if (k in parsed) {
      const v = parsed[k]
      // Empty string clears the field — turns into NULL on the row.
      dashPatch[k] = v === "" ? null : (typeof v === "string" ? v : null)
    }
  }
  const proxyBody: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (!dashOnlyKeys.includes(k as typeof dashOnlyKeys[number])) proxyBody[k] = v
  }

  // Apply Postgres patch first (cheap, durable). Failures here don't block
  // the proxy — the worst case is the dashboard label drifts from the row.
  if (Object.keys(dashPatch).length > 0) {
    const c = db()
    if (c) {
      try {
        await c.from("terminal_sessions").update(dashPatch).eq("id", params.id)
      } catch {
        /* migration not applied yet — silently skip */
      }
    }
  }

  // If the only changes were dash-only, no need to round-trip the VPS.
  if (Object.keys(proxyBody).length === 0) {
    return NextResponse.json({ ok: true, dashboard_only: true, patched: dashPatch })
  }
  return proxy("PATCH", `/sessions/${params.id}`, JSON.stringify(proxyBody))
}
