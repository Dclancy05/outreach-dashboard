/**
 * Server-side secret reader.
 *
 * Lookup order:
 *  1. In-memory cache (5-min TTL)
 *  2. The `api_keys` table in Supabase, if reachable — newest non-expired row
 *     for the given env_var. Bumps `last_used_at` async (fire-and-forget).
 *  3. process.env fallback — bootstrap secrets and any env var without a DB row.
 *
 * Never returns secret values to the client; all 50+ call-sites are server-only.
 *
 * Bootstrap secrets (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * ADMIN_PIN, SESSION_SIGNING_SECRET, CRON_SECRET, OUTREACH_MEMORY_MCP_KEY)
 * skip the DB entirely — they're needed *to talk to* the DB.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { BOOTSTRAP_ENV_VARS } from "@/lib/secrets-catalog"

const TTL_MS = 5 * 60 * 1000
type CacheEntry = { value: string | null; expiresAt: number }
const cache = new Map<string, CacheEntry>()

let _client: SupabaseClient | null = null
function client(): SupabaseClient | null {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _client
}

async function readFromDb(envVar: string): Promise<string | null> {
  const c = client()
  if (!c) return null
  const nowIso = new Date().toISOString()
  // Newest non-expired row for this env_var. .or() builds an OR filter.
  const { data, error } = await c
    .from("api_keys")
    .select("id, value, expires_at")
    .eq("env_var", envVar)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  // Fire-and-forget last_used_at touch — never block the caller.
  c.from("api_keys").update({ last_used_at: nowIso }).eq("id", data.id).then(
    () => {},
    () => {},
  )
  return typeof data.value === "string" && data.value ? data.value : null
}

export async function getSecret(envVar: string): Promise<string | null> {
  // Bootstrap secrets always come from env — they're needed *to reach* the DB.
  if (BOOTSTRAP_ENV_VARS.has(envVar)) {
    const v = process.env[envVar]
    return typeof v === "string" && v ? v : null
  }

  const hit = cache.get(envVar)
  if (hit && hit.expiresAt > Date.now()) return hit.value

  // DB first
  let value: string | null = null
  try {
    value = await readFromDb(envVar)
  } catch {
    /* swallow — fall back to env */
  }
  if (!value) {
    const v = process.env[envVar]
    value = typeof v === "string" && v ? v : null
  }

  cache.set(envVar, { value, expiresAt: Date.now() + TTL_MS })
  return value
}

/**
 * Synchronous variant for the very few call sites that can't await. Bypasses
 * the DB entirely — process.env only. The async getSecret() is preferred.
 */
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
