// POST /api/agents/[id]/test — fire a one-shot run of a single agent.
// Useful for the "Test agent" button in the Agents subtab. Creates a
// workflow_run with trigger='test' and a synthetic single-node graph, then
// fires the Inngest event so the runner picks it up.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { inngest, EVENT_RUN_QUEUED } from "@/lib/inngest/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { prompt?: string; vars?: Record<string, unknown> }
  const prompt = body.prompt?.trim()
  if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 })

  const { data: agent, error: agentErr } = await supabase
    .from("agents").select("id, slug, name").eq("id", id).single()
  if (agentErr || !agent) return NextResponse.json({ error: "agent not found" }, { status: 404 })

  // Create a one-shot workflow on the fly (not persisted as a real workflow,
  // but we need a workflow_id). Use a stable "test harness" workflow id so all
  // ad-hoc tests roll up under it in the Runs view.
  const HARNESS_ID = "00000000-0000-4000-a000-00000000000f"
  await supabase.from("workflows").upsert({
    id: HARNESS_ID,
    name: "Agent test harness",
    description: "Synthetic single-node workflow used by /api/agents/[id]/test.",
    emoji: "🧪",
    is_template: false,
    status: "active",
    budget_usd: 1.0000,
    max_steps: 5,
    max_loop_iters: 1,
    graph: {
      nodes: [
        { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Start" } },
        { id: "agent",   type: "agent",   position: { x: 200, y: 0 }, data: { label: agent.name, agent_slug: agent.slug, prompt: "{{__test_prompt}}", output_var: "result" } },
        { id: "output",  type: "output",  position: { x: 400, y: 0 }, data: { label: "Done" } },
      ],
      edges: [
        { id: "e1", source: "trigger", target: "agent" },
        { id: "e2", source: "agent",   target: "output" },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    entry_node_id: "trigger",
  }, { onConflict: "id" })

  const { data: run, error: runErr } = await supabase.from("workflow_runs").insert({
    workflow_id: HARNESS_ID,
    trigger: "test",
    status: "queued",
    input: { __test_prompt: prompt, ...(body.vars || {}) },
  }).select("id").single()
  if (runErr || !run) return NextResponse.json({ error: runErr?.message || "failed to queue" }, { status: 500 })

  await supabase.from("agents").update({
    use_count: 1,
    last_used_at: new Date().toISOString(),
  }).eq("id", id)

  await inngest.send({
    name: EVENT_RUN_QUEUED,
    data: { run_id: run.id, workflow_id: HARNESS_ID, input: { __test_prompt: prompt, ...(body.vars || {}) } },
  })

  return NextResponse.json({
    run_id: run.id,
    log_url: `/api/runs/${run.id}/steps`,
  })
}
