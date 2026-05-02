// GET /api/mcp/servers/[id]/tools — passthrough to the MCP server's
// `tools/list` JSON-RPC method. Cached in-memory for 60s per server.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"
import type {
  McpApiError,
  McpServer,
  McpToolDescriptor,
  ToolsListCacheEntry,
} from "@/lib/mcp/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const TOOLS_CACHE_TTL_MS = 60_000
const toolsCache = new Map<string, ToolsListCacheEntry>()
const TOOLS_TIMEOUT_MS = 8_000

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx): Promise<NextResponse<{ tools: McpToolDescriptor[]; cached: boolean } | McpApiError>> {
  const { id } = await params
  const force = req.nextUrl.searchParams.get("force") === "1"

  if (!force) {
    const hit = toolsCache.get(id)
    if (hit && Date.now() - hit.fetched_at < TOOLS_CACHE_TTL_MS) {
      return NextResponse.json({ tools: hit.tools, cached: true })
    }
  }

  const { data, error } = await supabase
    .from("mcp_servers")
    .select("*")
    .eq("id", id)
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "not found", code: "not_found" }, { status: 404 })
  }
  const server = data as McpServer
  if (!server.endpoint_url) {
    return NextResponse.json({ error: "endpoint_url not set", code: "validation" }, { status: 400 })
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  }
  if (server.bearer_token_env_var) {
    const token = await getSecret(server.bearer_token_env_var)
    if (!token) {
      return NextResponse.json(
        { error: `missing bearer token (${server.bearer_token_env_var})`, code: "missing_token" },
        { status: 412 }
      )
    }
    headers["Authorization"] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TOOLS_TIMEOUT_MS)

  try {
    const res = await fetch(server.endpoint_url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `tools-list-${Date.now()}`,
        method: "tools/list",
        params: {},
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      return NextResponse.json(
        { error: `upstream HTTP ${res.status}`, code: "upstream_error" },
        { status: 502 }
      )
    }
    const text = await res.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return NextResponse.json(
        { error: "upstream returned non-JSON", code: "upstream_error" },
        { status: 502 }
      )
    }

    const tools = extractTools(parsed)
    toolsCache.set(id, { fetched_at: Date.now(), tools })
    return NextResponse.json({ tools, cached: false })
  } catch (e) {
    clearTimeout(timer)
    const err = e as Error
    return NextResponse.json(
      { error: err.name === "AbortError" ? "timeout" : err.message, code: "upstream_error" },
      { status: 504 }
    )
  }
}

function extractTools(rpc: unknown): McpToolDescriptor[] {
  if (!rpc || typeof rpc !== "object") return []
  const r = rpc as Record<string, unknown>
  const result = r.result
  if (!result || typeof result !== "object") return []
  const tools = (result as Record<string, unknown>).tools
  if (!Array.isArray(tools)) return []
  const out: McpToolDescriptor[] = []
  for (const t of tools) {
    if (!t || typeof t !== "object") continue
    const o = t as Record<string, unknown>
    if (typeof o.name !== "string") continue
    out.push({
      name: o.name,
      description: typeof o.description === "string" ? o.description : undefined,
      inputSchema: (o.inputSchema && typeof o.inputSchema === "object")
        ? o.inputSchema as McpToolDescriptor["inputSchema"]
        : undefined,
    })
  }
  return out
}
