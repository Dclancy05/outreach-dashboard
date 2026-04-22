import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type TimelineEntry = {
  timestamp: string
  source: "send_log" | "automation_runs"
  action: string
  status: string
  target: string | null
  error: string | null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get("account_id")
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200)

  if (!accountId) return NextResponse.json({ error: "account_id required" }, { status: 400 })

  // send_log
  const { data: sends } = await supabase
    .from("send_log")
    .select("id, lead_id, platform, status, error_message, sent_at, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit)

  // automation_runs
  const { data: runs } = await supabase
    .from("automation_runs")
    .select("id, automation_id, lead_id, status, error_message, started_at")
    .eq("account_id", accountId)
    .order("started_at", { ascending: false })
    .limit(limit)

  // Lead name lookup
  const leadIds = Array.from(new Set([
    ...(sends || []).map(s => s.lead_id).filter(Boolean),
    ...(runs || []).map(r => r.lead_id).filter(Boolean),
  ])) as string[]

  let leadMap: Record<string, string> = {}
  if (leadIds.length > 0) {
    const { data: leads } = await supabase
      .from("leads")
      .select("lead_id, name")
      .in("lead_id", leadIds)
    leadMap = Object.fromEntries((leads || []).map(l => [l.lead_id, l.name || l.lead_id]))
  }

  const timeline: TimelineEntry[] = []
  for (const s of sends || []) {
    timeline.push({
      timestamp: s.created_at || s.sent_at,
      source: "send_log",
      action: `${s.platform} DM`,
      status: s.status || "unknown",
      target: s.lead_id ? (leadMap[s.lead_id] || s.lead_id) : null,
      error: s.error_message || null,
    })
  }
  for (const r of runs || []) {
    timeline.push({
      timestamp: r.started_at,
      source: "automation_runs",
      action: `automation ${r.automation_id?.slice(0, 8) || "?"}`,
      status: r.status || "unknown",
      target: r.lead_id ? (leadMap[r.lead_id] || r.lead_id) : null,
      error: r.error_message || null,
    })
  }

  timeline.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))

  return NextResponse.json({ data: timeline.slice(0, limit) })
}
