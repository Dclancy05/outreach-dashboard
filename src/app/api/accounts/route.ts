import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/accounts — lightweight listing used by the onboarding wizard and
// any other caller that just needs "pick an account". Returns public fields
// only (no passwords, no 2fa secrets).
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("business_id")
  const platform = req.nextUrl.searchParams.get("platform")

  let q = supabase
    .from("accounts")
    .select(
      "account_id, platform, username, display_name, status, daily_limit, sends_today, business_id, proxy_group_id, cookies_health, cookies_updated_at"
    )
    .limit(200)

  if (businessId) q = q.eq("business_id", businessId)
  if (platform) q = q.eq("platform", platform)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data || [], total: data?.length || 0 })
}
