import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const dynamic = "force-dynamic"

// Fields the enrichment pickers expose. The worker (run separately) looks at
// this list to decide what to scrape per lead. New fields can be added here
// without a migration — `fields` is a text[] column.
const ALLOWED_FIELDS = new Set([
  "followers",
  "following",
  "posts",
  "bio",
  "profile_pic_url",
  "external_url",
  "is_verified",
  "is_private",
  "category",
])

/**
 * POST /api/leads/enrich
 *
 * Body:
 *   {
 *     scope: "selected" | "missing",
 *     lead_ids?: string[],          // required if scope=selected
 *     fields: string[],             // subset of ALLOWED_FIELDS
 *     automation_id?: string        // a lead_enrichment-tagged automation
 *   }
 *
 * INSERTs a row into `lead_enrichment_jobs` with status='queued'. The actual
 * enrichment worker (separate workstream) picks up queued jobs.
 */
export async function POST(req: NextRequest) {
  let body: {
    scope?: string
    lead_ids?: string[]
    fields?: string[]
    automation_id?: string
  } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { scope, lead_ids, fields, automation_id } = body

  if (scope !== "selected" && scope !== "missing") {
    return NextResponse.json({ error: "scope must be 'selected' or 'missing'" }, { status: 400 })
  }

  if (!Array.isArray(fields) || fields.length === 0) {
    return NextResponse.json({ error: "fields must be a non-empty array" }, { status: 400 })
  }

  const cleanFields = fields.filter(f => typeof f === "string" && ALLOWED_FIELDS.has(f))
  if (cleanFields.length === 0) {
    return NextResponse.json({ error: "no valid fields in request" }, { status: 400 })
  }

  let cleanLeadIds: string[] | null = null
  if (scope === "selected") {
    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json({ error: "lead_ids required when scope='selected'" }, { status: 400 })
    }
    cleanLeadIds = lead_ids.filter(id => typeof id === "string" && id.length > 0)
    if (cleanLeadIds.length === 0) {
      return NextResponse.json({ error: "no valid lead_ids in request" }, { status: 400 })
    }
  }

  // automation_id is optional — the worker can fall back to the most-recent
  // `lead_enrichment`-tagged automation for the same platform if omitted.
  const insertRow = {
    scope,
    lead_ids: cleanLeadIds, // null when scope='missing'
    fields: cleanFields,
    automation_id: automation_id || null,
    status: "queued" as const,
  }

  const { data, error } = await supabase
    .from("lead_enrichment_jobs")
    .insert(insertRow)
    .select("id, scope, status, created_at")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    job_id: data.id,
    scope: data.scope,
    status: data.status,
    created_at: data.created_at,
  })
}

/**
 * GET /api/leads/enrich
 *
 * Returns the 50 most-recent enrichment jobs so the UI can show a status tray
 * later. For now it's wired so we can verify jobs landed from the dashboard
 * without hitting the DB directly.
 */
export async function GET(_req: NextRequest) {
  const { data, error } = await supabase
    .from("lead_enrichment_jobs")
    .select("id, scope, lead_ids, fields, automation_id, status, created_at, started_at, finished_at, error")
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message, data: [] }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}
