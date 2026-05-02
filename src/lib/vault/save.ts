/**
 * Memory Vault write helper — POSTs/PUTs a markdown file to the vault file-server.
 *
 * Mirrors the pattern in src/app/api/agents/route.ts (`writeVaultFile`) but
 * lives here so any server-side caller (telegram webhook, run-workflow, etc.)
 * can save context without re-implementing auth + URL handling.
 *
 * Usage:
 *   import { saveToVault } from "@/lib/vault/save"
 *   const r = await saveToVault("Conversations/telegram-12345-20260501-1830.md", body)
 *   if (!r.ok) console.error(r.error)
 *
 * The vault file-server lives on the VPS (memory-vault-api on port 8788,
 * exposed via Tailscale Funnel). The dashboard reads MEMORY_VAULT_API_URL +
 * MEMORY_VAULT_TOKEN from getSecret() so values can be live-rotated from
 * /agency/keys without a redeploy.
 */
import { getSecret } from "@/lib/secrets"

export type VaultSaveResult =
  | { ok: true }
  | { ok: false; error: string }

export async function saveToVault(path: string, content: string): Promise<VaultSaveResult> {
  const API_URL = ((await getSecret("MEMORY_VAULT_API_URL")) || "").replace(/\/+$/, "")
  const TOKEN = (await getSecret("MEMORY_VAULT_TOKEN")) || ""
  if (!API_URL) return { ok: false, error: "MEMORY_VAULT_API_URL not configured" }
  if (!TOKEN) return { ok: false, error: "MEMORY_VAULT_TOKEN not configured" }
  try {
    const res = await fetch(`${API_URL}/file`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path, content }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      return { ok: false, error: `vault returned ${res.status}: ${txt.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: `vault unreachable: ${(e as Error).message}` }
  }
}
