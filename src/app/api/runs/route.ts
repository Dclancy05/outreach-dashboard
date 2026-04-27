// /api/runs — list workflow runs, joined with workflow name + emoji.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const workflowId = sp.get("workflow_id")
  const status = sp.get("status")
  const limit = Math.min(parseInt(sp.get("limit") || "50", 10), 200)

  let q = supabase
    .from("workflow_runs")
    .select("*, workflows!inner(name, emoji)")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (workflowId) q = q.eq("workflow_id", workflowId)
  if (status) q = q.eq("status", status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const flat = (data || []).map(r => {
    const wf = (r as { workflows?: { name?: string; emoji?: string | null } }).workflows
    return { ...r, workflow_name: wf?.name, workflow_emoji: wf?.emoji ?? null, workflows: undefined }
  })
  return NextResponse.json({ data: flat })
}
