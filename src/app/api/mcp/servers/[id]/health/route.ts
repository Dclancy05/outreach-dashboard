// POST /api/mcp/servers/[id]/health — runs a probe + persists the result.
// Returns the latest status snapshot.

import { NextRequest, NextResponse } from "next/server"
import { checkAndPersist } from "@/lib/mcp/health"
import type { HealthCheckResult, McpApiError } from "@/lib/mcp/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx): Promise<NextResponse<HealthCheckResult | McpApiError>> {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: "missing id", code: "validation" }, { status: 400 })
  }
  const result = await checkAndPersist(id)
  return NextResponse.json(result)
}
