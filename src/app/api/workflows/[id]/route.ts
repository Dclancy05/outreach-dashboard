// /api/workflows/[id] — GET, PATCH, DELETE.
// PATCH is the autosave path used by the visual builder (every 2s when graph
// is dirty). It validates the graph and stores it as a single jsonb blob.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { validateGraph, type WorkflowGraph } from "@/lib/workflow/graph"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const { data, error } = await supabase.from("workflows").select("*").eq("id", id).single()
  if (error || !data) return NextResponse.json({ error: error?.message || "not found" }, { status: 404 })
  return NextResponse.json({ data })
}

const PATCHABLE = new Set([
  "name", "description", "emoji", "graph", "entry_node_id",
  "status", "budget_usd", "max_steps", "max_loop_iters",
])

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const k of Object.keys(body)) if (PATCHABLE.has(k)) patch[k] = body[k]
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no patchable fields" }, { status: 400 })
  }

  if (patch.graph) {
    const issues = validateGraph(patch.graph as WorkflowGraph)
    const errors = issues.filter(i => i.level === "error")
    if (errors.length > 0 && body.allow_invalid !== true) {
      // We still autosave with errors so the user doesn't lose work, but mark
      // status='draft' and surface issues so they can't activate.
      patch.status = "draft"
    }
  }

  const { data, error } = await supabase.from("workflows").update(patch).eq("id", id).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  await supabase.from("workflows").update({ status: "archived" }).eq("id", id)
  return NextResponse.json({ ok: true })
}
