// Static catalog of installable MCPs. The 3 builtin entries (playwright,
// postgres, brave-search) are seeded into mcp_servers at migration time;
// the OAuth-flow entries (github, vercel, sentry) are surfaced in the
// "Add server" dialog and instantiated when the user clicks Connect.

import type { McpCatalogEntry } from "./types"

const VPS_HOST = "https://srv1197943.taild42583.ts.net:8443"

export const MCP_CATALOG: McpCatalogEntry[] = [
  // ─── Builtins (already running on the VPS, seeded into mcp_servers) ───
  {
    slug: "playwright",
    name: "Playwright",
    provider: "playwright",
    transport: "http",
    description: "Browser automation — open URLs, click, type, screenshot, scrape DOM.",
    endpoint_template: `${VPS_HOST}/mcp/playwright`,
    bearer_token_env_var: "PLAYWRIGHT_MCP_TOKEN",
    is_builtin: true,
    setup_help: "Already running on the VPS. Token cataloged as PLAYWRIGHT_MCP_TOKEN.",
    docs_url: "https://github.com/microsoft/playwright-mcp",
  },
  {
    slug: "postgres",
    name: "Postgres",
    provider: "postgres",
    transport: "http",
    description: "Run SQL against the Supabase Postgres pool. Read-mostly; agents use this for self-healing DDL.",
    endpoint_template: `${VPS_HOST}/mcp/postgres`,
    bearer_token_env_var: "POSTGRES_MCP_TOKEN",
    is_builtin: true,
    setup_help: "Already running on the VPS. Reads POSTGRES_CONNECTION_STRING.",
    docs_url: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
  },
  {
    slug: "brave-search",
    name: "Brave Search",
    provider: "brave-search",
    transport: "http",
    description: "Web search via Brave's API. Used by agents for live research.",
    endpoint_template: `${VPS_HOST}/mcp/devtools`,
    bearer_token_env_var: "DEVTOOLS_MCP_TOKEN",
    is_builtin: true,
    setup_help: "Already running on the VPS. The path is /mcp/devtools (legacy name); the daemon wraps Brave Search.",
    docs_url: "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
  },

  // ─── OAuth-installable (v1 = GitHub PKCE; vercel & sentry stubbed) ───
  {
    slug: "github",
    name: "GitHub",
    provider: "github",
    transport: "http",
    description: "Read repos, open PRs, manage issues. Uses GitHub's official MCP server with OAuth.",
    endpoint_template: "https://api.githubcopilot.com/mcp",
    oauth_provider: "github",
    oauth_authorize_url: "https://github.com/login/oauth/authorize",
    oauth_token_url: "https://github.com/login/oauth/access_token",
    oauth_scopes: ["repo", "read:org", "workflow"],
    setup_help: "Click Connect to authorize via GitHub OAuth. PKCE flow — no client secret needed.",
    docs_url: "https://github.com/github/github-mcp-server",
  },
  {
    slug: "vercel",
    name: "Vercel",
    provider: "vercel",
    transport: "http",
    description: "Read deployments, env vars, projects. Token-based for v1; OAuth deferred.",
    bearer_token_env_var: "VERCEL_TOKEN",
    setup_help: "Paste a Vercel token from https://vercel.com/account/tokens.",
    docs_url: "https://vercel.com/docs/rest-api",
  },
  {
    slug: "sentry",
    name: "Sentry",
    provider: "sentry",
    transport: "http",
    description: "Read recent errors + breadcrumbs. Token-based.",
    bearer_token_env_var: "SENTRY_AUTH_TOKEN",
    setup_help: "Paste a Sentry auth token (the same one used by sentry-cli).",
    docs_url: "https://docs.sentry.io/api/",
  },
]

export function findCatalogEntry(slug: string): McpCatalogEntry | null {
  return MCP_CATALOG.find(c => c.slug === slug) ?? null
}

/**
 * Builtin slugs that get seeded into mcp_servers on first migration apply.
 */
export const BUILTIN_SLUGS = MCP_CATALOG.filter(c => c.is_builtin).map(c => c.slug)
