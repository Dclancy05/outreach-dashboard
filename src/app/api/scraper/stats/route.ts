import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const [
    { count: totalJobs },
    { count: runningJobs },
    { count: completedJobs },
    { count: totalScraped },
    { count: totalDuplicates },
    { count: totalMoved },
  ] = await Promise.all([
    supabase.from("scrape_jobs").select("*", { count: "exact", head: true }),
    supabase.from("scrape_jobs").select("*", { count: "exact", head: true }).eq("status", "running"),
    supabase.from("scrape_jobs").select("*", { count: "exact", head: true }).eq("status", "completed"),
    supabase.from("scraped_leads").select("*", { count: "exact", head: true }),
    supabase.from("scraped_leads").select("*", { count: "exact", head: true }).eq("is_duplicate", true),
    supabase.from("lead_moves").select("*", { count: "exact", head: true }),
  ])

  // Average quality score
  const { data: avgData } = await supabase.from("scraped_leads").select("quality_score").eq("is_duplicate", false)
  const scores = (avgData || []).map(r => r.quality_score)
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0

  // Recent jobs
  const { data: recentJobs } = await supabase
    .from("scrape_jobs")
    .select("id, name, status, total_found, progress_pct, created_at")
    .order("created_at", { ascending: false })
    .limit(5)

  // By business
  const { data: jobsByBiz } = await supabase.from("scrape_jobs").select("business_id, status")
  const bizStats: Record<string, { total: number; completed: number }> = {}
  for (const j of jobsByBiz || []) {
    const biz = j.business_id || "default"
    if (!bizStats[biz]) bizStats[biz] = { total: 0, completed: 0 }
    bizStats[biz].total++
    if (j.status === "completed") bizStats[biz].completed++
  }

  return NextResponse.json({
    total_jobs: totalJobs || 0,
    running_jobs: runningJobs || 0,
    completed_jobs: completedJobs || 0,
    total_scraped: totalScraped || 0,
    unique_leads: (totalScraped || 0) - (totalDuplicates || 0),
    total_duplicates: totalDuplicates || 0,
    total_moved: totalMoved || 0,
    avg_quality_score: avgScore,
    recent_jobs: recentJobs || [],
    by_business: bizStats,
  })
}
