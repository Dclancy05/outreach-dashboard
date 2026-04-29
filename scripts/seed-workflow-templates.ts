/**
 * Workflow-template seeder.
 *
 * Reads the registry at src/lib/workflows/templates.ts and upserts each entry
 * into the `workflows` table by stable id. Re-runnable; on conflict the row's
 * graph/description/budget is updated to match the source (so editing a JSON
 * file + re-running this script is the canonical "edit a template" flow).
 *
 * Usage:
 *   npx tsx scripts/seed-workflow-templates.ts
 *
 * Env required (from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (or NEXT_PUBLIC_SUPABASE_ANON_KEY as fallback)
 */

import path from "path"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"

// Load env BEFORE importing anything that touches process.env.
dotenv.config({ path: path.join(__dirname, "../.env.local") })

import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "../src/lib/workflows/templates"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

interface SeedReport {
  id: string
  name: string
  action: "inserted" | "updated" | "unchanged" | "error"
  error?: string
}

async function upsertTemplate(tpl: WorkflowTemplate): Promise<SeedReport> {
  // Was this id already on the table? Determines insert vs update reporting.
  const { data: existing, error: lookupErr } = await supabase
    .from("workflows")
    .select("id, name")
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

  return {
    id: tpl.id,
    name: tpl.name,
    action: existing ? "updated" : "inserted",
  }
}

async function main() {
  console.log(
    `[seed:workflows] Upserting ${WORKFLOW_TEMPLATES.length} template${
      WORKFLOW_TEMPLATES.length === 1 ? "" : "s"
    } into workflows table…`,
  )

  const reports: SeedReport[] = []
  for (const tpl of WORKFLOW_TEMPLATES) {
    const r = await upsertTemplate(tpl)
    reports.push(r)
    const symbol =
      r.action === "inserted" ? "+" : r.action === "updated" ? "~" : r.action === "error" ? "x" : "="
    const tail = r.error ? `  (${r.error})` : ""
    console.log(`  ${symbol} ${r.action.padEnd(9)} ${r.id}  ${r.name}${tail}`)
  }

  const errors = reports.filter((r) => r.action === "error")
  console.log(
    `[seed:workflows] Done — ${reports.length - errors.length}/${reports.length} ok, ${errors.length} error(s).`,
  )
  if (errors.length > 0) process.exit(1)
}

main().catch((err) => {
  console.error("[seed:workflows] Unhandled error:", err)
  process.exit(1)
})
