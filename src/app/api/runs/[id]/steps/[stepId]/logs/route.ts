// SSE proxy from VPS agent runner per-step log stream.
// Mirrors the pattern in /api/memory-vault/events/route.ts.

import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 600

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Ctx = { params: Promise<{ id: string; stepId: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { stepId } = await params
  const { data: step } = await supabase.from("workflow_steps").select("log_url").eq("id", stepId).single()
  if (!step?.log_url) {
    return new Response(`event: end\ndata: {"error":"no log_url available yet"}\n\n`, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
      },
    })
  }

  const RUNNER_URL   = (process.env.AGENT_RUNNER_URL   || "").replace(/\/+$/, "")
  const RUNNER_TOKEN =  process.env.AGENT_RUNNER_TOKEN || ""
  if (!RUNNER_URL) {
    return new Response(`event: end\ndata: {"error":"agent runner not configured"}\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } })
  }

  const upstreamUrl = step.log_url.startsWith("http") ? step.log_url : `${RUNNER_URL}${step.log_url}`
  const upstream = await fetch(upstreamUrl, {
    headers: {
      "Accept": "text/event-stream",
      ...(RUNNER_TOKEN ? { "Authorization": `Bearer ${RUNNER_TOKEN}` } : {}),
    },
    signal: req.signal,
  }).catch(() => null)

  if (!upstream || !upstream.ok || !upstream.body) {
    return new Response(`event: end\ndata: {"error":"upstream unavailable"}\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } })
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  })
}
