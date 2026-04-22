import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { generateFingerprint, deriveGeoFields } from "@/lib/fingerprint"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST /api/accounts/:id/fingerprint/generate
// Idempotent: if a fingerprint exists and `force: true` is not passed, return
// the existing one. Fingerprint rotation on a live account tends to trigger
// a soft-ban, so we require explicit opt-in.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const account_id = params.id
  if (!account_id) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 })
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    // empty body is fine
  }
  const force = !!body?.force

  // Check existing
  const { data: existing } = await supabase
    .from("account_fingerprints")
    .select("*")
    .eq("account_id", account_id)
    .maybeSingle()

  if (existing && !force) {
    return NextResponse.json({
      fingerprint: existing,
      generated: false,
      reason: "already_exists",
    })
  }

  // Pull proxy geo
  const { data: acct } = await supabase
    .from("accounts")
    .select("account_id, proxy_group_id, proxy_group_id_new")
    .eq("account_id", account_id)
    .maybeSingle()

  const proxyGroupId = acct?.proxy_group_id_new || acct?.proxy_group_id || null
  let country: string | null = null
  let city: string | null = null
  if (proxyGroupId) {
    const { data: pg } = await supabase
      .from("proxy_groups")
      .select("location_city, location_country")
      .eq("id", proxyGroupId)
      .maybeSingle()
    if (pg) {
      city = pg.location_city || null
      country = pg.location_country || null
    }
  }

  const fp = generateFingerprint()
  const geo = deriveGeoFields(country, city)

  const row = {
    account_id,
    user_agent: fp.user_agent,
    platform: fp.platform,
    screen_width: fp.screen_width,
    screen_height: fp.screen_height,
    device_pixel_ratio: fp.device_pixel_ratio,
    color_depth: fp.color_depth,
    hardware_concurrency: fp.hardware_concurrency,
    device_memory: fp.device_memory,
    webgl_vendor: fp.webgl_vendor,
    webgl_renderer: fp.webgl_renderer,
    canvas_noise_seed: fp.canvas_noise_seed,
    audio_noise_seed: fp.audio_noise_seed,
    timezone: geo.timezone,
    locale: geo.locale,
    accept_language: geo.accept_language,
    geo_lat: geo.geo_lat,
    geo_lon: geo.geo_lon,
    proxy_group_id: proxyGroupId,
    chrome_profile_dir: `/vps/profiles/${account_id}`,
    updated_at: new Date().toISOString(),
  }

  const { data: saved, error } = await supabase
    .from("account_fingerprints")
    .upsert(row, { onConflict: "account_id" })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ fingerprint: saved, generated: true })
}
