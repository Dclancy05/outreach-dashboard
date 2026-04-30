/**
 * One-click workflow seeder.
 *
 * Upserts every WORKFLOW_TEMPLATES entry into the `workflows` table. Same
 * logic as scripts/seed-workflow-templates.ts but callable from the dashboard
 * so Dylan doesn't need to open a terminal.
 *
 * Auth: PIN-gated by middleware.
 *
 * Returns a per-row report: inserted | updated | error.
 */
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "@/lib/workflows/templates"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

interface SeedReport {
  id: string
  name: string
  action: "inserted" | "updated" | "error"
  error?: string
}

async function upsertOne(tpl: WorkflowTemplate): Promise<SeedReport> {
  const { data: existing, error: lookupErr } = await supabase
    .from("workflows")
    .select("id")
    .eq("id", tpl.id)
    .maybeSingle()

  if (lookupErr) {
    return { id: tpl.id, name: tpl.name, action: "error", error: lookupErr.message }
  }

  const row = {
    id: tpl.id,
    name: tpl.name,
    description: tpl.description,
    emoji: tpl.emoji ?? null,
    graph: tpl.graph,
    entry_node_id: tpl.entry_node_id,
    status: tpl.status,
    is_template: tpl.is_template,
    budget_usd: tpl.budget_usd,
    max_steps: tpl.max_steps,
    max_loop_iters: tpl.max_loop_iters,
  }

  const { error: upsertErr } = await supabase
    .from("workflows")
    .upsert(row, { onConflict: "id" })

  if (upsertErr) {
    return { id: tpl.id, name: tpl.name, action: "error", error: upsertErr.message }
  }
  return { id: tpl.id, name: tpl.name, action: existing ? "updated" : "inserted" }
}

export async function POST(): Promise<NextResponse> {
  const reports: SeedReport[] = []
  for (const tpl of WORKFLOW_TEMPLATES) {
    reports.push(await upsertOne(tpl))
  }
  const errors = reports.filter((r) => r.action === "error")
  return NextResponse.json({
    ok: errors.length === 0,
    total: reports.length,
    inserted: reports.filter((r) => r.action === "inserted").length,
    updated: reports.filter((r) => r.action === "updated").length,
    errors: errors.length,
    reports,
  })
}
