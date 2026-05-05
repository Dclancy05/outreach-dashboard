/**
 * Single source of truth for per-(platform, action) URLs.
 *
 * - `recordUrl`: where Chrome should be parked when the user clicks "Record
 *   this automation." For DM actions this is the platform's inbox so the
 *   recording captures opening a thread; for follow/connect it's a known-safe
 *   profile so the recording captures the click sequence on the profile page.
 *
 * - `testUrl`: where Chrome should land during self-test / maintenance replay.
 *   Always a safe public profile that won't notice +50 hits per day from the
 *   test matrix (Phase G runs ~50 lifecycles per combo). DM tests must set
 *   `skipSendOnTest: true` so we open the chat and type "[TEST]" but never
 *   press Enter — net engagement on the target = 0.
 *
 * - `testTargetName`: human-readable label used in toasts and audit log so
 *   the owner can see "Testing IG DM against Starbucks" instead of a UUID.
 *
 * Dedupes the previously-duplicated `SAFE_TEST_TARGETS` in
 * `src/app/api/recordings/build-automation/route.ts` and `TEST_TARGETS` in
 * `src/app/api/recordings/self-test/route.ts`. Those routes now import from
 * here; do not re-introduce inline copies.
 *
 * Phase C (recording-guide coverage for X / Reddit / Snapchat / Pinterest)
 * will append entries to this map when those platforms come online. Keep
 * the same shape: never break the contract, only extend it.
 */

export type PlatformKey =
  | "ig"
  | "fb"
  | "li"
  | "tiktok"
  | "youtube"
  | "x"
  | "reddit"
  | "snapchat"
  | "pinterest"

export interface PlatformActionTarget {
  /** Where Chrome lands when the user starts recording this action. */
  recordUrl: string
  /** Where Chrome lands during self-test / maintenance replay (safe target). */
  testUrl: string
  /** Human-readable name shown in UI ("Testing IG DM against Starbucks"). */
  testTargetName: string
  /**
   * If true, the self-test step that would press the final Send key is
   * skipped — the test will open the chat, type "[TEST]", but never deliver
   * a real message. Required for every DM action.
   */
  skipSendOnTest?: boolean
}

type PlatformActionTargets = Partial<
  Record<PlatformKey, Record<string, PlatformActionTarget>>
>

export const PLATFORM_ACTION_TARGETS: PlatformActionTargets = {
  ig: {
    dm: {
      recordUrl: "https://www.instagram.com/direct/inbox/",
      testUrl: "https://www.instagram.com/starbucks/",
      testTargetName: "Starbucks",
      skipSendOnTest: true,
    },
    follow: {
      recordUrl: "https://www.instagram.com/starbucks/",
      testUrl: "https://www.instagram.com/starbucks/",
      testTargetName: "Starbucks",
    },
    unfollow: {
      recordUrl: "https://www.instagram.com/starbucks/",
      testUrl: "https://www.instagram.com/starbucks/",
      testTargetName: "Starbucks",
    },
  },
  fb: {
    dm: {
      recordUrl: "https://www.facebook.com/messages/",
      testUrl: "https://www.facebook.com/Starbucks",
      testTargetName: "Starbucks",
      skipSendOnTest: true,
    },
    follow: {
      recordUrl: "https://www.facebook.com/Starbucks",
      testUrl: "https://www.facebook.com/Starbucks",
      testTargetName: "Starbucks",
    },
    unfollow: {
      recordUrl: "https://www.facebook.com/Starbucks",
      testUrl: "https://www.facebook.com/Starbucks",
      testTargetName: "Starbucks",
    },
  },
  li: {
    dm: {
      recordUrl: "https://www.linkedin.com/messaging/",
      testUrl: "https://www.linkedin.com/in/satyanadella/",
      testTargetName: "Satya Nadella",
      skipSendOnTest: true,
    },
    connect: {
      recordUrl: "https://www.linkedin.com/in/satyanadella/",
      testUrl: "https://www.linkedin.com/in/satyanadella/",
      testTargetName: "Satya Nadella",
      skipSendOnTest: true,
    },
    follow: {
      recordUrl: "https://www.linkedin.com/in/satyanadella/",
      testUrl: "https://www.linkedin.com/in/satyanadella/",
      testTargetName: "Satya Nadella",
    },
    unfollow: {
      recordUrl: "https://www.linkedin.com/in/satyanadella/",
      testUrl: "https://www.linkedin.com/in/satyanadella/",
      testTargetName: "Satya Nadella",
    },
  },
  tiktok: {
    dm: {
      recordUrl: "https://www.tiktok.com/messages",
      testUrl: "https://www.tiktok.com/@starbucks",
      testTargetName: "Starbucks",
      skipSendOnTest: true,
    },
    follow: {
      recordUrl: "https://www.tiktok.com/@starbucks",
      testUrl: "https://www.tiktok.com/@starbucks",
      testTargetName: "Starbucks",
    },
  },
  youtube: {
    dm: {
      recordUrl: "https://www.youtube.com/feed/inbox",
      testUrl: "https://www.youtube.com/@MrBeast",
      testTargetName: "MrBeast",
      skipSendOnTest: true,
    },
    subscribe: {
      recordUrl: "https://www.youtube.com/@MrBeast",
      testUrl: "https://www.youtube.com/@MrBeast",
      testTargetName: "MrBeast",
    },
  },
}

/**
 * Lookup helper. Returns undefined for unknown (platform, action) pairs so
 * the caller can degrade gracefully (e.g., open the platform homepage and
 * let the user navigate manually).
 */
export function getActionTarget(
  platform: string,
  action: string
): PlatformActionTarget | undefined {
  const p = (platform || "").toLowerCase() as PlatformKey
  const a = (action || "").toLowerCase()
  return PLATFORM_ACTION_TARGETS[p]?.[a]
}

/**
 * Convenience for callers that only need the record-time URL. Falls back to
 * the platform's canonical login URL (so even unknown platforms land somewhere
 * sensible) before finally giving up with about:blank.
 */
export function getRecordUrl(platform: string, action: string): string {
  const target = getActionTarget(platform, action)
  if (target) return target.recordUrl
  // Fallback chain: known login URL → platform homepage → about:blank
  const loginUrls: Record<string, string> = {
    ig: "https://www.instagram.com/",
    fb: "https://www.facebook.com/",
    li: "https://www.linkedin.com/feed/",
    tiktok: "https://www.tiktok.com/",
    youtube: "https://www.youtube.com/",
    x: "https://x.com/home",
    reddit: "https://www.reddit.com/",
    snapchat: "https://web.snapchat.com/",
    pinterest: "https://www.pinterest.com/",
  }
  return loginUrls[platform.toLowerCase()] || "about:blank"
}

/**
 * Compatibility shape for the existing `build-automation` route that wants
 * `Record<platform, Record<action, urlString>>`. Use this to migrate that
 * route from its inline `SAFE_TEST_TARGETS` constant without changing its
 * call sites — return value is structurally identical to the old shape.
 */
export function buildLegacySafeTestTargets(): Record<
  string,
  Record<string, string>
> {
  const out: Record<string, Record<string, string>> = {}
  for (const [platform, actions] of Object.entries(PLATFORM_ACTION_TARGETS)) {
    if (!actions) continue
    out[platform] = {}
    for (const [action, target] of Object.entries(actions)) {
      out[platform][action] = target.testUrl
    }
  }
  return out
}

/**
 * Compatibility shape for the existing `self-test` route that wants
 * `Record<platform, Record<action, { url, name, skipSend? }>>`.
 */
export function buildLegacyTestTargets(): Record<
  string,
  Record<string, { url: string; name: string; skipSend?: boolean }>
> {
  const out: Record<string, Record<string, { url: string; name: string; skipSend?: boolean }>> = {}
  for (const [platform, actions] of Object.entries(PLATFORM_ACTION_TARGETS)) {
    if (!actions) continue
    out[platform] = {}
    for (const [action, target] of Object.entries(actions)) {
      out[platform][action] = {
        url: target.testUrl,
        name: target.testTargetName,
        skipSend: target.skipSendOnTest,
      }
    }
  }
  return out
}
