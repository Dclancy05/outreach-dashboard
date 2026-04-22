import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { deriveGeoFields } from "@/lib/fingerprint"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST /api/accounts/:id/fingerprint/refresh-geo
// Re-derive timezone / locale / geo coords from the current proxy_group. Hardware
// fingerprint (UA, screen, GPU) stays locked.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const account_id = params.id
  if (!account_id) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 })
  }

  const { data: acct } = await supabase
    .from("accounts")
    .select("proxy_group_id, proxy_group_id_new")
    .eq("account_id", account_id)
    .maybeSingle()

  const proxyGroupId = acct?.proxy_group_id_new || acct?.proxy_group_id || null
  if (!proxyGroupId) {
    return NextResponse.json(
      { error: "Account has no proxy_group_id — cannot derive geo" },
      { status: 400 }
    )
  }

  const { data: pg } = await supabase
    .from("proxy_groups")
    .select("location_city, location_country")
    .eq("id", proxyGroupId)
    .maybeSingle()

  const geo = deriveGeoFields(pg?.location_country || null, pg?.location_city || null)

  const { data: saved, error } = await supabase
    .from("account_fingerprints")
    .update({
      timezone: geo.timezone,
      locale: geo.locale,
      accept_language: geo.accept_language,
      geo_lat: geo.geo_lat,
      geo_lon: geo.geo_lon,
      proxy_group_id: proxyGroupId,
      updated_at: new Date().toISOString(),
    })
    .eq("account_id", account_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ fingerprint: saved, refreshed: true })
}
