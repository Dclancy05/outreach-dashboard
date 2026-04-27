/**
 * Shared helpers for the Settings → Integrations & API Keys panel.
 *
 * Keeps the allowed-key list, the storage prefix, and the read-helper in one
 * place so the GET/POST route and the /test sub-route stay consistent.
 *
 * Storage shape (in `system_settings`):
 *   key:   "integration_key_<NAME>"
 *   value: { value: "<raw secret>" }   ← jsonb, single-field wrapper
 *
 * The wrapper means we can extend `value` later (e.g. add `last_tested_at`
 * or `tested_ok: bool`) without migrating existing rows.
 */

import { createClient } from "@supabase/supabase-js"

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

// Keys that can be read but never written from the UI.
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

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * Read a key's raw value: prefer system_settings, fall back to process.env.
 * Returns `null` if neither source has it.
 */
export async function readKey(key: AllowedKey): Promise<string | null> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", `${KEY_PREFIX}${key}`)
    .maybeSingle()

  const stored = data?.value
  if (stored && typeof stored === "object" && "value" in stored) {
    if (typeof stored.value === "string" && stored.value) return stored.value
  } else if (typeof stored === "string" && stored) {
    return stored
  }

  const fromEnv = process.env[key]
  return typeof fromEnv === "string" && fromEnv ? fromEnv : null
}
