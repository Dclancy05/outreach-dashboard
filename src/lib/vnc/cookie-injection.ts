/**
 * Pure helper that powers `/api/vnc/inject-cookies`. Extracting the logic
 * here lets `/api/recordings/start` compose cookie injection inline without
 * an internal HTTP round-trip and without duplicating the Supabase + VPS
 * orchestration.
 *
 * **The shared `/api/vnc/inject-cookies` route is the single owner of cookie
 * injection and is consumed by the accounts page via the platform-login
 * modal.** This helper keeps that route's external API identical (same JSON
 * response shape, same status codes), so refactoring the route to call this
 * helper is a SAFE change. If you're tempted to alter the response shape,
 * stop — change the consumer (the recordings/start route) instead.
 */

import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const INJECT_TIMEOUT_MS = 10_000

async function vpsUrl(): Promise<string> {
  return (
    (await getSecret("VPS_URL")) ||
    (await getSecret("RECORDING_SERVER_URL")) ||
    "https://srv1197943.taild42583.ts.net:10000"
  )
}

export interface InjectCookiesParams {
  /** VPS Chrome session id returned by VPS /start */
  sessionId: string
  /** account_id whose latest snapshot we should inject */
  accountId: string
}

/**
 * Result shape mirrors the route's previous JSON shape exactly so the route
 * can do `return NextResponse.json(result, { status: result.httpStatus })`
 * with no behavior change.
 */
export interface InjectCookiesResult {
  httpStatus: number
  body:
    | {
        ok: true
        cookies_set: number
        local_storage_set: boolean
        captured_at: string
      }
    | {
        ok: false
        error: string
        deployable?: boolean
        hint?: string
      }
}

/**
 * Loads the most recent cookie snapshot for `accountId` from
 * `account_cookie_snapshots` and POSTs it to the VPS at
 * `${VPS_URL}/sessions/{sessionId}/inject-cookies`.
 *
 * Returns a structured result the caller can convert into either an HTTP
 * response (route handler) or a programmatic value (recordings/start
 * composing the call inline).
 */
export async function injectCookiesForAccount(
  params: InjectCookiesParams
): Promise<InjectCookiesResult> {
  const { sessionId, accountId } = params

  if (!sessionId || typeof sessionId !== "string") {
    return { httpStatus: 400, body: { ok: false, error: "session_id required" } }
  }
  if (!accountId || typeof accountId !== "string") {
    return { httpStatus: 400, body: { ok: false, error: "account_id required" } }
  }

  // ── 1. Pull the most recent snapshot for this account ──────────────
  const { data: snap, error: snapErr } = await supabase
    .from("account_cookie_snapshots")
    .select("cookies_json, local_storage_json, captured_at")
    .eq("account_id", accountId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (snapErr) {
    return { httpStatus: 500, body: { ok: false, error: snapErr.message } }
  }
  if (
    !snap ||
    !Array.isArray(snap.cookies_json) ||
    snap.cookies_json.length === 0
  ) {
    return {
      httpStatus: 404,
      body: { ok: false, error: "no cookie snapshot found for account" },
    }
  }

  // ── 2. POST to the VPS ────────────────────────────────────────────
  const VPS_URL = await vpsUrl()
  const url = `${VPS_URL.replace(/\/+$/, "")}/sessions/${encodeURIComponent(
    sessionId
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
      // VPS doesn't have the cookie-injection endpoint deployed yet — surface
      // a structured signal so the UI can show "deploy the VPS service first"
      // banner instead of a scary stack trace. Status 200 (ok body, ok:false)
      // matches the route's previous behavior where this was returned with
      // HTTP 200 to keep the failure non-fatal.
      return {
        httpStatus: 200,
        body: {
          ok: false,
          error: "vps_endpoint_not_deployed",
          deployable: true,
          hint:
            "Deploy vps-deliverables/cookie-injection-endpoint.js to the production VPS",
        },
      }
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      return {
        httpStatus: 502,
        body: {
          ok: false,
          error: `VPS returned ${res.status}${
            txt ? `: ${txt.slice(0, 160)}` : ""
          }`,
        },
      }
    }

    const json: any = await res.json().catch(() => ({}))
    return {
      httpStatus: 200,
      body: {
        ok: true,
        cookies_set: json?.cookies_set ?? snap.cookies_json.length,
        local_storage_set: Boolean(snap.local_storage_json),
        captured_at: snap.captured_at,
      },
    }
  } catch (e: any) {
    clearTimeout(timer)
    if (e?.name === "AbortError") {
      return {
        httpStatus: 504,
        body: { ok: false, error: "VPS injection request timed out" },
      }
    }
    return {
      httpStatus: 502,
      body: { ok: false, error: e?.message || "injection failed" },
    }
  }
}
