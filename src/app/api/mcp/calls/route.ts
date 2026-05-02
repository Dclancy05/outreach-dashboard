// GET /api/mcp/calls?server_id=&limit=&cursor= — recent tool-call activity.
// Cursor is the `created_at` timestamp of the last row from the previous page
// (keyset pagination on (server_id, created_at) — matches the index).

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { ListCallsResponse, McpApiError, McpToolCall } from "@/lib/mcp/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export async function GET(req: NextRequest): Promise<NextResponse<ListCallsResponse | McpApiError>> {
  const sp = req.nextUrl.searchParams
  const serverId = sp.get("server_id")
  const limitRaw = parseInt(sp.get("limit") || "", 10)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, MAX_LIMIT)
    : DEFAULT_LIMIT
  const cursor = sp.get("cursor")

  let query = supabase
    .from("mcp_tool_calls")
    .select("id, server_id, tool_name, args_redacted, status, duration_ms, error, agent_id, run_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit + 1)

  if (serverId) query = query.eq("server_id", serverId)
  if (cursor) query = query.lt("created_at", cursor)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message, code: "internal" }, { status: 500 })
  }
  const rows = (data || []) as Array<Partial<McpToolCall> & { created_at: string }>
  let nextCursor: string | null = null
  if (rows.length > limit) {
    const trimmed = rows.slice(0, limit)
    nextCursor = trimmed[trimmed.length - 1]?.created_at ?? null
    return NextResponse.json({
      calls: trimmed as McpToolCall[],
      next_cursor: nextCursor,
    })
  }
  return NextResponse.json({ calls: rows as McpToolCall[], next_cursor: null })
}
