import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === "create") {
    const { data, error } = await supabase.from("blog_posts").insert({
      title: body.title,
      slug: body.slug,
      content_markdown: body.content_markdown || "",
      meta_description: body.meta_description || "",
      target_keywords: body.target_keywords || [],
      featured_image_url: body.featured_image_url || null,
      estimated_read_time: body.estimated_read_time || 5,
      status: body.status || "draft",
      seo_score: body.seo_score || null,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === "update") {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const fields = ["title", "slug", "content_markdown", "meta_description", "target_keywords", "featured_image_url", "estimated_read_time", "status", "feedback", "seo_score", "published_at"]
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f]
    }
    if (body.status === "published" && !body.published_at) {
      updates.published_at = new Date().toISOString()
    }
    const { data, error } = await supabase.from("blog_posts").update(updates).eq("id", body.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === "delete") {
    const { error } = await supabase.from("blog_posts").delete().eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "create_idea") {
    const { data, error } = await supabase.from("blog_ideas").insert({
      idea_text: body.idea_text,
      reference_url: body.reference_url || null,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === "list_ideas") {
    const { data, error } = await supabase.from("blog_ideas").select("*").order("created_at", { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === "update_idea") {
    const { data, error } = await supabase.from("blog_ideas").update({ status: body.status }).eq("id", body.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
