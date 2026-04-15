import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const GOOD_KEYWORDS = ["restaurant", "salon", "gym", "fitness", "spa", "barber", "tattoo", "dental", "dentist", "chiropractor", "realtor", "real estate", "plumber", "hvac", "landscap", "cleaning", "auto", "mechanic", "pet", "grooming", "yoga", "pilates", "cafe", "coffee", "bakery", "florist", "photography", "wedding", "nail", "beauty", "clinic", "therapy", "massage", "coaching", "personal train"]
const COMPETITOR_KEYWORDS = ["marketing agency", "digital marketing", "social media manager", "seo agency", "web design agency", "advertising agency", "branding agency", "media agency", "growth agency", "lead gen"]
const ENTERPRISE_KEYWORDS = ["corporate", "inc", "llc", "ltd", "group", "holdings", "international", "global", "worldwide"]

function scoreLead(lead: Record<string, unknown>): { total_score: number; ranking_tier: string; auto_tags: string[] } {
  let score = 0
  const autoTags: string[] = []
  
  // Parse raw scrape data
  let raw: Record<string, unknown> = {}
  try {
    raw = typeof lead._raw_scrape_data === "string" ? JSON.parse(lead._raw_scrape_data || "{}") : (lead._raw_scrape_data || {}) as Record<string, unknown>
  } catch { /* */ }
  
  const ig = (raw.instagram || raw) as Record<string, unknown>
  const followers = Number(ig.ig_followers || ig.followers || lead.followers || 0)
  
  // Follower scoring (sweet spot 500-50k)
  if (followers >= 500 && followers <= 5000) score += 25
  else if (followers > 5000 && followers <= 20000) score += 20
  else if (followers > 20000 && followers <= 50000) score += 15
  else if (followers > 50000 && followers <= 100000) score += 5
  else if (followers > 100000) {
    score -= 10
    autoTags.push("enterprise")
  }
  else if (followers > 0 && followers < 500) score += 10
  
  // Enterprise detection
  const name = String(lead.name || "").toLowerCase()
  const hasEnterprise = ENTERPRISE_KEYWORDS.some(k => name.includes(k))
  if (hasEnterprise || followers > 100000) {
    autoTags.push("enterprise")
    score -= 5
  }
  
  // Website bonus
  if (lead.website) score += 10
  
  // Has email
  if (lead.email) score += 10
  
  // Has phone
  if (lead.phone) score += 5
  
  // Bio keyword matching
  const bio = String(ig.ig_bio || ig.biography || ig.bio || "").toLowerCase()
  const businessType = String(lead.business_type || "").toLowerCase()
  const combined = `${bio} ${businessType} ${name}`
  
  const isCompetitor = COMPETITOR_KEYWORDS.some(k => combined.includes(k))
  if (isCompetitor) {
    autoTags.push("competitor")
    score -= 20
  }
  
  const hasGoodKeyword = GOOD_KEYWORDS.some(k => combined.includes(k))
  if (hasGoodKeyword) {
    score += 15
    autoTags.push("high-value")
  }
  
  // Post frequency/recency
  const postsCount = Number(ig.ig_posts_count || ig.media_count || 0)
  if (postsCount > 50) score += 10
  else if (postsCount > 10) score += 5
  
  // Engagement rate
  const engRate = Number(ig.ig_engagement_rate || ig.engagement_rate || 0)
  if (engRate > 3) score += 10
  else if (engRate > 1) score += 5
  
  // Has Instagram URL
  if (lead.instagram_url) score += 5
  
  // Staleness check (no scrape data = lower score)
  if (!lead._raw_scrape_data || lead._raw_scrape_data === "{}") {
    score -= 5
    autoTags.push("stale")
  }
  
  // Clamp score
  score = Math.max(0, Math.min(100, score))
  
  // Tier assignment
  let tier = "D"
  if (isCompetitor) tier = "X"
  else if (score >= 60) tier = "A"
  else if (score >= 40) tier = "B"
  else if (score >= 20) tier = "C"
  
  return { total_score: score, ranking_tier: tier, auto_tags: [...new Set(autoTags)] }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { lead_ids, business_id, score_all } = body
    
    if (!lead_ids?.length && !business_id && !score_all) {
      return NextResponse.json({ error: "Provide lead_ids, business_id, or score_all=true" }, { status: 400 })
    }

    // Fetch all leads (paginate to avoid Supabase 1000 row limit)
    let leads: Record<string, unknown>[] = []
    const PAGE_SIZE = 1000
    let from = 0
    while (true) {
      let query = supabase.from("leads").select("*").range(from, from + PAGE_SIZE - 1)
      if (lead_ids?.length) query = query.in("lead_id", lead_ids)
      else if (business_id) query = query.eq("business_id", business_id)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      if (!data?.length) break
      leads.push(...data)
      if (data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
    
    if (!leads?.length) return NextResponse.json({ success: true, scored: 0 })
    
    let scored = 0
    const BATCH = 100
    
    for (let i = 0; i < leads.length; i += BATCH) {
      const batch = leads.slice(i, i + BATCH)
      const updates = batch.map(lead => {
        const result = scoreLead(lead)
        // Merge auto_tags with existing tags
        const existingTags = lead.tags ? String(lead.tags).split(",").map((t: string) => t.trim()).filter(Boolean) : []
        const mergedTags = [...new Set([...existingTags, ...result.auto_tags])].join(",")
        return {
          lead_id: lead.lead_id,
          total_score: String(result.total_score),
          ranking_tier: result.ranking_tier,
          tags: mergedTags,
        }
      })
      
      for (const update of updates) {
        await supabase.from("leads").update({
          total_score: update.total_score,
          ranking_tier: update.ranking_tier,
          tags: update.tags,
        }).eq("lead_id", update.lead_id)
        scored++
      }
    }
    
    // 🔄 Auto-assign sequences to newly scored leads that aren't in one yet
    // Tier A/B → "ig-fb" (multi-platform), Tier C → "ig-only", Tier D/X → no sequence
    const leadsToAssign = leads.filter(l => !l.sequence_id || l.status === "new")
    if (leadsToAssign.length > 0) {
      for (const lead of leadsToAssign) {
        const result = scoreLead(lead)
        let seqId = ""
        let status = "new"
        if (result.ranking_tier === "X") continue // skip competitors
        if (result.ranking_tier === "A" || result.ranking_tier === "B") {
          seqId = lead.facebook_url ? "ig-fb" : (lead.linkedin_url ? "ig-li" : "ig-only")
          status = "in_sequence"
        } else if (result.ranking_tier === "C") {
          seqId = "ig-only"
          status = "in_sequence"
        }
        // Tier D = leave unassigned for manual review
        if (seqId) {
          await supabase.from("leads").update({
            sequence_id: seqId,
            status,
            current_step: "1",
          }).eq("lead_id", lead.lead_id)
        }
      }
    }

    return NextResponse.json({ success: true, scored, total: leads.length, assigned: leadsToAssign.length })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
