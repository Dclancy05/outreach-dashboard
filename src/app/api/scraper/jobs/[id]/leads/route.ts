import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params
  const { searchParams } = new URL(req.url)

  const page = parseInt(searchParams.get("page") || "1")
  const pageSize = parseInt(searchParams.get("pageSize") || "50")
  const search = searchParams.get("search") || ""
  const minScore = searchParams.get("minScore")
  const maxScore = searchParams.get("maxScore")
  const enrichmentStatus = searchParams.get("enrichment")
  const hideDuplicates = searchParams.get("hideDuplicates") !== "false"
  const sortField = searchParams.get("sort") || "quality_score"
  const sortDir = searchParams.get("dir") || "desc"
  const city = searchParams.get("city")
  const state = searchParams.get("state")

  let query = supabase
    .from("scraped_leads")
    .select("*", { count: "exact" })
    .eq("scrape_job_id", id)

  if (hideDuplicates) query = query.eq("is_duplicate", false)
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,city.ilike.%${search}%`)
  if (minScore) query = query.gte("quality_score", parseInt(minScore))
  if (maxScore) query = query.lte("quality_score", parseInt(maxScore))
  if (enrichmentStatus) query = query.eq("enrichment_status", enrichmentStatus)
  if (city) query = query.ilike("city", `%${city}%`)
  if (state) query = query.ilike("state", `%${state}%`)

  query = query.order(sortField, { ascending: sortDir === "asc" })

  const from = (page - 1) * pageSize
  query = query.range(from, from + pageSize - 1)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data,
    count: count || 0,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize),
  })
}
