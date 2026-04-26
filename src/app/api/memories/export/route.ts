import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Build a single JSON file (zip would need a node lib like jszip; JSON is lossless and easy to reimport)
export async function POST(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("business_id") || null
  let mq = supabase.from("memories").select("*")
  let pq = supabase.from("memory_personas").select("*")
  if (businessId && businessId !== "all") {
    mq = mq.or(`business_id.eq.${businessId},business_id.is.null`)
    pq = pq.or(`business_id.eq.${businessId},business_id.is.null`)
  }
  const [{ data: memories }, { data: personas }] = await Promise.all([mq, pq])
  const payload = {
    exported_at: new Date().toISOString(),
    business_id: businessId,
    counts: { memories: (memories || []).length, personas: (personas || []).length },
    memories: memories || [],
    personas: personas || [],
  }
  const filename = `memory-pack-${new Date().toISOString().slice(0, 10)}.json`
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
