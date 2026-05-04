import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function vpsUrl(): Promise<string> {
  return (
    (await getSecret("VPS_URL")) ||
    (await getSecret("RECORDING_SERVER_URL")) ||
    "https://srv1197943.taild42583.ts.net:10000"
  )
}

const TEST_TIMEOUT_MS = 30_000 // 30s — enough for browser launch + one nav

// Per-platform "logged in?" home-feed URLs. These are the pages a real user
// lands on right after signing in, so the DOM signature check has the best
// chance of finding a logged-in marker.
const HOME_FEED: Record<string, string> = {
  instagram: "https://www.instagram.com/",
  facebook: "https://www.facebook.com/",
  linkedin: "https://www.linkedin.com/feed/",
  tiktok: "https://www.tiktok.com/foryou",
  twitter: "https://x.com/home",
  x: "https://x.com/home",
  youtube: "https://www.youtube.com/",
  pinterest: "https://www.pinterest.com/",
  snapchat: "https://web.snapchat.com/",
  reddit: "https://www.reddit.com/",
  threads: "https://www.threads.net/",
  whatsapp: "https://web.whatsapp.com/",
  telegram: "https://web.telegram.org/a/",
  discord: "https://discord.com/channels/@me",
}

// POST /api/accounts/:id/cookies/test
// Body (optional): { session_id }  — if the caller already has a live VNC
// session, reuse it; otherwise we open a tiny one and tear it down.
//
// Flow:
//   1. Look up the account → get platform.
//   2. Open (or reuse) a session on the VPS.
//   3. Ask the VPS to inject the latest cookie snapshot, navigate to the
//      home feed, and run the platform-specific logged-in DOM signature.
//   4. Update accounts.cookies_health = "healthy" or "expired".
//   5. Tear down the session if we created it.
//
// If the VPS doesn't yet expose /api/sessions/:id/check-login (the
// companion endpoint in vps-deliverables/check-login-endpoint.js), we bail
// out with `vps_check_login_endpoint_not_deployed` and do NOT touch the
// DB — better to leave health stale than overwrite with bogus data.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const account_id = params.id
  if (!account_id) {
    return NextResponse.json({ ok: false, error: "account_id required" }, { status: 400 })
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const reuseSessionId =
    typeof body?.session_id === "string" && body.session_id.trim()
      ? body.session_id.trim()
      : null

  // ── 1. Look up the account ────────────────────────────────────────
  const { data: account, error: acctErr } = await supabase
    .from("accounts")
    .select("account_id, platform, business_id")
    .eq("account_id", account_id)
    .maybeSingle()

  if (acctErr) {
    return NextResponse.json({ ok: false, error: acctErr.message }, { status: 500 })
  }
  if (!account) {
    return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 })
  }

  const platform = String(account.platform || "").toLowerCase()
  const homeUrl = HOME_FEED[platform]
  if (!homeUrl) {
    return NextResponse.json(
      { ok: false, error: `unsupported platform: ${platform}` },
      { status: 400 }
    )
  }

  // ── 2. Open or reuse a session ────────────────────────────────────
  let sessionId = reuseSessionId
  let sessionWasCreatedByUs = false

  if (!sessionId) {
    try {
      const r = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/vnc/session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id, platform }),
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        }
      )
      if (r.ok) {
        const j: any = await r.json().catch(() => ({}))
        sessionId = j?.session_id || j?.sessionId || null
        sessionWasCreatedByUs = Boolean(sessionId)
      }
    } catch {
      // Fall through — we'll error below.
    }
  }

  if (!sessionId) {
    return NextResponse.json(
      { ok: false, error: "could not open VNC session" },
      { status: 502 }
    )
  }

  // ── 3. Inject latest cookie snapshot, then ask the VPS to check ──
  //   (The VPS check-login endpoint navigates internally; we don't need
  //   to drive navigation from here.)
  await injectLatestCookies(account_id, sessionId).catch(() => null)

  const VPS_URL = await vpsUrl()
  const checkUrl = `${VPS_URL.replace(/\/+$/, "")}/sessions/${encodeURIComponent(
    sessionId
  )}/check-login`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TEST_TIMEOUT_MS)
  let logged_in: boolean | null = null
  let signal: string | null = null
  let probeError: string | null = null
  try {
    const res = await fetch(checkUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, home_url: homeUrl }),
      signal: ctrl.signal,
      cache: "no-store",
    })
    clearTimeout(timer)

    if (res.status === 404) {
      // Tear down our session if we made one and bail without touching DB.
      if (sessionWasCreatedByUs) await teardownSession(sessionId)
      return NextResponse.json({
        ok: false,
        error: "vps_check_login_endpoint_not_deployed",
        deployable: true,
        hint:
          "Deploy vps-deliverables/check-login-endpoint.js to the production VPS",
      })
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      probeError = `VPS returned ${res.status}${txt ? `: ${txt.slice(0, 160)}` : ""}`
    } else {
      const j: any = await res.json().catch(() => ({}))
      logged_in = Boolean(j?.logged_in)
      signal = j?.signal || null
    }
  } catch (e: any) {
    clearTimeout(timer)
    probeError = e?.name === "AbortError" ? "check-login timed out" : e?.message || "fetch failed"
  }

  // ── 4. Tear down session if we created it ─────────────────────────
  if (sessionWasCreatedByUs) await teardownSession(sessionId)

  if (probeError) {
    return NextResponse.json(
      { ok: false, error: probeError },
      { status: 502 }
    )
  }

  // ── 5. Update DB ─────────────────────────────────────────────────
  const health = logged_in ? "healthy" : "expired"
  await supabase
    .from("accounts")
    .update({
      cookies_health: health,
      cookies_last_check: new Date().toISOString(),
      ...(logged_in ? { last_successful_login: new Date().toISOString() } : {}),
    })
    .eq("account_id", account_id)

  return NextResponse.json({
    ok: true,
    healthy: Boolean(logged_in),
    signal: signal || (logged_in ? "logged_in_dom_match" : "no_logged_in_marker"),
  })
}

// ── Helpers ──────────────────────────────────────────────────────────

async function injectLatestCookies(account_id: string, session_id: string) {
  const { data: snap } = await supabase
    .from("account_cookie_snapshots")
    .select("cookies_json, local_storage_json")
    .eq("account_id", account_id)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!snap || !Array.isArray(snap.cookies_json) || snap.cookies_json.length === 0) {
    return
  }

  const VPS_URL = await vpsUrl()
  const url = `${VPS_URL.replace(/\/+$/, "")}/sessions/${encodeURIComponent(
    session_id
  )}/inject-cookies`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cookies: snap.cookies_json,
        local_storage: snap.local_storage_json || null,
      }),
      signal: ctrl.signal,
      cache: "no-store",
    })
  } catch {
    // Best-effort. If injection fails the check-login probe will just say
    // "not logged in" and the user gets the right answer.
  } finally {
    clearTimeout(timer)
  }
}

async function teardownSession(session_id: string): Promise<void> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5000)
  try {
    const VPS_URL = await vpsUrl()
    await fetch(
      `${VPS_URL.replace(/\/+$/, "")}/sessions/${encodeURIComponent(session_id)}`,
      { method: "DELETE", signal: ctrl.signal, cache: "no-store" }
    )
  } catch {
    // Non-fatal — VPS will reap idle sessions on its own.
  } finally {
    clearTimeout(timer)
  }
}
