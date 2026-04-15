import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params
  const body = await req.json().catch(() => ({}))

  const { data: job, error: fetchError } = await supabase
    .from("scrape_jobs")
    .select("*")
    .eq("id", id)
    .single()

  if (fetchError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  if (job.status === "running") {
    return NextResponse.json({ error: "Job is already running" }, { status: 400 })
  }

  // If schedule_at provided, schedule instead of starting immediately
  if (body.scheduled_at) {
    const { data, error } = await supabase
      .from("scrape_jobs")
      .update({ status: "scheduled", scheduled_at: body.scheduled_at })
      .eq("id", id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data, message: `Job scheduled for ${body.scheduled_at}` })
  }

  // Start immediately
  const { data, error } = await supabase
    .from("scrape_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data, message: "Job started" })
}
