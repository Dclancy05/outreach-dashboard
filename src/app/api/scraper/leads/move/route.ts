import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { lead_ids, business_id } = body

  if (!lead_ids?.length) {
    return NextResponse.json({ error: "lead_ids required" }, { status: 400 })
  }

  const businessId = business_id || "default"

  // Fetch scraped leads
  const { data: scrapedLeads, error: fetchError } = await supabase
    .from("scraped_leads")
    .select("*")
    .in("id", lead_ids)
    .eq("is_duplicate", false)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!scrapedLeads?.length) return NextResponse.json({ error: "No leads found" }, { status: 404 })

  let moved = 0
  let skipped = 0
  const moves: { scraped_lead_id: string; target_lead_id: string; business_id: string }[] = []

  for (const sl of scrapedLeads) {
    // Check if already moved
    const { count: alreadyMoved } = await supabase
      .from("lead_moves")
      .select("*", { count: "exact", head: true })
      .eq("scraped_lead_id", sl.id)

    if ((alreadyMoved || 0) > 0) {
      skipped++
      continue
    }

    // Check dedup against existing leads table
    let existingLead: Record<string, unknown> | null = null
    if (sl.google_place_id) {
      const { data } = await supabase.from("leads").select("*").eq("lead_id", sl.google_place_id).single()
      existingLead = data
    }
    if (!existingLead && sl.name && sl.city && sl.phone) {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .ilike("name", sl.name)
        .ilike("city", sl.city)
        .eq("phone", sl.phone)
        .limit(1)
        .single()
      existingLead = data
    }

    if (existingLead) {
      // Merge new data into existing lead
      const updates: Record<string, string> = {}
      if (sl.email && !existingLead.email) updates.email = sl.email
      if (sl.instagram_url) updates.instagram_url = sl.instagram_url
      if (sl.facebook_url) updates.facebook_url = sl.facebook_url
      if (sl.linkedin_url) updates.linkedin_url = sl.linkedin_url
      if (sl.website) updates.website = sl.website

      if (Object.keys(updates).length > 0) {
        await supabase.from("leads").update(updates).eq("lead_id", existingLead.lead_id)
      }

      moves.push({ scraped_lead_id: sl.id, target_lead_id: existingLead.lead_id as string, business_id: businessId })
      moved++
      continue
    }

    // Create new lead
    const leadId = sl.google_place_id || `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const newLead = {
      lead_id: leadId,
      name: sl.name || "",
      city: sl.city || "",
      state: sl.state || "",
      business_type: sl.business_type || sl.category || "",
      phone: sl.phone || "",
      email: sl.email || "",
      all_emails: (sl.all_emails || []).join(", "),
      website: sl.website || "",
      instagram_url: sl.instagram_url || "",
      facebook_url: sl.facebook_url || "",
      linkedin_url: sl.linkedin_url || "",
      total_score: String(sl.quality_score || 0),
      ranking_tier: sl.quality_score >= 70 ? "HOT" : sl.quality_score >= 40 ? "WARM" : "COLD",
      status: "new",
      business_id: businessId,
      all_contacts: "[]",
    }

    const { error: insertError } = await supabase.from("leads").insert(newLead)
    if (insertError) {
      skipped++
      continue
    }

    moves.push({ scraped_lead_id: sl.id, target_lead_id: leadId, business_id: businessId })
    moved++
  }

  // Record moves
  if (moves.length > 0) {
    await supabase.from("lead_moves").insert(moves)
  }

  return NextResponse.json({
    message: `Moved ${moved} leads, skipped ${skipped}`,
    moved,
    skipped,
    total: scrapedLeads.length,
  })
}
