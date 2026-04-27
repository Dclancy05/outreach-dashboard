// GHL API wrapper with error handling
import { getSecret } from "@/lib/secrets"

const GHL_BASE = "https://services.leadconnectorhq.com"
const GHL_VERSION = "2021-07-28"

export interface GhlResponse {
  error?: string
  status?: number
  [key: string]: unknown
}

export async function ghlFetch(path: string, token: string, options?: RequestInit): Promise<GhlResponse> {
  try {
    const res = await fetch(`${GHL_BASE}${path}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Version": GHL_VERSION,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    })
    if (res.status === 401) {
      return { error: "GHL token not authorized. Please update scopes.", status: 401 }
    }
    if (!res.ok) {
      const text = await res.text()
      return { error: `GHL API error ${res.status}: ${text.slice(0, 200)}`, status: res.status }
    }
    return await res.json()
  } catch (e) {
    return { error: `GHL request failed: ${e instanceof Error ? e.message : String(e)}`, status: 0 }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getGhlToken(supabase: any): Promise<{ token: string; locationId: string } | null> {
  // Try the central secrets store first (api_keys → system_settings → env).
  const apiKey = await getSecret("GHL_API_KEY")
  if (apiKey) {
    const locationId =
      (await getSecret("GHL_SUBACCOUNT_ID")) ||
      (await getSecret("GHL_LOCATION_ID")) ||
      "NmH7aRBeDRq1Wo9qwOqq"
    return { token: apiKey, locationId }
  }
  // Then try outreach_settings table
  try {
    const { data } = await supabase.from("outreach_settings").select("ghl_api_key, ghl_location_id").eq("id", "default").single()
    if (data?.ghl_api_key) {
      return { token: data.ghl_api_key, locationId: data.ghl_location_id || "NmH7aRBeDRq1Wo9qwOqq" }
    }
  } catch { /* */ }
  return null
}
