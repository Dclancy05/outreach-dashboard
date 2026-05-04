/**
 * Live login-state probe — caches the recording-service `/login-status`
 * response in `chrome_login_probes` (one row per chrome_session_id+platform).
 *
 * Why this exists: the dashboard's accounts read path used to trust saved
 * cookies in the DB. Meta sometimes invalidates a session remotely without
 * touching the cookie, leaving the dashboard claiming "Active" while real
 * Chrome can't actually open Facebook. PR #91 wires this in so that a
 * server-side invalidation flips the badge to Needs Sign-In within ~10
 * minutes (the cache TTL below).
 *
 * Negative-only signal: live-probe `loggedIn=false` DOWNGRADES Active →
 * Needs Sign-In, but `loggedIn=true` does NOT upgrade. Some platforms
 * (LinkedIn) currently let the VPS probe pass on lax cookies (JSESSIONID),
 * which would undo PR #90's strict li_at check if we let it.
 */
import { supabase } from "./helpers"
import { getSecret } from "@/lib/secrets"

export type LoginProbe = {
  platform: string
  logged_in: boolean | null
  reason: string | null
  probed_at: string
}

// Platforms the recording-service /login-status endpoint actually checks.
// Anything else (google, x, snapchat, threads, ...) returns
// `loggedIn: null, reason: "unknown platform"` — we skip those.
const VPS_SUPPORTED = new Set(["instagram", "facebook", "linkedin", "tiktok"])

const DEFAULT_TTL_MS = 10 * 60 * 1000      // 10 min cache before re-probing
const VPS_TIMEOUT_MS = 3000                 // hard cap so a slow VPS doesn't block page load

export function isVpsSupported(platform: string): boolean {
  return VPS_SUPPORTED.has(platform.toLowerCase())
}

/** Read cached probes from the DB (no network). */
export async function readCachedProbes(
  chromeSessionId: string,
  platforms: string[],
): Promise<Record<string, LoginProbe>> {
  if (platforms.length === 0) return {}
  const { data, error } = await supabase
    .from("chrome_login_probes")
    .select("platform, logged_in, reason, probed_at")
    .eq("chrome_session_id", chromeSessionId)
    .in("platform", platforms.map(p => p.toLowerCase()))
  if (error) return {}
  const out: Record<string, LoginProbe> = {}
  for (const row of (data || []) as LoginProbe[]) out[row.platform] = row
  return out
}

/**
 * Hit the VPS for fresh state and upsert into chrome_login_probes.
 * Returns the parsed result. On error returns null (caller should fall
 * back to whatever cache it has).
 */
async function refreshProbes(
  chromeSessionId: string,
  platforms: string[],
): Promise<Record<string, LoginProbe> | null> {
  const supported = platforms.map(p => p.toLowerCase()).filter(p => VPS_SUPPORTED.has(p))
  if (supported.length === 0) return {}

  const VPS_URL = (await getSecret("VPS_URL")) || "https://srv1197943.taild42583.ts.net:10000"
  const url = `${VPS_URL}/login-status?platforms=${encodeURIComponent(supported.join(","))}`

  let body: { results?: Array<{ platform: string; loggedIn: boolean | null; reason?: string }> } | null = null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(VPS_TIMEOUT_MS) })
    if (!res.ok) return null
    body = await res.json()
  } catch {
    return null
  }
  if (!body || !Array.isArray(body.results)) return null

  const now = new Date().toISOString()
  const rows = body.results
    .filter(r => VPS_SUPPORTED.has(r.platform))
    .map(r => ({
      chrome_session_id: chromeSessionId,
      platform: r.platform,
      logged_in: r.loggedIn,
      reason: r.reason || null,
      probed_at: now,
    }))

  if (rows.length > 0) {
    await supabase
      .from("chrome_login_probes")
      .upsert(rows, { onConflict: "chrome_session_id,platform" })
  }

  const out: Record<string, LoginProbe> = {}
  for (const r of rows) {
    out[r.platform] = {
      platform: r.platform,
      logged_in: r.logged_in,
      reason: r.reason,
      probed_at: r.probed_at,
    }
  }
  return out
}

/**
 * Read probes from cache; if any are missing or older than ttlMs, refresh
 * once and merge the result. Always returns the freshest data we could get
 * — caller decides how to handle "platform missing from result" (treat as
 * "no signal, trust local check").
 */
export async function ensureFreshProbes(
  chromeSessionId: string,
  platforms: string[],
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<Record<string, LoginProbe>> {
  const supported = platforms.map(p => p.toLowerCase()).filter(p => VPS_SUPPORTED.has(p))
  if (supported.length === 0) return {}

  const cached = await readCachedProbes(chromeSessionId, supported)
  const now = Date.now()
  const stale = supported.filter(p => {
    const row = cached[p]
    if (!row) return true
    return now - new Date(row.probed_at).getTime() > ttlMs
  })

  if (stale.length === 0) return cached

  const fresh = await refreshProbes(chromeSessionId, stale)
  // If the refresh failed entirely, fall back to whatever cache we have.
  // The badge will keep showing the local-check verdict — same behavior
  // as before this feature shipped, no regression on VPS outage.
  if (!fresh) return cached

  return { ...cached, ...fresh }
}
