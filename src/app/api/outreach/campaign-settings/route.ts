import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/outreach/campaign-settings
 *
 * Creates a campaign row + per-platform campaign_safety_settings rows.
 * Replaces the old browser-side supabase.from("campaigns").insert +
 * supabase.from("campaign_safety_settings").insert loop.
 *
 * Body:
 *   campaign: Row         — shape matching campaigns table
 *   safety?: Array<Row>   — one row per platform
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const campaign = body.campaign
  const safety = Array.isArray(body.safety) ? body.safety : []

  if (!campaign || typeof campaign !== "object") {
    return NextResponse.json({ error: "Missing campaign" }, { status: 400 })
  }

  try {
    const { error: cErr } = await supabase.from("campaigns").insert(campaign)
    if (cErr) {
      // Non-fatal — existing UI treats this as best-effort (wrapped in try/catch)
      console.warn("campaigns insert failed:", cErr.message)
    }
  } catch (e) {
    console.warn("campaigns insert threw:", e)
  }

  if (safety.length > 0) {
    try {
      const { error: sErr } = await supabase.from("campaign_safety_settings").insert(safety)
      if (sErr) {
        console.warn("campaign_safety_settings insert failed:", sErr.message)
      }
    } catch (e) {
      console.warn("campaign_safety_settings insert threw:", e)
    }
  }

  return NextResponse.json({ success: true })
}
