// /api/mcp/servers — list (GET) + create (POST).
// Admin-gated by middleware.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type {
  CreateMcpServerBody,
  ListServersResponse,
  McpApiError,
  McpServer,
  McpTransport,
} from "@/lib/mcp/types"
import { findCatalogEntry } from "@/lib/mcp/catalog"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(): Promise<NextResponse<ListServersResponse | McpApiError>> {
  const { data, error } = await supabase
    .from("mcp_servers")
    .select("*")
    .order("is_builtin", { ascending: false })
    .order("name", { ascending: true })
  if (error) {
    return NextResponse.json({ error: error.message, code: "internal" }, { status: 500 })
  }
  return NextResponse.json({ servers: (data || []) as McpServer[] })
}

const VALID_TRANSPORTS: McpTransport[] = ["http", "sse", "stdio_remote"]

function validateCreateBody(raw: unknown): CreateMcpServerBody | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "body must be an object" }
  const b = raw as Record<string, unknown>
  if (typeof b.slug !== "string" || !/^[a-z0-9-]{1,64}$/.test(b.slug)) {
    return { error: "slug required, lowercase letters/digits/dashes only" }
  }
  if (typeof b.provider !== "string" || !b.provider) {
    return { error: "provider required" }
  }
  if (typeof b.transport !== "string" || !VALID_TRANSPORTS.includes(b.transport as McpTransport)) {
    return { error: `transport must be one of ${VALID_TRANSPORTS.join("|")}` }
  }
  if (b.endpoint_url !== undefined && b.endpoint_url !== null && typeof b.endpoint_url !== "string") {
    return { error: "endpoint_url must be a string or null" }
  }
  if (b.bearer_token_env_var !== undefined && b.bearer_token_env_var !== null && typeof b.bearer_token_env_var !== "string") {
    return { error: "bearer_token_env_var must be a string or null" }
  }
  if (b.daily_call_cap !== undefined && (typeof b.daily_call_cap !== "number" || b.daily_call_cap < 1 || b.daily_call_cap > 1_000_000)) {
    return { error: "daily_call_cap must be 1..1000000" }
  }
  return {
    slug: b.slug,
    name: typeof b.name === "string" ? b.name : b.slug,
    provider: b.provider as string,
    transport: b.transport as McpTransport,
    endpoint_url: typeof b.endpoint_url === "string" ? b.endpoint_url : null,
    bearer_token_env_var: typeof b.bearer_token_env_var === "string" ? b.bearer_token_env_var : null,
    oauth_provider: b.oauth_provider === "github" ? "github" : null,
    daily_call_cap: typeof b.daily_call_cap === "number" ? b.daily_call_cap : 1000,
    capabilities: (b.capabilities && typeof b.capabilities === "object")
      ? b.capabilities as Record<string, unknown>
      : {},
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<{ server: McpServer } | McpApiError>> {
  const raw = await req.json().catch(() => null)
  const v = validateCreateBody(raw)
  if ("error" in v) {
    return NextResponse.json({ error: v.error, code: "validation" }, { status: 400 })
  }

  // If the slug matches a known catalog entry, fill in defaults.
  const cat = findCatalogEntry(v.slug)
  const insertRow = {
    slug: v.slug,
    name: v.name ?? cat?.name ?? v.slug,
    provider: v.provider ?? cat?.provider ?? v.slug,
    transport: v.transport,
    endpoint_url: v.endpoint_url ?? cat?.endpoint_template ?? null,
    bearer_token_env_var: v.bearer_token_env_var ?? cat?.bearer_token_env_var ?? null,
    oauth_provider: v.oauth_provider ?? cat?.oauth_provider ?? null,
    daily_call_cap: v.daily_call_cap ?? 1000,
    is_builtin: cat?.is_builtin ?? false,
    capabilities: v.capabilities ?? {},
    status: "disconnected" as const,
  }

  const { data, error } = await supabase
    .from("mcp_servers")
    .insert(insertRow)
    .select("*")
    .single()
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "slug already exists", code: "validation" }, { status: 409 })
    }
    return NextResponse.json({ error: error.message, code: "internal" }, { status: 500 })
  }
  return NextResponse.json({ server: data as McpServer }, { status: 201 })
}
