/**
 * Server-side secret reader. Reads from process.env only.
 *
 * Earlier versions of this file looked up an `api_keys` table in Supabase to
 * support a UI-driven secrets manager. That UI was removed (it created a
 * surface that revealed which keys exist, which is itself an attack signal).
 * This file is kept because ~50 call-sites already read through it; deleting
 * it would force a 50-file revert with no behavioral benefit.
 */

export async function getSecret(envVar: string): Promise<string | null> {
  const v = process.env[envVar]
  return typeof v === "string" && v ? v : null
}

export function getSecretSync(envVar: string): string | null {
  const v = process.env[envVar]
  return typeof v === "string" && v ? v : null
}

export function invalidateSecret(_envVar: string): void {
  /* no-op — kept so existing imports compile after the secrets-table removal */
}

export function invalidateAllSecrets(): void {
  /* no-op */
}
