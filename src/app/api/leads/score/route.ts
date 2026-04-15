import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function scoreLead(lead: Record<string, unknown>): { total_score: number; ranking_tier: string } {
  let score = 0
  if (lead.instagram_url) score += 25
  if (lead.facebook_url) score += 20
  if (lead.linkedin_url) score += 15
  if (lead.email) score += 20
  if (lead.phone) score += 15
  if (lead.website) score += 5

  const total_score = Math.min(100, score)
  const ranking_tier =
    total_score >= 80 ? "A" :
    total_score >= 50 ? "B" :
    total_score >= 20 ? "C" : "D"

  return { total_score, ranking_tier }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const batchSize = body.batch_size || 500

  // Get leads with no total_score
  const { data: leads, error } = await supabase
    .from("leads")
    .select("lead_id, instagram_url, facebook_url, linkedin_url, email, phone, website")
    .is("total_score", null)
    .limit(batchSize)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!leads || leads.length === 0) {
    return NextResponse.json({ success: true, scored: 0, message: "All leads already scored" })
  }

  let scored = 0
  const tiers: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 }

  // Process in batches of 50
  for (let i = 0; i < leads.length; i += 50) {
    const batch = leads.slice(i, i + 50)
    const updates = batch.map(lead => {
      const { total_score, ranking_tier } = scoreLead(lead)
      tiers[ranking_tier]++
      return supabase
        .from("leads")
        .update({ total_score, ranking_tier })
        .eq("lead_id", lead.lead_id)
    })
    await Promise.all(updates)
    scored += batch.length
  }

  return NextResponse.json({
    success: true,
    scored,
    tiers,
    message: `Scored ${scored} leads`,
  })
}
