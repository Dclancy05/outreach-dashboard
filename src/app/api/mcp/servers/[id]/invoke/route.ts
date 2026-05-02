// POST /api/mcp/servers/[id]/invoke — run a tool through the broker.
// Returns { ok, call_id, duration_ms, result?, error?, status }.
// Daily-cap rejection comes back as HTTP 429 with code=daily_cap_reached.

import { NextRequest, NextResponse } from "next/server"
import { call } from "@/lib/mcp/broker"
import type { InvokeMcpToolBody, InvokeMcpToolResult, McpApiError } from "@/lib/mcp/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

function validateBody(raw: unknown): InvokeMcpToolBody | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "body must be an object" }
  const b = raw as Record<string, unknown>
  if (typeof b.tool !== "string" || !b.tool) return { error: "tool name required" }
  if (b.args !== undefined && (typeof b.args !== "object" || b.args === null || Array.isArray(b.args))) {
    return { error: "args must be a JSON object" }
  }
  return {
    tool: b.tool,
    args: (b.args ?? {}) as Record<string, unknown>,
    agent_id: typeof b.agent_id === "string" ? b.agent_id : undefined,
    run_id: typeof b.run_id === "string" ? b.run_id : undefined,
  }
}

export async function POST(req: NextRequest, { params }: Ctx): Promise<NextResponse<InvokeMcpToolResult | McpApiError>> {
  const { id } = await params
  const raw = await req.json().catch(() => null)
  const v = validateBody(raw)
  if ("error" in v) {
    return NextResponse.json({ error: v.error, code: "validation" }, { status: 400 })
  }
  const result = await call({ serverId: id, body: v })
  if (result.status === "rejected" && result.error?.includes("daily_call_cap")) {
    return NextResponse.json(
      { error: result.error, code: "daily_cap_reached" },
      { status: 429 }
    )
  }
  if (result.status === "error" && !result.call_id) {
    // Server not found / catastrophic config error — surface 404/500.
    const isNotFound = result.error?.toLowerCase().includes("not found")
    return NextResponse.json(
      { error: result.error || "invoke failed", code: isNotFound ? "not_found" : "internal" },
      { status: isNotFound ? 404 : 500 }
    )
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
