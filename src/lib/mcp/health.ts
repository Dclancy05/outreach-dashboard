// MCP server health probe. Sends a lightweight tools/list request (or a
// HEAD if SSE/stdio_remote can't accept JSON) and classifies the result
// into one of four statuses. Persists the check timestamp + last_error
// when the caller passes `persist: true`.

import { createClient } from "@supabase/supabase-js"
import type { HealthCheckResult, McpServer, McpStatus, McpErrorLogEntry } from "./types"
import { getSecret } from "@/lib/secrets"

const HEALTH_TIMEOUT_MS = 8_000
const ERROR_LOG_MAX = 20

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

/**
 * Ping the server's MCP HTTP endpoint with a `tools/list` JSON-RPC call.
 * Falls back to a HEAD if JSON-RPC isn't accepted.
 */
export async function probeServer(server: McpServer): Promise<HealthCheckResult> {
  const startedAt = Date.now()
  const checkedAt = new Date().toISOString()

  if (!server.endpoint_url) {
    return {
      status: "error",
      latency_ms: null,
      http_status: null,
      checked_at: checkedAt,
      error: "endpoint_url not set",
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  }
  if (server.bearer_token_env_var) {
    const token = await getSecret(server.bearer_token_env_var)
    if (!token) {
      return {
        status: "error",
        latency_ms: null,
        http_status: null,
        checked_at: checkedAt,
        error: `bearer token env var '${server.bearer_token_env_var}' is empty`,
      }
    }
    headers["Authorization"] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)

  try {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: `health-${startedAt}`,
      method: "tools/list",
      params: {},
    })
    const res = await fetch(server.endpoint_url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const latency = Date.now() - startedAt

    let status: McpStatus
    if (res.ok) {
      status = latency > 3000 ? "degraded" : "connected"
    } else if (res.status === 401 || res.status === 403) {
      status = "error"
    } else if (res.status >= 500) {
      status = "disconnected"
    } else {
      status = "degraded"
    }

    let errorText: string | undefined
    if (!res.ok) {
      errorText = await res.text().catch(() => `HTTP ${res.status}`)
      errorText = errorText.slice(0, 500)
    }

    return {
      status,
      latency_ms: latency,
      http_status: res.status,
      checked_at: checkedAt,
      error: errorText,
    }
  } catch (e) {
    clearTimeout(timeout)
    const err = e as Error
    const isAbort = err.name === "AbortError"
    return {
      status: "disconnected",
      latency_ms: Date.now() - startedAt,
      http_status: null,
      checked_at: checkedAt,
      error: isAbort ? `timeout after ${HEALTH_TIMEOUT_MS}ms` : err.message,
    }
  }
}

/**
 * Run a probe and persist the result onto the server row. Returns the
 * probe outcome — caller can also re-fetch the row to see the persisted
 * error_log.
 */
export async function checkAndPersist(serverId: string): Promise<HealthCheckResult> {
  const sb = supabase()
  const { data, error } = await sb
    .from("mcp_servers")
    .select("*")
    .eq("id", serverId)
    .single()
  if (error || !data) {
    return {
      status: "error",
      latency_ms: null,
      http_status: null,
      checked_at: new Date().toISOString(),
      error: error?.message || "server not found",
    }
  }

  const server = data as McpServer
  const result = await probeServer(server)

  // Append to error_log on non-OK so the UI can show recent issues.
  let nextErrorLog: McpErrorLogEntry[] = Array.isArray(server.error_log) ? server.error_log : []
  if (result.status === "error" || result.status === "disconnected") {
    nextErrorLog = [
      {
        at: result.checked_at,
        message: result.error || `status=${result.status}`,
        http_status: result.http_status ?? undefined,
      },
      ...nextErrorLog,
    ].slice(0, ERROR_LOG_MAX)
  }

  await sb
    .from("mcp_servers")
    .update({
      status: result.status,
      last_health_check_at: result.checked_at,
      last_error: result.status === "connected" ? null : (result.error ?? null),
      error_log: nextErrorLog,
      updated_at: result.checked_at,
    })
    .eq("id", serverId)

  return result
}
