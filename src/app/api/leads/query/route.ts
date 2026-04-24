import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/leads/query
 *
 * Body:
 *   filter?:    string    — tag/business_type/name OR match (ilike)
 *   status?:    string    — exact status filter, or "all"
 *   limit?:     number    — default 2000
 *   fields?:    string    — columns to select (default: short outreach subset)
 *
 * Returns: { data: Lead[], count: number }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const filter = typeof body.filter === "string" ? body.filter.trim() : ""
  const status = typeof body.status === "string" ? body.status : ""
  const limit = Number.isFinite(body.limit) ? Math.min(5000, Number(body.limit)) : 2000
  const fields = typeof body.fields === "string" && body.fields.length > 0
    ? body.fields
    : "lead_id, name, business_type, instagram_url, facebook_url, linkedin_url, email, phone, status, tags"

  let query = supabase.from("leads").select(fields, { count: "exact" })

  if (filter) {
    query = query.or(
      `tags.ilike.%${filter}%,business_type.ilike.%${filter}%,name.ilike.%${filter}%`
    )
  }
  if (status && status !== "all") {
    query = query.eq("status", status)
  }
  query = query.limit(limit)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, count: count || 0 })
}
