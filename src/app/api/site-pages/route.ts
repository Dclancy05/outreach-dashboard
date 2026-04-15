import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const { data: pages, error } = await supabase
    .from("site_pages")
    .select("*")
    .order("url_path", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get recommendations and variants for all pages
  const pageIds = (pages || []).map((p: { id: string }) => p.id)
  let recommendations: unknown[] = []
  let variants: unknown[] = []
  if (pageIds.length > 0) {
    const { data: recs } = await supabase.from("page_recommendations").select("*").in("page_id", pageIds).order("severity", { ascending: true })
    recommendations = recs || []
    const { data: vars } = await supabase.from("landing_page_variants").select("*").in("page_id", pageIds).order("created_at", { ascending: false })
    variants = vars || []
  }

  return NextResponse.json({ data: pages, recommendations, variants })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  // Site page CRUD
  if (action === "create_page") {
    const { data, error } = await supabase.from("site_pages").insert({
      url_path: body.url_path,
      title: body.title,
      meta_description: body.meta_description || null,
      seo_score: body.seo_score || null,
      has_email_capture: body.has_email_capture || false,
      has_cta: body.has_cta || false,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === "update_page") {
    const updates: Record<string, unknown> = {}
    for (const f of ["url_path", "title", "meta_description", "seo_score", "has_email_capture", "has_cta", "last_audited"]) {
      if (body[f] !== undefined) updates[f] = body[f]
    }
    const { data, error } = await supabase.from("site_pages").update(updates).eq("id", body.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // Recommendation actions
  if (action === "update_recommendation") {
    const { data, error } = await supabase.from("page_recommendations").update({ status: body.status }).eq("id", body.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === "create_recommendation") {
    const { data, error } = await supabase.from("page_recommendations").insert({
      page_id: body.page_id,
      recommendation_type: body.recommendation_type,
      severity: body.severity || "medium",
      title: body.title,
      description: body.description,
      current_value: body.current_value || null,
      suggested_value: body.suggested_value || null,
      section_selector: body.section_selector || null,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // Variant actions
  if (action === "update_variant") {
    const updates: Record<string, unknown> = {}
    for (const f of ["variant_label", "changes_description", "traffic_percentage", "visits", "conversions", "is_active"]) {
      if (body[f] !== undefined) updates[f] = body[f]
    }
    const { data, error } = await supabase.from("landing_page_variants").update(updates).eq("id", body.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
