import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params

  const { data: job, error } = await supabase.from("scrape_jobs").select("*").eq("id", id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  // Get lead stats for this job
  const [
    { count: totalLeads },
    { count: duplicates },
    { count: enriched },
  ] = await Promise.all([
    supabase.from("scraped_leads").select("*", { count: "exact", head: true }).eq("scrape_job_id", id),
    supabase.from("scraped_leads").select("*", { count: "exact", head: true }).eq("scrape_job_id", id).eq("is_duplicate", true),
    supabase.from("scraped_leads").select("*", { count: "exact", head: true }).eq("scrape_job_id", id).neq("enrichment_status", "none"),
  ])

  // Quality score distribution
  const { data: qualityData } = await supabase
    .from("scraped_leads")
    .select("quality_score")
    .eq("scrape_job_id", id)
    .eq("is_duplicate", false)

  const qualityBuckets = { excellent: 0, good: 0, fair: 0, poor: 0 }
  for (const row of qualityData || []) {
    if (row.quality_score >= 80) qualityBuckets.excellent++
    else if (row.quality_score >= 60) qualityBuckets.good++
    else if (row.quality_score >= 40) qualityBuckets.fair++
    else qualityBuckets.poor++
  }

  return NextResponse.json({
    data: job,
    stats: {
      total_leads: totalLeads || 0,
      duplicates: duplicates || 0,
      unique_leads: (totalLeads || 0) - (duplicates || 0),
      enriched: enriched || 0,
      quality_distribution: qualityBuckets,
    },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params
  const body = await req.json()

  const allowed = ["status", "error_message", "total_found", "total_enriched", "total_failed", "progress_pct", "grid_zones_total", "grid_zones_completed"]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  // Auto-set timestamps based on status changes
  if (body.status === "running") updates.started_at = new Date().toISOString()
  if (body.status === "completed" || body.status === "failed") updates.completed_at = new Date().toISOString()

  const { data, error } = await supabase.from("scrape_jobs").update(updates).eq("id", id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params

  // Cascade delete handles scraped_leads
  const { error } = await supabase.from("scrape_jobs").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ message: `Job ${id} deleted` })
}
