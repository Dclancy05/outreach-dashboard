-- ============================================================
-- MCP Servers + Tool-Call Activity Log
-- ============================================================
-- Backs the /jarvis/mcps page. Each row in `mcp_servers` is one
-- Model-Context-Protocol endpoint the dashboard can call into
-- (HTTP, SSE, or stdio-over-HTTP). The 3 already-running daemons
-- (playwright, postgres, brave-search) are seeded as is_builtin=true
-- and cannot be deleted from the UI.
--
-- `mcp_tool_calls` is a redacted audit trail — args_redacted has
-- bearer tokens / passwords stripped before insert by the broker
-- in src/lib/mcp/broker.ts. RLS is on; only service_role reads.
--
-- Apply via: Supabase Management API (see reference_supabase_management_api.md)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  provider text NOT NULL,
  transport text NOT NULL CHECK (transport IN ('http','sse','stdio_remote')),
  endpoint_url text,
  bearer_token_env_var text,
  oauth_provider text,
  oauth_token_id uuid,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected','degraded','disconnected','error')),
  last_health_check_at timestamptz,
  last_error text,
  error_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  daily_call_cap integer NOT NULL DEFAULT 1000,
  calls_today integer NOT NULL DEFAULT 0,
  is_builtin boolean NOT NULL DEFAULT false,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_status ON mcp_servers(status);

CREATE TABLE IF NOT EXISTS mcp_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  args_json jsonb,
  args_redacted jsonb,
  result_json jsonb,
  status text NOT NULL,
  duration_ms integer,
  error text,
  agent_id uuid,
  run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_server_created
  ON mcp_tool_calls(server_id, created_at DESC);

ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_tool_calls ENABLE ROW LEVEL SECURITY;
-- Service role bypasses RLS automatically; no anon access.
