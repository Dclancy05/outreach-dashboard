/**
 * Single secret-reader for the whole app.
 *
 * Resolution order:
 *   1. api_keys table (latest non-expired row for env_var)
 *   2. system_settings.integration_key_<env_var>  (legacy)
 *   3. process.env[env_var]                       (deploy bootstrap)
 *
 * 60s in-process cache so a hot route doesn't hit Supabase on every call.
 * Writers (the /api/api-keys POST handlers) call invalidateSecret() so a saved
 * key takes effect within at most 60s on every serverless instance.
 *
 * Bootstrap secrets (Supabase URL/keys, ADMIN_PIN, SESSION_SIGNING_SECRET,
 * CRON_SECRET, OUTREACH_MEMORY_MCP_KEY) MUST stay on process.env — they're
 * needed before this helper can talk to Supabase. Don't add them to api_keys.
 */

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const cache = new Map<string, { value: string | null; ts: number }>()
const TTL_MS = 60_000

export async function getSecret(envVar: string): Promise<string | null> {
  const cached = cache.get(envVar)
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.value

  // 1. api_keys table — most recently updated, non-expired row wins.
  try {
    const nowIso = new Date().toISOString()
    const { data } = await supabase
      .from("api_keys")
      .select("value, id")
      .eq("env_var", envVar)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data?.value) {
      // Fire-and-forget last_used_at bump.
      void supabase
        .from("api_keys")
        .update({ last_used_at: nowIso })
        .eq("id", data.id)
      cache.set(envVar, { value: data.value, ts: Date.now() })
      return data.value
    }
  } catch {
    // Table missing or DB unreachable — fall through to legacy + env.
  }

  // 2. Legacy system_settings.integration_key_<env_var>.
  try {
    const { data: legacy } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", `integration_key_${envVar}`)
      .maybeSingle()

    const stored = legacy?.value
    let legacyVal: string | null = null
    if (stored && typeof stored === "object" && "value" in stored) {
      const v = (stored as { value: unknown }).value
      if (typeof v === "string" && v) legacyVal = v
    } else if (typeof stored === "string" && stored) {
      legacyVal = stored
    }
    if (legacyVal) {
      cache.set(envVar, { value: legacyVal, ts: Date.now() })
      return legacyVal
    }
  } catch {
    // Fall through.
  }

  // 3. process.env fallback.
  const envVal = process.env[envVar]
  const out = typeof envVal === "string" && envVal ? envVal : null
  cache.set(envVar, { value: out, ts: Date.now() })
  return out
}

/** Synchronous best-effort read — env-only, no DB. Use only where async is impossible. */
export function getSecretSync(envVar: string): string | null {
  const v = process.env[envVar]
  return typeof v === "string" && v ? v : null
}

export function invalidateSecret(envVar: string): void {
  cache.delete(envVar)
}

export function invalidateAllSecrets(): void {
  cache.clear()
}
