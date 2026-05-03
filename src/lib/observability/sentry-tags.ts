/**
 * Wave 3.2 — central Sentry tag constants. Every captureException should
 * include `context` so Sentry alert rules can filter cleanly. Other tags
 * are optional but recommended where the data exists.
 */

export const SENTRY_CONTEXTS = {
  cron: "cron",
  api: "api",
  campaign: "campaign",
  inngest: "inngest",
  vnc: "vnc",
  ui: "ui",
} as const

export type SentryContext = (typeof SENTRY_CONTEXTS)[keyof typeof SENTRY_CONTEXTS]

export interface SentryTagSet {
  context: SentryContext
  cron?: string
  account_id?: string
  platform?: string
  campaign_id?: string
  lead_id?: string
  user_id?: string
  /** Free-form scope for sub-features within a context (e.g. "send", "warmup"). */
  scope?: string
}

export function tagsFor(input: SentryTagSet): Record<string, string> {
  const out: Record<string, string> = { context: input.context }
  for (const [k, v] of Object.entries(input)) {
    if (k !== "context" && typeof v === "string") out[k] = v
  }
  return out
}
