import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const dynamic = "force-dynamic"

/**
 * GET /api/automations/export  — P9.5
 *
 * Dumps every row from `automations` as a JSON payload the user can save +
 * later re-import on a different instance. We strip the DB-assigned id from
 * each row so re-imports create fresh rows instead of colliding on PK.
 *
 * Query params:
 *   ids=a,b,c     — export only these automations (defaults to all)
 *
 * Returned shape:
 *   { version: "1", exported_at, automations: [...] }
 */
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids")
  const ids = idsParam ? idsParam.split(",").map(s => s.trim()).filter(Boolean) : null

  let query = supabase
    .from("automations")
    .select("id, name, platform, status, tag, description, steps, health_score")
    .order("updated_at", { ascending: false })

  if (ids && ids.length) query = query.in("id", ids)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const payload = {
    version: "1",
    exported_at: new Date().toISOString(),
    count: data?.length || 0,
    automations: (data || []).map(row => ({
      // Intentionally drop row.id so re-imports create fresh rows.
      name: row.name,
      platform: row.platform,
      status: row.status,
      tag: row.tag,
      description: row.description,
      steps: row.steps,
      health_score: row.health_score,
      exported_from_id: row.id,
    })),
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="automations-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}
