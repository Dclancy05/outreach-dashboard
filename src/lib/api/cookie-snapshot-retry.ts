/**
 * Background snapshot retry — heals the gap between "user is actually
 * logged in (Chrome jar has the cookie)" and "Supabase has the cookie."
 *
 * Why this exists: real users hit a timing race in the login modal where
 * the user clicks "I'm Logged In" before the platform finishes setting
 * its post-login cookies (e.g. LinkedIn sets `li_at` on the redirect to
 * /feed/, but cookies-dump fires the moment of click). Result:
 * `account_sessions.cookies` is missing the strict auth cookie even
 * though the user IS logged in. Live probe knows the truth (PR #91's
 * chrome_login_probes table) but the saved cookies don't.
 *
 * This module detects the mismatch (probe says yes, saved cookies don't
 * have the strict auth cookie) and silently re-runs the cookies-dump →
 * snapshot pipeline. Called on every 30 s poll tick from the accounts
 * page (PR #108 hooks it in).
 *
 * Belt-and-suspenders: the user no longer has to be the retry mechanism.
 */

// Per-account cooldown so we don't hammer the dump endpoint. Keyed by
// account_id, value = unix-ms of last attempt.
const lastAttemptAt = new Map<string, number>()
// Per-account failure streak. After 3 in a row we stop trying for this
// account this session — manual paste is the path forward.
const failureStreak = new Map<string, number>()

const COOLDOWN_MS = 5 * 60 * 1000   // 5 min between retries per account
const MAX_FAILURES = 3              // stop after this many consecutive fails

type AccountForRetry = {
  account_id: string
  platform: string
  // The same shape get_accounts produces (PR #91's live-probe overlay).
  live_probe_logged_in?: boolean | null
  has_auth_cookie?: boolean
  has_saved_session?: boolean
}

export function shouldRetrySnapshot(a: AccountForRetry): boolean {
  // Only retry the obvious case: live probe says logged in, but the
  // strict auth cookie is missing from the saved session. If the probe
  // is null/unknown we don't know which way to bet — leave it.
  if (a.live_probe_logged_in !== true) return false
  if (a.has_auth_cookie === true) return false
  if (!a.account_id || !a.platform) return false

  // Cooldown — don't retry more than once per 5 min per account.
  const last = lastAttemptAt.get(a.account_id)
  if (last && Date.now() - last < COOLDOWN_MS) return false

  // Stop trying after 3 consecutive failures for this account.
  if ((failureStreak.get(a.account_id) || 0) >= MAX_FAILURES) return false

  return true
}

/**
 * Run one retry attempt. Returns:
 *   "saved"    — full success, cookies now in DB with strict auth cookie
 *   "partial"  — snapshot wrote rows but strict auth cookie still missing
 *   "skipped"  — VPS dump returned nothing useful (502 / empty / timeout)
 *   "error"    — POST snapshot threw
 *
 * Never throws. Always best-effort.
 */
export async function retrySnapshotOnce(a: AccountForRetry): Promise<"saved" | "partial" | "skipped" | "error"> {
  if (!a.account_id || !a.platform) return "error"
  lastAttemptAt.set(a.account_id, Date.now())

  try {
    // Step 1 — pull current cookies from VPS for this platform.
    const dumpRes = await fetch(
      `/api/platforms/cookies-dump?platform=${encodeURIComponent(a.platform)}`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) }
    )
    if (!dumpRes.ok) {
      bumpFailure(a.account_id)
      return "skipped"
    }
    const dumpBody = await dumpRes.json()
    const cookies = dumpBody?.cookies
    if (!Array.isArray(cookies) || cookies.length === 0) {
      bumpFailure(a.account_id)
      return "skipped"
    }

    // Quick local check — does the dump even have the strict auth cookie?
    // If not, the platform still hasn't finished setting it; no point
    // writing an inferior snapshot. This is what causes the original race.
    const wanted = STRICT_COOKIE_BY_PLATFORM[a.platform.toLowerCase()]
    const hasStrict = wanted ? cookies.some((c: { name?: string; value?: string }) =>
      c?.name === wanted && typeof c?.value === "string" && c.value.length > 0
    ) : true
    if (!hasStrict) {
      bumpFailure(a.account_id)
      return "skipped"
    }

    // Step 2 — POST snapshot. Same shape the modal uses.
    const snapRes = await fetch(
      `/api/accounts/${encodeURIComponent(a.account_id)}/cookies/snapshot`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cookies,
          local_storage: dumpBody?.localStorage || null,
          captured_by: "snapshot_retry_tick",
          platform: a.platform,
        }),
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (!snapRes.ok) {
      bumpFailure(a.account_id)
      return "error"
    }
    // Success — clear the failure streak so future glitches don't
    // accumulate against this account.
    failureStreak.delete(a.account_id)
    return hasStrict ? "saved" : "partial"
  } catch {
    bumpFailure(a.account_id)
    return "error"
  }
}

function bumpFailure(accountId: string) {
  failureStreak.set(accountId, (failureStreak.get(accountId) || 0) + 1)
}

// Mirrors AUTH_COOKIE_NAMES in src/lib/api/accounts.ts so both sides agree
// on what counts as a real logged-in cookie. Only the platforms the live
// probe knows about — anything else falls back to permissive behavior.
const STRICT_COOKIE_BY_PLATFORM: Record<string, string> = {
  instagram: "sessionid",
  facebook: "c_user",
  linkedin: "li_at",
  tiktok: "sessionid",
  google: "__Secure-1PSID",
  youtube: "__Secure-1PSID",
}

/**
 * Find candidates for retry from the current accounts list and run them
 * in parallel (capped) so a 30-account list doesn't fan out to 30
 * concurrent fetches against the VPS. Called from the page's poll loop.
 */
export async function runSnapshotRetryTick(
  accounts: AccountForRetry[],
  options: { maxConcurrent?: number; onResult?: (a: AccountForRetry, result: "saved" | "partial" | "skipped" | "error") => void } = {}
): Promise<{ attempted: number; saved: number; skipped: number; error: number; partial: number }> {
  const candidates = accounts.filter(shouldRetrySnapshot)
  const stats = { attempted: candidates.length, saved: 0, skipped: 0, error: 0, partial: 0 }
  if (candidates.length === 0) return stats

  const maxConcurrent = options.maxConcurrent ?? 3
  // Simple sequential-with-bounded-batch — keeps this dependency-free.
  for (let i = 0; i < candidates.length; i += maxConcurrent) {
    const batch = candidates.slice(i, i + maxConcurrent)
    const results = await Promise.allSettled(batch.map(c => retrySnapshotOnce(c)))
    for (let j = 0; j < batch.length; j++) {
      const r = results[j]
      if (r.status === "fulfilled") {
        const v = r.value
        stats[v] += 1
        options.onResult?.(batch[j], v)
      } else {
        stats.error += 1
        options.onResult?.(batch[j], "error")
      }
    }
  }
  return stats
}
