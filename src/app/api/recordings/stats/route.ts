import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const today = new Date().toISOString().split("T")[0]

  const [dms, follows, errors] = await Promise.all([
    supabase.from("send_log").select("id", { count: "exact", head: true })
      .gte("created_at", today).in("status", ["sent", "delivered"]),
    supabase.from("send_log").select("id", { count: "exact", head: true })
      .gte("created_at", today).eq("status", "sent").ilike("error_message", "%follow%"),
    supabase.from("send_log").select("id", { count: "exact", head: true })
      .gte("created_at", today).eq("status", "error"),
  ])

  return NextResponse.json({
    dmsSent: dms.count || 0,
    follows: follows.count || 0,
    errors: errors.count || 0,
  })
}
