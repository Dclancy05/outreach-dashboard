import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(500, Number(searchParams.get("limit")) || 100)
  const action = searchParams.get("action") || ""
  const resource = searchParams.get("resource") || ""
  const since = searchParams.get("since") || ""
  const before = searchParams.get("before") || ""

  let query = supabase
    .from("audit_log")
    .select("id, user_id, action, resource, payload, ip, ua, ts")
    .order("ts", { ascending: false })
    .limit(limit)

  if (action) query = query.eq("action", action)
  if (resource) query = query.eq("resource", resource)
  if (since) query = query.gte("ts", since)
  if (before) query = query.lt("ts", before)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message, rows: [], facets: { actions: [], resources: [] } }, { status: 200 })
  }

  // Facet counts (for filter dropdowns) — last 7 days only to keep it fast
  const since7d = new Date(Date.now() - 7 * 86400_000).toISOString()
  const { data: facets } = await supabase
    .from("audit_log")
    .select("action, resource")
    .gte("ts", since7d)
    .limit(2000)

  const actionCounts = new Map<string, number>()
  const resourceCounts = new Map<string, number>()
  for (const row of facets || []) {
    if (row.action) actionCounts.set(row.action, (actionCounts.get(row.action) || 0) + 1)
    if (row.resource) resourceCounts.set(row.resource, (resourceCounts.get(row.resource) || 0) + 1)
  }
  const sortByCountDesc = (a: [string, number], b: [string, number]) => b[1] - a[1]

  return NextResponse.json({
    rows: data || [],
    facets: {
      actions: [...actionCounts.entries()].sort(sortByCountDesc).map(([name, count]) => ({ name, count })),
      resources: [...resourceCounts.entries()].sort(sortByCountDesc).map(([name, count]) => ({ name, count })),
    },
  })
}
