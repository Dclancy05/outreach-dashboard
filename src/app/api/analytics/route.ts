import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const businessId = searchParams.get("business_id")

  // Get leads by status for funnel
  const statusCounts: Record<string, number> = {}
  const statuses = ["new", "in_sequence", "responded", "booked", "closed", "completed"]
  for (const s of statuses) {
    let q = supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", s)
    if (businessId) q = q.eq("business_id", businessId)
    const { count } = await q
    statusCounts[s] = count || 0
  }

  // Total leads
  let totalQ = supabase.from("leads").select("*", { count: "exact", head: true })
  if (businessId) totalQ = totalQ.eq("business_id", businessId)
  const { count: totalLeads } = await totalQ

  // Messages sent today
  const today = new Date().toISOString().split("T")[0]
  let todayQ = supabase.from("outreach_log").select("*").gte("sent_at", `${today}T00:00:00`).eq("status", "sent")
  if (businessId) todayQ = todayQ.eq("business_id", businessId)
  const { data: todayLogs } = await todayQ

  // Platform breakdown
  const platformBreakdown: Record<string, { sent: number; responded: number }> = {}
  for (const log of todayLogs || []) {
    const p = log.platform || "unknown"
    if (!platformBreakdown[p]) platformBreakdown[p] = { sent: 0, responded: 0 }
    platformBreakdown[p].sent++
  }

  // Get businesses with lead counts for comparison
  const { data: businesses } = await supabase.from("businesses").select("id, name, color").eq("status", "active")
  const bizStats = await Promise.all(
    (businesses || []).map(async (b) => {
      const { count: leads } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("business_id", b.id)
      const { count: responded } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("business_id", b.id).eq("status", "responded")
      return { ...b, leads: leads || 0, responded: responded || 0 }
    })
  )

  return NextResponse.json({
    data: {
      funnel: statusCounts,
      total_leads: totalLeads || 0,
      today_sends: (todayLogs || []).length,
      platform_breakdown: platformBreakdown,
      business_stats: bizStats,
    },
  })
}
