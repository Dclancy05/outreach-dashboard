/**
 * Legacy helpers for the old `system_settings.integration_key_*` shape.
 *
 * The 10 hardcoded ALLOWED_KEYS are kept so the legacy
 * /api/system-settings/keys + /test routes stay compatible during rollout.
 * `readKey()` now delegates to the central `getSecret()` so any code still
 * calling it picks up new values from the api_keys table automatically.
 *
 * For new call-sites, import `getSecret` from "@/lib/secrets" directly —
 * it works for any env-var name, not just the 10 in ALLOWED_KEYS.
 */

import { getSecret } from "./secrets"

export const ALLOWED_KEYS = [
  "INSTANTLY_API_KEY",
  "GHL_API_KEY",
  "GHL_SUBACCOUNT_ID",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "APIFY_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "VPS_URL",
  "CRON_SECRET",
] as const

export type AllowedKey = (typeof ALLOWED_KEYS)[number]

export const READ_ONLY_KEYS: ReadonlySet<string> = new Set(["CRON_SECRET"])

export const KEY_PREFIX = "integration_key_"

export function isAllowedKey(key: string): key is AllowedKey {
  return (ALLOWED_KEYS as readonly string[]).includes(key)
}

/** Mask all but the last 4 chars. Empty / very short values get a flat dot. */
export function maskValue(raw: string | null | undefined): string {
  if (!raw) return ""
  const s = String(raw)
  if (s.length <= 4) return "•••••"
  return `${s.slice(0, 3)}…${s.slice(-4)}`
}

/**
 * Read a key's raw value via the new central store (api_keys → system_settings → env).
 */
export async function readKey(key: AllowedKey): Promise<string | null> {
  return getSecret(key)
}
