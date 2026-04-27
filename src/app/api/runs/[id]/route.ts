// /api/runs/[id] — single run.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("*, workflows!inner(name, emoji, graph)")
    .eq("id", id)
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message || "not found" }, { status: 404 })
  const wf = (data as { workflows?: { name?: string; emoji?: string | null; graph?: unknown } }).workflows
  return NextResponse.json({ data: { ...data, workflow_name: wf?.name, workflow_emoji: wf?.emoji ?? null, workflow_graph: wf?.graph, workflows: undefined } })
}
