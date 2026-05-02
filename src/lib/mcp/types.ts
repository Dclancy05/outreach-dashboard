// MCP backend types — shipped FIRST so W4.A.B2/B3 can import.
// Frozen shape: do not mutate without coordinating with B2 & B3.

export type McpTransport = "http" | "sse" | "stdio_remote";

export type McpStatus =
  | "connected"
  | "degraded"
  | "disconnected"
  | "error";

export type McpProvider =
  | "playwright"
  | "postgres"
  | "brave-search"
  | "github"
  | "vercel"
  | "sentry"
  | "custom";

export type McpOAuthProvider = "github";

/**
 * Row in `mcp_servers`. Matches DDL exactly.
 */
export interface McpServer {
  id: string;
  slug: string;
  name: string;
  provider: McpProvider | string;
  transport: McpTransport;
  endpoint_url: string | null;
  bearer_token_env_var: string | null;
  oauth_provider: McpOAuthProvider | null;
  oauth_token_id: string | null;
  status: McpStatus;
  last_health_check_at: string | null;
  last_error: string | null;
  error_log: McpErrorLogEntry[];
  daily_call_cap: number;
  calls_today: number;
  is_builtin: boolean;
  capabilities: McpCapabilities;
  created_at: string;
  updated_at: string;
}

export interface McpErrorLogEntry {
  at: string; // ISO timestamp
  message: string;
  http_status?: number;
}

export interface McpCapabilities {
  tools?: McpToolDescriptor[];
  resources?: boolean;
  prompts?: boolean;
  [k: string]: unknown;
}

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: McpJsonSchema;
}

/**
 * Subset of JSON-Schema we actually render.
 * Recursive — kept narrow on purpose (depth ≤ 3 enforced in B3 form).
 */
export interface McpJsonSchema {
  type?:
    | "string"
    | "number"
    | "integer"
    | "boolean"
    | "array"
    | "object"
    | "null";
  description?: string;
  enum?: (string | number)[];
  properties?: Record<string, McpJsonSchema>;
  required?: string[];
  items?: McpJsonSchema;
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

/**
 * Row in `mcp_tool_calls`. Matches DDL exactly.
 */
export interface McpToolCall {
  id: string;
  server_id: string;
  tool_name: string;
  args_json: Record<string, unknown> | null;
  args_redacted: Record<string, unknown> | null;
  result_json: Record<string, unknown> | null;
  status: "ok" | "error" | "rejected";
  duration_ms: number | null;
  error: string | null;
  agent_id: string | null;
  run_id: string | null;
  created_at: string;
}

/**
 * Static catalog entry — defines installable MCPs the user can add by slug.
 */
export interface McpCatalogEntry {
  slug: string;
  name: string;
  provider: McpProvider;
  transport: McpTransport;
  description: string;
  endpoint_template?: string; // e.g. "https://srv.../mcp/{slug}"
  bearer_token_env_var?: string;
  oauth_provider?: McpOAuthProvider;
  oauth_authorize_url?: string;
  oauth_token_url?: string;
  oauth_scopes?: string[];
  is_builtin?: boolean;
  setup_help?: string;
  docs_url?: string;
}

/**
 * POST /api/mcp/servers body.
 */
export interface CreateMcpServerBody {
  slug: string;
  name?: string;
  provider: McpProvider | string;
  transport: McpTransport;
  endpoint_url?: string | null;
  bearer_token_env_var?: string | null;
  oauth_provider?: McpOAuthProvider | null;
  daily_call_cap?: number;
  capabilities?: McpCapabilities;
}

/**
 * PATCH /api/mcp/servers/[id] body.
 */
export interface UpdateMcpServerBody {
  name?: string;
  endpoint_url?: string | null;
  bearer_token_env_var?: string | null;
  oauth_provider?: McpOAuthProvider | null;
  daily_call_cap?: number;
  status?: McpStatus;
}

/**
 * POST /api/mcp/servers/[id]/invoke body.
 */
export interface InvokeMcpToolBody {
  tool: string;
  args?: Record<string, unknown>;
  agent_id?: string;
  run_id?: string;
}

export interface InvokeMcpToolResult {
  ok: boolean;
  call_id: string;
  duration_ms: number;
  result?: Record<string, unknown>;
  error?: string;
  status: "ok" | "error" | "rejected";
}

/**
 * GET /api/mcp/servers/[id]/health response.
 */
export interface HealthCheckResult {
  status: McpStatus;
  latency_ms: number | null;
  http_status: number | null;
  checked_at: string;
  error?: string;
}

/**
 * GET /api/mcp/calls response.
 */
export interface ListCallsResponse {
  calls: McpToolCall[];
  next_cursor: string | null;
}

/**
 * Standard error envelope returned by all /api/mcp/* routes.
 */
export interface McpApiError {
  error: string;
  code?:
    | "not_found"
    | "validation"
    | "unauthorized"
    | "daily_cap_reached"
    | "missing_token"
    | "upstream_error"
    | "builtin_locked"
    | "internal";
  details?: unknown;
}

/**
 * Standard success envelope for list endpoints.
 */
export interface ListServersResponse {
  servers: McpServer[];
}

/**
 * Tools-list cache shape (in-memory, 60s TTL).
 */
export interface ToolsListCacheEntry {
  fetched_at: number;
  tools: McpToolDescriptor[];
}
