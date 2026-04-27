// POST /api/workflows/[id]/explain
// The non-technical UX feature: Claude reads the graph and writes a
// plain-English paragraph explaining what the workflow does. Critical for
// Dylan to understand a template before running it.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"
import type { WorkflowGraph } from "@/lib/workflow/graph"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const { data: wf, error } = await supabase
    .from("workflows").select("name, description, graph").eq("id", id).single()
  if (error || !wf) return NextResponse.json({ error: "workflow not found" }, { status: 404 })

  const graph = wf.graph as WorkflowGraph
  const stripped = {
    nodes: graph.nodes.map(n => ({
      id: n.id, type: n.type, label: n.data.label,
      ...(n.type === "agent"        ? { agent: n.data.agent_slug, prompt: n.data.prompt, output_var: n.data.output_var } : {}),
      ...(n.type === "orchestrator" ? { agent: n.data.agent_slug, routes: n.data.routes } : {}),
      ...(n.type === "loop"         ? { mode: n.data.mode, condition: n.data.condition, max_iter: n.data.max_iterations } : {}),
      ...(n.type === "router"       ? { condition: n.data.condition } : {}),
      ...(n.type === "approval"     ? { message: n.data.message } : {}),
      ...(n.type === "trigger" || n.type === "output" ? { schema: (n.data as { input_schema?: unknown; output_schema?: unknown }).input_schema || (n.data as { output_schema?: unknown }).output_schema || null } : {}),
      parent: n.parentNode,
    })),
    edges: graph.edges.map(e => ({ from: e.source, to: e.target, label: e.label, branch: e.data?.branch })),
  }

  const explanation = await callClaude(wf.name, wf.description, stripped)
  return NextResponse.json({ explanation })
}

async function callClaude(name: string, description: string | null, graph: unknown): Promise<string> {
  const apiKey = (await getSecret("ANTHROPIC_API_KEY")) || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return `(Claude not configured — set ANTHROPIC_API_KEY in API Keys to enable plain-English explanations.)\n\nWorkflow "${name}": ${description || "(no description)"}\nGraph has ${(graph as { nodes: unknown[] }).nodes.length} nodes.`
  }
  const prompt = `Explain in plain English what this workflow does. The reader is a non-technical owner. Use 5th-grade vocabulary, no jargon. 2-3 short paragraphs. Mention loops, approval gates, or branches if any.\n\nName: ${name}\nDescription: ${description || "(none)"}\nGraph:\n${JSON.stringify(graph, null, 2)}`

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) {
    return `(Claude API error: ${res.status})`
  }
  const data = await res.json() as { content?: Array<{ text?: string }> }
  return data.content?.[0]?.text || "(no explanation returned)"
}
