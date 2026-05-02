// MCP broker — single funnel for tool invocations. Enforces:
//   - daily call cap (lazy reset at UTC midnight)
//   - bearer-token redaction in the persisted args_redacted column
//   - "no Bearer in args" guarantee (a literal "Bearer xxx" string is scrubbed)
//   - one INSERT per call into mcp_tool_calls (audit trail)
//
// All mutations use the service-role Supabase client. Caller is expected
// to be admin-gated by middleware.

import { createClient } from "@supabase/supabase-js"
import type {
  InvokeMcpToolBody,
  InvokeMcpToolResult,
  McpServer,
  McpToolCall,
} from "./types"
import { getSecret } from "@/lib/secrets"

const INVOKE_TIMEOUT_MS = 30_000
const REDACTED_KEY_RE = /token|secret|key|password|authorization/i
const BEARER_LITERAL_RE = /Bearer\s+[A-Za-z0-9._\-]+/g

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

/**
 * Recursively redact any value whose key matches the redaction pattern, OR
 * any string value that contains a literal "Bearer xxx". Returns a fresh
 * object — never mutates the input.
 */
export function redactArgs(input: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]"
  if (input === null || input === undefined) return input
  if (typeof input === "string") {
    return input.replace(BEARER_LITERAL_RE, "Bearer [redacted]")
  }
  if (typeof input !== "object") return input
  if (Array.isArray(input)) {
    return input.map(v => redactArgs(v, depth + 1))
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (REDACTED_KEY_RE.test(k)) {
      out[k] = "[redacted]"
    } else {
      out[k] = redactArgs(v, depth + 1)
    }
  }
  return out
}

function todayUtcDateString(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

/**
 * Lazy daily-cap reset. If the row's updated_at date (UTC) is < today,
 * zero `calls_today`. Returns the up-to-date `calls_today` value AFTER reset.
 */
async function resetIfNewDay(server: McpServer): Promise<number> {
  const updatedDate = server.updated_at?.slice(0, 10) ?? ""
  const today = todayUtcDateString()
  if (updatedDate < today) {
    const sb = supabase()
    await sb
      .from("mcp_servers")
      .update({ calls_today: 0, updated_at: new Date().toISOString() })
      .eq("id", server.id)
    return 0
  }
  return server.calls_today
}

export interface BrokerCallParams {
  serverId: string
  body: InvokeMcpToolBody
}

/**
 * Invoke a tool on a server. Returns a structured result + the ID of the
 * row written to mcp_tool_calls (for the UI to link from the playground).
 */
export async function call({
  serverId,
  body,
}: BrokerCallParams): Promise<InvokeMcpToolResult> {
  const sb = supabase()
  const startedAt = Date.now()

  const { data, error } = await sb
    .from("mcp_servers")
    .select("*")
    .eq("id", serverId)
    .single()
  if (error || !data) {
    return {
      ok: false,
      call_id: "",
      duration_ms: 0,
      status: "error",
      error: error?.message || "server not found",
    }
  }
  const server = data as McpServer

  const callsToday = await resetIfNewDay(server)
  if (callsToday >= server.daily_call_cap) {
    const callRow = await persistCall({
      server_id: server.id,
      tool_name: body.tool,
      args_json: body.args ?? null,
      result_json: null,
      status: "rejected",
      duration_ms: 0,
      error: `daily_call_cap reached (${server.daily_call_cap})`,
      agent_id: body.agent_id ?? null,
      run_id: body.run_id ?? null,
    })
    return {
      ok: false,
      call_id: callRow?.id ?? "",
      duration_ms: 0,
      status: "rejected",
      error: `daily_call_cap reached (${server.daily_call_cap})`,
    }
  }

  if (!server.endpoint_url) {
    const callRow = await persistCall({
      server_id: server.id,
      tool_name: body.tool,
      args_json: body.args ?? null,
      result_json: null,
      status: "error",
      duration_ms: 0,
      error: "endpoint_url not set",
      agent_id: body.agent_id ?? null,
      run_id: body.run_id ?? null,
    })
    return {
      ok: false,
      call_id: callRow?.id ?? "",
      duration_ms: 0,
      status: "error",
      error: "endpoint_url not set",
    }
  }

  // Build headers; resolve bearer from secrets.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  }
  if (server.bearer_token_env_var) {
    const token = await getSecret(server.bearer_token_env_var)
    if (!token) {
      const callRow = await persistCall({
        server_id: server.id,
        tool_name: body.tool,
        args_json: body.args ?? null,
        result_json: null,
        status: "error",
        duration_ms: 0,
        error: `missing bearer token (${server.bearer_token_env_var})`,
        agent_id: body.agent_id ?? null,
        run_id: body.run_id ?? null,
      })
      return {
        ok: false,
        call_id: callRow?.id ?? "",
        duration_ms: 0,
        status: "error",
        error: `missing bearer token (${server.bearer_token_env_var})`,
      }
    }
    headers["Authorization"] = `Bearer ${token}`
  }

  // Increment calls_today eagerly (best-effort — cap re-checked above).
  await sb
    .from("mcp_servers")
    .update({ calls_today: callsToday + 1, updated_at: new Date().toISOString() })
    .eq("id", server.id)

  // JSON-RPC tools/call envelope.
  const rpcBody = JSON.stringify({
    jsonrpc: "2.0",
    id: `call-${startedAt}`,
    method: "tools/call",
    params: { name: body.tool, arguments: body.args ?? {} },
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS)

  let resultJson: Record<string, unknown> | null = null
  let errorText: string | null = null
  let status: "ok" | "error" = "ok"

  try {
    const res = await fetch(server.endpoint_url, {
      method: "POST",
      headers,
      body: rpcBody,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const text = await res.text()
    let parsed: unknown = null
    try {
      parsed = JSON.parse(text)
    } catch {
      // Some MCPs (SSE bridges) return event-stream text — surface it as-is.
      parsed = { raw: text.slice(0, 4000) }
    }

    if (!res.ok) {
      status = "error"
      errorText = `HTTP ${res.status}: ${typeof parsed === "object" && parsed && "error" in parsed ? JSON.stringify((parsed as Record<string, unknown>).error) : text.slice(0, 300)}`
    } else if (parsed && typeof parsed === "object" && "error" in parsed && parsed.error) {
      // JSON-RPC-level error
      status = "error"
      errorText = JSON.stringify((parsed as Record<string, unknown>).error).slice(0, 500)
    }

    resultJson = (typeof parsed === "object" && parsed !== null)
      ? (parsed as Record<string, unknown>)
      : { value: parsed }
  } catch (e) {
    clearTimeout(timeout)
    status = "error"
    const err = e as Error
    errorText = err.name === "AbortError"
      ? `timeout after ${INVOKE_TIMEOUT_MS}ms`
      : err.message
  }

  const durationMs = Date.now() - startedAt
  const callRow = await persistCall({
    server_id: server.id,
    tool_name: body.tool,
    args_json: body.args ?? null,
    result_json: resultJson,
    status,
    duration_ms: durationMs,
    error: errorText,
    agent_id: body.agent_id ?? null,
    run_id: body.run_id ?? null,
  })

  return {
    ok: status === "ok",
    call_id: callRow?.id ?? "",
    duration_ms: durationMs,
    result: resultJson ?? undefined,
    error: errorText ?? undefined,
    status,
  }
}

interface PersistCallInput {
  server_id: string
  tool_name: string
  args_json: Record<string, unknown> | null
  result_json: Record<string, unknown> | null
  status: "ok" | "error" | "rejected"
  duration_ms: number
  error: string | null
  agent_id: string | null
  run_id: string | null
}

async function persistCall(input: PersistCallInput): Promise<McpToolCall | null> {
  const sb = supabase()
  const args_redacted = input.args_json
    ? (redactArgs(input.args_json) as Record<string, unknown>)
    : null
  const { data, error } = await sb
    .from("mcp_tool_calls")
    .insert({
      server_id: input.server_id,
      tool_name: input.tool_name,
      args_json: input.args_json,
      args_redacted,
      result_json: input.result_json,
      status: input.status,
      duration_ms: input.duration_ms,
      error: input.error,
      agent_id: input.agent_id,
      run_id: input.run_id,
    })
    .select("*")
    .single()
  if (error) {
    console.warn("[mcp.broker] persistCall failed:", error.message)
    return null
  }
  return data as McpToolCall
}
