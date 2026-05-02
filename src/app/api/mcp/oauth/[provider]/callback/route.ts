// GET /api/mcp/oauth/[provider]/callback — exchange the auth code for a
// token and persist it. The actual access_token is written into api_keys
// (env_var=GITHUB_MCP_TOKEN) so getSecret() can resolve it; the mcp_servers
// row gets oauth_provider='github' and bearer_token_env_var pointing at the
// same env var.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  decodeStateCookie,
  exchangeGithubCode,
  stateCookieName,
} from "@/lib/mcp/oauth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Ctx = { params: Promise<{ provider: string }> }

function errorRedirect(req: NextRequest, message: string): NextResponse {
  const url = new URL("/jarvis/mcps", req.url)
  url.searchParams.set("oauth_error", message.slice(0, 200))
  return NextResponse.redirect(url, { status: 302 })
}

function successRedirect(req: NextRequest, returnTo: string, slug: string): NextResponse {
  const url = new URL(returnTo.startsWith("/") ? returnTo : "/jarvis/mcps", req.url)
  url.searchParams.set("oauth_connected", slug)
  return NextResponse.redirect(url, { status: 302 })
}

export async function GET(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const { provider } = await params
  if (provider !== "github") return errorRedirect(req, `unsupported provider ${provider}`)

  const sp = req.nextUrl.searchParams
  const code = sp.get("code")
  const state = sp.get("state")
  const oauthErr = sp.get("error")
  if (oauthErr) return errorRedirect(req, `provider returned: ${oauthErr}`)
  if (!code || !state) return errorRedirect(req, "missing code or state")

  const cookie = req.cookies.get(stateCookieName())?.value
  const stateData = decodeStateCookie(cookie)
  if (!stateData) return errorRedirect(req, "state cookie missing or expired")
  if (stateData.state !== state) return errorRedirect(req, "state mismatch")
  if (stateData.provider !== "github") return errorRedirect(req, "provider mismatch")

  const callbackUrl = new URL(`/api/mcp/oauth/${provider}/callback`, req.url).toString()
  const exchange = await exchangeGithubCode({
    code,
    verifier: stateData.verifier,
    redirectUri: callbackUrl,
  })
  if ("error" in exchange) return errorRedirect(req, exchange.error)

  const accessToken = exchange.token.access_token

  // Persist token into api_keys under GITHUB_MCP_TOKEN.
  // Upsert by env_var — keep history by inserting a new row when none exists,
  // otherwise update the existing one.
  const { data: existing } = await supabase
    .from("api_keys")
    .select("id")
    .eq("env_var", "GITHUB_MCP_TOKEN")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const apiKeyRow = {
    env_var: "GITHUB_MCP_TOKEN",
    value: accessToken,
    last_used_at: null as string | null,
    expires_at: exchange.token.expires_in
      ? new Date(Date.now() + exchange.token.expires_in * 1000).toISOString()
      : null,
  }
  if (existing?.id) {
    await supabase.from("api_keys").update({ ...apiKeyRow, updated_at: new Date().toISOString() }).eq("id", existing.id)
  } else {
    await supabase.from("api_keys").insert(apiKeyRow)
  }

  // Ensure a github mcp_servers row exists.
  const githubServer = {
    slug: "github",
    name: "GitHub",
    provider: "github",
    transport: "http",
    endpoint_url: "https://api.githubcopilot.com/mcp",
    bearer_token_env_var: "GITHUB_MCP_TOKEN",
    oauth_provider: "github",
    is_builtin: false,
    status: "disconnected" as const,
  }
  const { data: serverRow } = await supabase
    .from("mcp_servers")
    .select("id")
    .eq("slug", "github")
    .maybeSingle()
  if (serverRow?.id) {
    await supabase
      .from("mcp_servers")
      .update({ ...githubServer, updated_at: new Date().toISOString() })
      .eq("id", serverRow.id)
  } else {
    await supabase.from("mcp_servers").insert(githubServer)
  }

  const res = successRedirect(req, stateData.return_to || "/jarvis/mcps", "github")
  // Clear the state cookie.
  res.cookies.set(stateCookieName(), "", { path: "/", maxAge: 0 })
  return res
}
