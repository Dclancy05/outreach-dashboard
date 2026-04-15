import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const niche = searchParams.get("niche")
  const borough = searchParams.get("borough")
  const status = searchParams.get("status")
  const pageType = searchParams.get("page_type")

  let query = supabase.from("niche_pages").select("*").order("created_at", { ascending: false })

  if (niche && niche !== "all") query = query.eq("niche", niche)
  if (borough && borough !== "all") query = query.eq("borough", borough)
  if (status && status !== "all") query = query.eq("status", status)
  if (pageType && pageType !== "all") query = query.eq("page_type", pageType)

  const { data, error } = await query
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data, count: (data || []).length })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  switch (action) {
    case "create": {
      const { niche, borough, page_type, service, title, slug, meta_description, content_html, target_keywords, has_faq_schema, has_local_schema, internal_links, seo_score } = body
      const { data, error } = await supabase.from("niche_pages").insert({
        niche, borough, page_type, service, title, slug, meta_description, content_html,
        target_keywords, has_faq_schema, has_local_schema, internal_links, seo_score,
        status: "pending_review",
      }).select().single()
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, data })
    }

    case "update": {
      const { id, ...updates } = body
      delete updates.action
      if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 })
      updates.updated_at = new Date().toISOString()
      const { error } = await supabase.from("niche_pages").update(updates).eq("id", id)
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, message: "Updated" })
    }

    case "delete": {
      const { id } = body
      if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 })
      const { error } = await supabase.from("niche_pages").delete().eq("id", id)
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, message: "Deleted" })
    }

    case "approve": {
      const { id } = body
      if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 })
      const { error } = await supabase.from("niche_pages").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", id)
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, message: "Approved" })
    }

    case "publish": {
      const { id } = body
      if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 })
      const { error } = await supabase.from("niche_pages").update({ status: "published", updated_at: new Date().toISOString() }).eq("id", id)
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, message: "Published" })
    }

    case "reject": {
      const { id, feedback } = body
      if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 })
      const { error } = await supabase.from("niche_pages").update({ status: "rejected", feedback, updated_at: new Date().toISOString() }).eq("id", id)
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, message: "Rejected" })
    }

    default:
      return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 })
  }
}
