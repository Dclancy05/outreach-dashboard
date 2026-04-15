import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function calculateQualityScore(lead: Record<string, unknown>): number {
  let score = 0
  if (lead.phone) score += 15
  if (lead.email) score += 15
  if (lead.website) score += 10
  if (lead.instagram_url) score += 15
  if (lead.facebook_url) score += 10
  if (lead.linkedin_url) score += 10
  if (lead.rating) score += 5
  if (lead.ig_bio || lead.ig_followers || lead.fb_page_likes) score += 10
  const contacts = [lead.phone, lead.email, lead.instagram_url, lead.facebook_url, lead.linkedin_url].filter(Boolean).length
  if (contacts >= 3) score += 10
  return Math.min(score, 100)
}

// POST: Ingest batch of scraped leads with dedup
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { job_id, leads } = body

  if (!job_id || !leads?.length) {
    return NextResponse.json({ error: "job_id and leads[] required" }, { status: 400 })
  }

  let inserted = 0
  let duplicates = 0
  let merged = 0

  for (const lead of leads) {
    const qualityScore = calculateQualityScore(lead)
    let existingId: string | null = null
    let existingRecord: Record<string, unknown> | null = null

    // Check dedup: google_place_id
    if (lead.google_place_id) {
      const { data } = await supabase
        .from("scraped_leads")
        .select("*")
        .eq("google_place_id", lead.google_place_id)
        .eq("is_duplicate", false)
        .limit(1)
        .single()
      if (data) { existingId = data.id; existingRecord = data }
    }

    // Check dedup: name + city + phone
    if (!existingId && lead.name && lead.city && lead.phone) {
      const { data } = await supabase
        .from("scraped_leads")
        .select("*")
        .ilike("name", lead.name)
        .ilike("city", lead.city)
        .eq("phone", lead.phone)
        .eq("is_duplicate", false)
        .limit(1)
        .single()
      if (data) { existingId = data.id; existingRecord = data }
    }

    // Also check against main leads table
    if (!existingId && lead.google_place_id) {
      const { data } = await supabase.from("leads").select("lead_id").eq("lead_id", lead.google_place_id).single()
      if (data) {
        // Exists in main leads — still insert into scraped_leads but mark as duplicate
        existingId = "main_table"
      }
    }

    if (existingId && existingId !== "main_table" && existingRecord) {
      // MERGE: update existing with any new info
      const updates: Record<string, unknown> = {}
      const mergeLog: Record<string, { old: unknown; new: unknown }> = {}

      const mergeFields = ["email", "website", "instagram_url", "facebook_url", "linkedin_url", "ig_bio", "ig_followers", "ig_following", "ig_posts", "ig_category", "fb_page_likes", "fb_page_type", "li_company_size", "li_industry"]
      for (const field of mergeFields) {
        if (lead[field] && !existingRecord[field]) {
          updates[field] = lead[field]
          mergeLog[field] = { old: null, new: lead[field] }
        }
      }

      // Merge all_emails arrays
      if (lead.all_emails?.length) {
        const existing = (existingRecord.all_emails as string[]) || []
        const combined = [...new Set([...existing, ...lead.all_emails])]
        if (combined.length > existing.length) {
          updates.all_emails = combined
          mergeLog.all_emails = { old: existing, new: combined }
        }
      }

      if (Object.keys(updates).length > 0) {
        updates.quality_score = calculateQualityScore({ ...existingRecord, ...updates })
        const existingMerged = (existingRecord.merged_data as Record<string, unknown>) || {}
        updates.merged_data = { ...existingMerged, [`merge_${Date.now()}`]: mergeLog }
        await supabase.from("scraped_leads").update(updates).eq("id", existingId)
        merged++
      }

      // Insert the new record as a flagged duplicate
      await supabase.from("scraped_leads").insert({
        ...lead,
        scrape_job_id: job_id,
        quality_score: qualityScore,
        is_duplicate: true,
        duplicate_of: existingId,
      })

      duplicates++
    } else {
      // New unique lead
      const { error } = await supabase.from("scraped_leads").insert({
        ...lead,
        scrape_job_id: job_id,
        quality_score: qualityScore,
        is_duplicate: existingId === "main_table",
        enrichment_status: "none",
      })
      if (!error) inserted++
    }
  }

  // Update job stats
  await supabase.from("scrape_jobs").update({
    total_found: inserted + duplicates,
    total_enriched: 0,
  }).eq("id", job_id)

  return NextResponse.json({
    message: `Found ${leads.length} leads, ${duplicates} were duplicates (merged new info into ${merged} existing)`,
    inserted,
    duplicates,
    merged,
    total: leads.length,
  })
}
