/**
 * Per-provider live tests. Hit a cheap GET that returns 401 for a bad key
 * and 200 for a good one — no quota burn, no side effects, 7s hard timeout.
 *
 * Keyed by env-var name so callers can pass a row from `api_keys` without
 * mapping to a separate "AllowedKey" enum first.
 */

const TEST_TIMEOUT_MS = 7000

export type ProbeResult = {
  ok: boolean
  detail?: string
  error?: string
}

export async function runKeyProbe(
  envVar: string,
  value: string
): Promise<ProbeResult> {
  switch (envVar) {
    case "INSTANTLY_API_KEY":
      return probeFetch(
        "https://api.instantly.ai/api/v1/account/list",
        { Authorization: `Bearer ${value}` },
        (j) => `${(j?.accounts || j?.data || j || []).length || 0} accounts`
      )

    case "GHL_API_KEY":
      return probeFetch(
        "https://services.leadconnectorhq.com/oauth/installedLocations",
        {
          Authorization: `Bearer ${value}`,
          Version: "2021-07-28",
        },
        () => "GHL token accepted"
      )

    case "GHL_SUBACCOUNT_ID":
    case "GHL_LOCATION_ID":
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
      return probeFetch(
        "https://api.anthropic.com/v1/models",
        {
          "x-api-key": value,
          "anthropic-version": "2023-06-01",
        },
        (j) => `${(j?.data || []).length} models accessible`
      )

    case "APIFY_TOKEN":
    case "APIFY_API_TOKEN":
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
      return /^-?\d{4,}$/.test(value)
        ? { ok: true, detail: "Chat ID format looks valid" }
        : { ok: false, error: "Chat ID should be a numeric integer" }

    case "VPS_URL":
    case "RECORDING_SERVER_URL":
      try {
        const trimmed = value.replace(/\/+$/, "")
        const r = await fetchWithTimeout(`${trimmed}/health`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
        if (r.ok) return { ok: true, detail: `VPS reachable (${r.status})` }
        return { ok: false, error: `VPS returned ${r.status}` }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "error"
        return { ok: false, error: `Cannot reach VPS: ${msg}` }
      }

    default:
      // No live probe for this key — just confirm it's non-empty.
      return value.length > 0
        ? { ok: true, detail: "Saved (no live test for this provider)" }
        : { ok: false, error: "value is empty" }
  }
}

async function probeFetch(
  url: string,
  headers: Record<string, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detailFromJson: (j: any) => string
): Promise<ProbeResult> {
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
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: "timed out" }
    }
    const msg = e instanceof Error ? e.message : "fetch failed"
    return { ok: false, error: msg }
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
