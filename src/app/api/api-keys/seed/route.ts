/**
 * /api/api-keys/seed — one-shot import of existing keys.
 *
 * Idempotent: for each known provider, picks the first non-empty value found
 * in `system_settings.integration_key_<env>` or `process.env[env]` and
 * inserts a row in `api_keys` if no row exists yet for that env_var.
 *
 * Returns { inserted, skipped, results: [{ env_var, status, source }] }.
 */

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { PROVIDERS, BOOTSTRAP_ENV_VARS } from "@/lib/secrets-catalog"
import { invalidateSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type SeedResult = {
  env_var: string
  provider: string
  status: "inserted" | "skipped_existing" | "skipped_no_value"
  source?: "system_settings" | "process_env"
}

export async function POST() {
  // Pull all existing api_keys env_vars in one query so we don't N+1 the check.
  const { data: existing, error: existingErr } = await supabase
    .from("api_keys")
    .select("env_var")

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 })
  }

  const haveEnvVar = new Set<string>(
    (existing || []).map((r: { env_var: string }) => r.env_var)
  )

  // Pull legacy system_settings.integration_key_* in one query too.
  const { data: legacyRows } = await supabase
    .from("system_settings")
    .select("key, value")
    .like("key", "integration_key_%")

  const legacyByEnv = new Map<string, string>()
  for (const row of legacyRows || []) {
    const envName = (row.key as string).replace(/^integration_key_/, "")
    const stored = row.value
    let v: string | null = null
    if (stored && typeof stored === "object" && "value" in stored) {
      const inner = (stored as { value: unknown }).value
      if (typeof inner === "string" && inner) v = inner
    } else if (typeof stored === "string" && stored) {
      v = stored
    }
    if (v) legacyByEnv.set(envName, v)
  }

  const results: SeedResult[] = []
  const toInsert: Array<{
    name: string
    provider: string
    env_var: string
    value: string
  }> = []

  for (const provider of PROVIDERS) {
    if (provider.slug === "custom") continue
    if (provider.envVars.length === 0) continue

    // Pick the canonical (first) env var as the row's identity.
    const canonicalEnv = provider.envVars[0]

    if (BOOTSTRAP_ENV_VARS.has(canonicalEnv)) continue

    if (haveEnvVar.has(canonicalEnv)) {
      results.push({
        env_var: canonicalEnv,
        provider: provider.slug,
        status: "skipped_existing",
      })
      continue
    }

    // Try every alias. system_settings first (it's where rotated keys live),
    // then process.env.
    let value: string | null = null
    let source: "system_settings" | "process_env" | undefined
    for (const envName of provider.envVars) {
      const fromLegacy = legacyByEnv.get(envName)
      if (fromLegacy) {
        value = fromLegacy
        source = "system_settings"
        break
      }
    }
    if (!value) {
      for (const envName of provider.envVars) {
        const fromEnv = process.env[envName]
        if (typeof fromEnv === "string" && fromEnv) {
          value = fromEnv
          source = "process_env"
          break
        }
      }
    }

    if (!value) {
      results.push({
        env_var: canonicalEnv,
        provider: provider.slug,
        status: "skipped_no_value",
      })
      continue
    }

    toInsert.push({
      name: `${provider.label} (imported)`,
      provider: provider.slug,
      env_var: canonicalEnv,
      value,
    })
    results.push({
      env_var: canonicalEnv,
      provider: provider.slug,
      status: "inserted",
      source,
    })
  }

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase.from("api_keys").insert(toInsert)
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }
    for (const r of toInsert) invalidateSecret(r.env_var)
  }

  return NextResponse.json({
    inserted: toInsert.length,
    skipped: results.length - toInsert.length,
    results,
  })
}
