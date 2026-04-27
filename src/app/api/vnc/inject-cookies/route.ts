import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const VPS_URL =
  process.env.VPS_URL ||
  process.env.RECORDING_SERVER_URL ||
  "https://srv1197943.taild42583.ts.net:10000"

const INJECT_TIMEOUT_MS = 10_000

// POST /api/vnc/inject-cookies
// Body: { session_id, account_id }
//
// Pulls the latest cookie snapshot for `account_id` from
// `account_cookie_snapshots`, then forwards it to the VPS endpoint
// `POST ${VPS_URL}/api/sessions/{session_id}/inject-cookies` so the running
// Chrome session can preload the user's logged-in state via CDP. This is
// what lets the Sign-In modal skip the actual login UI when we already have
// fresh cookies on file.
//
// If the VPS endpoint returns 404 we surface a friendly
// `vps_endpoint_not_deployed` flag instead of a generic error so the caller
// (e.g. the platform-login modal) can show a "deploy the VPS service first"
// banner rather than a scary stack trace.
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const { session_id, account_id } = body || {}
  if (!session_id || typeof session_id !== "string") {
    return NextResponse.json({ ok: false, error: "session_id required" }, { status: 400 })
  }
  if (!account_id || typeof account_id !== "string") {
    return NextResponse.json({ ok: false, error: "account_id required" }, { status: 400 })
  }

  // ── 1. Pull the most recent snapshot for this account ──────────────
  const { data: snap, error: snapErr } = await supabase
    .from("account_cookie_snapshots")
    .select("cookies_json, local_storage_json, captured_at")
    .eq("account_id", account_id)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (snapErr) {
    return NextResponse.json(
      { ok: false, error: snapErr.message },
      { status: 500 }
    )
  }
  if (!snap || !Array.isArray(snap.cookies_json) || snap.cookies_json.length === 0) {
    return NextResponse.json(
      { ok: false, error: "no cookie snapshot found for account" },
      { status: 404 }
    )
  }

  // ── 2. POST to the VPS ────────────────────────────────────────────
  const url = `${VPS_URL.replace(/\/+$/, "")}/api/sessions/${encodeURIComponent(
    session_id
  )}/inject-cookies`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), INJECT_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cookies: snap.cookies_json,
        local_storage: snap.local_storage_json || null,
      }),
      signal: ctrl.signal,
      cache: "no-store",
    })
    clearTimeout(timer)

    if (res.status === 404) {
      return NextResponse.json({
        ok: false,
        error: "vps_endpoint_not_deployed",
        deployable: true,
        hint:
          "Deploy vps-deliverables/cookie-injection-endpoint.js to the production VPS",
      })
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      return NextResponse.json(
        {
          ok: false,
          error: `VPS returned ${res.status}${txt ? `: ${txt.slice(0, 160)}` : ""}`,
        },
        { status: 502 }
      )
    }

    const json: any = await res.json().catch(() => ({}))
    return NextResponse.json({
      ok: true,
      cookies_set: json?.cookies_set ?? snap.cookies_json.length,
      local_storage_set: Boolean(snap.local_storage_json),
      captured_at: snap.captured_at,
    })
  } catch (e: any) {
    clearTimeout(timer)
    if (e?.name === "AbortError") {
      return NextResponse.json(
        { ok: false, error: "VPS injection request timed out" },
        { status: 504 }
      )
    }
    return NextResponse.json(
      { ok: false, error: e?.message || "injection failed" },
      { status: 502 }
    )
  }
}
