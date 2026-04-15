import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { lead_ids, job_id, filters } = body

  let query = supabase.from("scraped_leads").select("*").eq("is_duplicate", false)

  if (lead_ids?.length) {
    query = query.in("id", lead_ids)
  } else if (job_id) {
    query = query.eq("scrape_job_id", job_id)
  }

  if (filters?.minScore) query = query.gte("quality_score", filters.minScore)
  if (filters?.city) query = query.ilike("city", `%${filters.city}%`)
  if (filters?.state) query = query.ilike("state", `%${filters.state}%`)

  const { data, error } = await query.order("quality_score", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: "No leads to export" }, { status: 404 })

  const headers = [
    "name", "address", "city", "state", "zip", "phone", "email", "website",
    "rating", "review_count", "category", "business_type",
    "instagram_url", "facebook_url", "linkedin_url",
    "ig_followers", "ig_bio", "fb_page_likes",
    "quality_score", "enrichment_status",
  ]

  const escapeCSV = (val: unknown) => {
    const s = String(val ?? "")
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s
  }

  const csvLines = [headers.join(",")]
  for (const row of data) {
    csvLines.push(headers.map(h => escapeCSV((row as Record<string, unknown>)[h])).join(","))
  }

  return new NextResponse(csvLines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="scraped-leads-${Date.now()}.csv"`,
    },
  })
}
