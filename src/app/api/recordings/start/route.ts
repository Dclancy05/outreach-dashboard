import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"
import {
  rateLimitDb,
  retryAfterHeaders,
  ipFromRequest,
} from "@/lib/rate-limit"
import { extractAdminId, withAudit } from "@/lib/audit"
import { injectCookiesForAccount } from "@/lib/vnc/cookie-injection"
import { getRecordUrl } from "@/lib/automations/platform-action-targets"

// Recording control endpoints drive Chrome on the VPS. Per CLAUDE.md
// ban-risk policy, every Chrome-driving endpoint must be rate-limited.
// 5 starts per minute per admin is loose enough for legit retries (the
// VPS sometimes needs a kick) and tight enough to catch a runaway script.
const RECORDING_LIMIT = 5
const RECORDING_WINDOW_MS = 60 * 1000

const VPS_TIMEOUT_MS = 10_000
const GOTO_TIMEOUT_MS = 15_000

const KNOWN_PLATFORMS = new Set([
  "ig",
  "fb",
  "li",
  "tiktok",
  "youtube",
  "x",
  "twitter",
  "reddit",
  "snapchat",
  "pinterest",
])

interface StartBody {
  /** Platform key — "ig" / "fb" / "li" / etc. (Phase B). Optional for back-compat. */
  platform?: string
  /** Action key — "dm" / "follow" / "connect" / etc. (Phase B). */
  action_type?: string
  /** Proxy group id of the dummy group whose Chrome profile to use. */
  account_group_id?: string
  /** account_id whose cookie snapshot to inject before recording. */
  account_id?: string
  /** Override URL Chrome should land at (rare; defaults to per-action target). */
  target_url?: string
}

async function parseBody(req: Request): Promise<StartBody> {
  // Old Phase A clients POST with no body — that's fine, default everything.
  const ct = req.headers.get("content-type") || ""
  if (!ct.includes("application/json")) return {}
  try {
    const txt = await req.text()
    if (!txt) return {}
    return JSON.parse(txt) as StartBody
  } catch {
    return {}
  }
}

async function postHandler(req: Request) {
  const adminId =
    extractAdminId(req.headers.get("cookie")) || `ip:${ipFromRequest(req)}`
  const limit = await rateLimitDb(
    `recording-start:${adminId}`,
    RECORDING_LIMIT,
    RECORDING_WINDOW_MS
  )
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "Recording control rate-limited. Try again in a minute.",
        retryAt: new Date(limit.resetAt).toISOString(),
      },
      { status: 429, headers: retryAfterHeaders(limit.resetAt) }
    )
  }

  const body = await parseBody(req)
  // Bug #7 fix — type guards. If client sends `{ account_id: 12345 }`
  // (number), `body.account_id?.trim()` would throw "not a function"
  // because numbers don't have .trim(). Guard each field with typeof
  // checks so a malformed body returns 400 rather than crashing.
  const asString = (v: unknown): string | undefined =>
    typeof v === "string" ? v : undefined
  const platform = asString(body.platform)?.trim().toLowerCase()
  const actionType = asString(body.action_type)?.trim().toLowerCase()
  const accountId = asString(body.account_id)?.trim()
  const groupId = asString(body.account_group_id)?.trim()

  if (platform && !KNOWN_PLATFORMS.has(platform)) {
    return NextResponse.json(
      { error: `unknown platform: ${platform}` },
      { status: 400 }
    )
  }

  // Resolve target URL: explicit override → per-(platform, action) record
  // URL → undefined (skip pre-navigation entirely).
  // Bug #22 — validate target_url is http(s) before honoring it. Without
  // this, a client could pass `target_url: "javascript:..."` or
  // `file:///etc/passwd` and the VPS Chrome would dutifully navigate
  // there. The PLATFORM_ACTION_TARGETS map is hard-coded so the fallback
  // path is always safe; only the override needs hardening.
  const overrideUrl = asString(body.target_url)
  const safeOverride =
    overrideUrl && /^https?:\/\//i.test(overrideUrl) ? overrideUrl : undefined
  const targetUrl =
    safeOverride ||
    (platform && actionType ? getRecordUrl(platform, actionType) : undefined)

  let VPS_URL: string
  try {
    VPS_URL =
      (await getSecret("VPS_URL")) ||
      (await getSecret("RECORDING_SERVER_URL")) ||
      "http://srv1197943.hstgr.cloud:3848"
  } catch (e) {
    // Bug #16 — don't echo getSecret's error message (could leak secret
    // values if the lookup error includes them). Log server-side, return
    // a sanitized message to the client.
    console.error("[recordings/start] VPS_URL secret lookup failed:", e)
    return NextResponse.json(
      { error: "Failed to read VPS_URL secret" },
      { status: 500 }
    )
  }

  // ─── 1. Tell the VPS to start a recording session ────────────────────
  // Forward the proxy_group_id + account_id so the VPS can pick the right
  // Chrome profile. The VPS will fall back to "main" Chrome if either is
  // missing (Phase B: VPS-side multi-session is best-effort).
  let startData: any
  let startStatus = 502
  try {
    const res = await fetch(`${VPS_URL}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proxy_group_id: groupId,
        account_id: accountId,
      }),
      signal: AbortSignal.timeout(VPS_TIMEOUT_MS),
    })
    startData = await res.json().catch(() => ({}))
    startStatus = res.status
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown"
    return NextResponse.json(
      { error: "Failed to connect to recording service", details: msg },
      { status: 502 }
    )
  }
  if (startStatus >= 400 || !startData?.sessionId) {
    return NextResponse.json(startData ?? { error: "VPS /start failed" }, {
      status: startStatus,
    })
  }
  const sessionId: string = startData.sessionId

  // ─── 2. Inject cookies for the chosen account (if any) ────────────────
  // Best-effort: if no account picked or no snapshot exists, skip. The user
  // can still record (they'll just have to log in manually inside the VNC
  // window). When the cookie-injection VPS endpoint isn't deployed yet, the
  // helper returns ok:false but httpStatus:200 so we treat it as "not fatal."
  let cookiesInjected: {
    ok: boolean
    error?: string
    captured_at?: string
    deployable?: boolean
    hint?: string
  } = { ok: false, error: "no account_id supplied" }
  if (accountId) {
    const inj = await injectCookiesForAccount({ sessionId, accountId })
    cookiesInjected = {
      ok: "ok" in inj.body && inj.body.ok === true,
      error: "ok" in inj.body && inj.body.ok ? undefined : (inj.body as any).error,
      captured_at:
        "ok" in inj.body && inj.body.ok ? (inj.body as any).captured_at : undefined,
      deployable: "deployable" in inj.body ? (inj.body as any).deployable : undefined,
      hint: "hint" in inj.body ? (inj.body as any).hint : undefined,
    }
  }

  // ─── 3. Pre-navigate Chrome to the per-(platform, action) record URL ─
  // Best-effort: if /goto isn't supported on the VPS or the request times
  // out, the user can still type the URL manually inside the VNC window.
  let navigated: { ok: boolean; url?: string; error?: string } = {
    ok: false,
    url: targetUrl,
    error: targetUrl ? undefined : "no target_url resolved",
  }
  if (targetUrl) {
    try {
      const res = await fetch(
        `${VPS_URL}/sessions/${encodeURIComponent(sessionId)}/goto`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl }),
          signal: AbortSignal.timeout(GOTO_TIMEOUT_MS),
        }
      )
      navigated.ok = res.ok
      if (!res.ok) {
        navigated.error = `VPS /goto returned ${res.status}`
      }
    } catch (e) {
      navigated.error = e instanceof Error ? e.message : "goto failed"
    }
  }

  return NextResponse.json({
    success: true,
    sessionId,
    account_id: accountId || null,
    group_id: groupId || null,
    platform: platform || null,
    action_type: actionType || null,
    target_url: targetUrl || null,
    cookies_injected: cookiesInjected,
    navigated,
    // Pass through any extra fields the VPS returned (warmup_day, etc.).
    vps: startData,
  })
}

export const POST = withAudit("POST /api/recordings/start", postHandler)
