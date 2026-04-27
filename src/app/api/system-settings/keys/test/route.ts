import { NextRequest, NextResponse } from "next/server"
import { isAllowedKey, readKey, type AllowedKey } from "@/lib/integration-keys"

export const dynamic = "force-dynamic"

const TEST_TIMEOUT_MS = 7000

// POST /api/system-settings/keys/test
// Body: { key }
// Pings the integration's lightweight health endpoint and returns
// { ok: true, detail } or { ok: false, error }. Never returns the raw key.
//
// Each integration has its own probe — we hand-pick a cheap GET that
// returns 401 for a bad key and 200 for a good one. No quota burn, no side
// effects, and a 7-second hard timeout so a hung upstream doesn't hang the
// entire settings page.
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const { key } = body || {}
  if (!key || typeof key !== "string") {
    return NextResponse.json({ ok: false, error: "key required" }, { status: 400 })
  }
  if (!isAllowedKey(key)) {
    return NextResponse.json({ ok: false, error: "key not allowed" }, { status: 400 })
  }

  const value = await readKey(key as AllowedKey)
  if (!value) {
    return NextResponse.json({ ok: false, error: "key is not set" }, { status: 200 })
  }

  try {
    const result = await runProbe(key as AllowedKey, value)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "probe failed" },
      { status: 200 }
    )
  }
}

// ── Per-integration probes ───────────────────────────────────────────

async function runProbe(
  key: AllowedKey,
  value: string
): Promise<{ ok: boolean; detail?: string; error?: string }> {
  switch (key) {
    case "INSTANTLY_API_KEY":
      return probeFetch(
        "https://api.instantly.ai/api/v1/account/list",
        { Authorization: `Bearer ${value}` },
        (j) => `${(j?.accounts || j?.data || j || []).length || 0} accounts`
      )

    case "GHL_API_KEY":
      // Without a subaccount id we can't hit /locations/{id}, so use the
      // generic /users/me-ish endpoint. /oauth/installedLocations works for
      // both agency and location tokens and gives a clear 401 on bad keys.
      return probeFetch(
        "https://services.leadconnectorhq.com/oauth/installedLocations",
        {
          Authorization: `Bearer ${value}`,
          Version: "2021-07-28",
        },
        () => "GHL token accepted"
      )

    case "GHL_SUBACCOUNT_ID":
      // Pure ID — nothing to probe. We only verify the format looks sane.
      return /^[A-Za-z0-9_-]{6,}$/.test(value)
        ? { ok: true, detail: "ID format looks valid (no live probe)" }
        : { ok: false, error: "ID format looks suspicious" }

    case "OPENAI_API_KEY":
      return probeFetch(
        "https://api.openai.com/v1/models",
        { Authorization: `Bearer ${value}` },
        (j) => `${(j?.data || []).length} models accessible`
      )

    case "ANTHROPIC_API_KEY":
      // Anthropic doesn't have a free auth-only ping, but /v1/models is GET
      // and free.
      return probeFetch(
        "https://api.anthropic.com/v1/models",
        {
          "x-api-key": value,
          "anthropic-version": "2023-06-01",
        },
        (j) => `${(j?.data || []).length} models accessible`
      )

    case "APIFY_TOKEN":
      return probeFetch(
        `https://api.apify.com/v2/users/me?token=${encodeURIComponent(value)}`,
        {},
        (j) => `user: ${j?.data?.username || "(unknown)"}`
      )

    case "TELEGRAM_BOT_TOKEN":
      return probeFetch(
        `https://api.telegram.org/bot${encodeURIComponent(value)}/getMe`,
        {},
        (j) => `bot: ${j?.result?.username || "(unknown)"}`
      )

    case "TELEGRAM_CHAT_ID":
      // Just validate it parses as an integer (chat ids are signed ints).
      return /^-?\d{4,}$/.test(value)
        ? { ok: true, detail: "Chat ID format looks valid" }
        : { ok: false, error: "Chat ID should be a numeric integer" }

    case "VPS_URL":
      // Try /health on the VPS. Doesn't require auth.
      try {
        const trimmed = value.replace(/\/+$/, "")
        const r = await fetchWithTimeout(`${trimmed}/health`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
        if (r.ok) return { ok: true, detail: `VPS reachable (${r.status})` }
        return { ok: false, error: `VPS returned ${r.status}` }
      } catch (e: any) {
        return { ok: false, error: `Cannot reach VPS: ${e?.message || "error"}` }
      }

    case "CRON_SECRET":
      // Read-only and we never get here, but defensively:
      return { ok: false, error: "CRON_SECRET cannot be live-tested" }
  }
}

// ── Generic fetch helper ─────────────────────────────────────────────

async function probeFetch(
  url: string,
  headers: Record<string, string>,
  detailFromJson: (j: any) => string
): Promise<{ ok: boolean; detail?: string; error?: string }> {
  try {
    const res = await fetchWithTimeout(url, { method: "GET", headers })
    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      return {
        ok: false,
        error: `${res.status}${txt ? `: ${txt.slice(0, 120)}` : ""}`,
      }
    }
    const json = await res.json().catch(() => ({}))
    return { ok: true, detail: detailFromJson(json) }
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, error: "timed out" }
    return { ok: false, error: e?.message || "fetch failed" }
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" })
  } finally {
    clearTimeout(timer)
  }
}
