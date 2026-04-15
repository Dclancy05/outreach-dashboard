import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Quality score calculation
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
  // Multiple contact methods bonus
  const contacts = [lead.phone, lead.email, lead.instagram_url, lead.facebook_url, lead.linkedin_url].filter(Boolean).length
  if (contacts >= 3) score += 10
  return Math.min(score, 100)
}

// City size estimation for cost estimation
function estimateCitySize(location: string): "small" | "medium" | "large" {
  const large = ["new york", "los angeles", "chicago", "houston", "phoenix", "philadelphia", "san antonio", "san diego", "dallas", "san jose", "austin", "jacksonville", "san francisco", "columbus", "charlotte", "indianapolis", "seattle", "denver", "washington", "nashville", "miami", "atlanta", "boston"]
  const loc = location.toLowerCase()
  if (large.some(c => loc.includes(c))) return "large"
  // Medium if it mentions "city" or state abbreviation patterns
  return "medium"
}

function estimateCosts(location: string, depth: string) {
  const size = estimateCitySize(location)
  const leadEstimates = { small: 500, medium: 2000, large: 10000 }
  const ratesPerHour = { basic: 200, enhanced: 100, full: 50 }
  const mbPerLead = { basic: 0.5, enhanced: 2, full: 5 }

  const estLeads = leadEstimates[size]
  const rate = ratesPerHour[depth as keyof typeof ratesPerHour] || 200
  const mb = mbPerLead[depth as keyof typeof mbPerLead] || 0.5

  return {
    estimated_leads: estLeads,
    estimated_time_minutes: Math.ceil((estLeads / rate) * 60),
    estimated_proxy_mb: Math.round(estLeads * mb * 100) / 100,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")
  const limit = parseInt(searchParams.get("limit") || "50")
  const offset = parseInt(searchParams.get("offset") || "0")

  let query = supabase
    .from("scrape_jobs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq("status", status)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data, count, limit, offset })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, search_query, location, depth_level, scheduled_at, business_id } = body

  if (!name || !search_query || !location) {
    return NextResponse.json({ error: "name, search_query, and location are required" }, { status: 400 })
  }

  const depth = depth_level || "basic"
  const estimates = estimateCosts(location, depth)

  const row = {
    name,
    search_query,
    location,
    depth_level: depth,
    status: scheduled_at ? "scheduled" : "pending",
    scheduled_at: scheduled_at || null,
    estimated_time_minutes: estimates.estimated_time_minutes,
    estimated_proxy_mb: estimates.estimated_proxy_mb,
    business_id: business_id || null,
  }

  const { data, error } = await supabase.from("scrape_jobs").insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data,
    estimates: {
      ...estimates,
      estimated_leads: estimates.estimated_leads,
      depth_level: depth,
    },
  })
}

// Export for use by other modules (not a route export)
// import { calculateQualityScore } from './route' in other files if needed
