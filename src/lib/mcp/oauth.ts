// GitHub OAuth (PKCE) for MCP installation. v1 supports `provider=github`
// only. State + PKCE verifier are stored in an HMAC-signed httpOnly cookie
// so we don't need a DB round-trip on the callback. Cookie is sameSite=lax
// because GitHub's redirect is a top-level navigation.

import crypto from "crypto"
import type { McpOAuthProvider } from "./types"
import { signPayload, verifyAndExtract } from "@/lib/session-crypto"
import { getSecret } from "@/lib/secrets"

const STATE_COOKIE = "mcp_oauth_state"
const STATE_TTL_MS = 10 * 60 * 1000

export interface OAuthStateCookie {
  provider: McpOAuthProvider
  verifier: string
  state: string
  exp: number // ms epoch
  return_to?: string
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function newPkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(crypto.randomBytes(32))
  const challenge = b64url(
    crypto.createHash("sha256").update(verifier).digest()
  )
  return { verifier, challenge }
}

export function newStateNonce(): string {
  return b64url(crypto.randomBytes(16))
}

export function encodeStateCookie(payload: OAuthStateCookie): string {
  return signPayload(JSON.stringify(payload))
}

export function decodeStateCookie(token: string | undefined | null): OAuthStateCookie | null {
  if (!token) return null
  const raw = verifyAndExtract(token)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as OAuthStateCookie
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null
    if (typeof parsed.verifier !== "string" || typeof parsed.state !== "string") return null
    return parsed
  } catch {
    return null
  }
}

export function stateCookieName(): string {
  return STATE_COOKIE
}

export function stateTtlMs(): number {
  return STATE_TTL_MS
}

/**
 * Build the GitHub authorize URL. Returns the URL string; caller is
 * responsible for setting the state cookie + 302-redirecting.
 */
export async function buildGithubAuthorizeUrl(opts: {
  state: string
  challenge: string
  redirectUri: string
  scopes?: string[]
}): Promise<{ url: string } | { error: string }> {
  const clientId = await getSecret("GITHUB_MCP_OAUTH_CLIENT_ID")
  if (!clientId) {
    return { error: "GITHUB_MCP_OAUTH_CLIENT_ID not configured" }
  }
  const url = new URL("https://github.com/login/oauth/authorize")
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("redirect_uri", opts.redirectUri)
  url.searchParams.set("state", opts.state)
  url.searchParams.set("code_challenge", opts.challenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("scope", (opts.scopes ?? ["repo", "read:org"]).join(" "))
  return { url: url.toString() }
}

export interface GithubTokenResponse {
  access_token: string
  token_type: string
  scope?: string
  refresh_token?: string
  expires_in?: number
}

export async function exchangeGithubCode(opts: {
  code: string
  verifier: string
  redirectUri: string
}): Promise<{ token: GithubTokenResponse } | { error: string }> {
  const clientId = await getSecret("GITHUB_MCP_OAUTH_CLIENT_ID")
  if (!clientId) return { error: "GITHUB_MCP_OAUTH_CLIENT_ID not configured" }

  try {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        code: opts.code,
        code_verifier: opts.verifier,
        redirect_uri: opts.redirectUri,
      }).toString(),
    })
    if (!res.ok) {
      return { error: `github: HTTP ${res.status} ${await res.text().catch(() => "")}` }
    }
    const data = await res.json() as GithubTokenResponse | { error: string; error_description?: string }
    if ("error" in data) {
      return { error: `github: ${data.error}${data.error_description ? ` - ${data.error_description}` : ""}` }
    }
    if (!("access_token" in data) || !data.access_token) {
      return { error: "github: missing access_token in response" }
    }
    return { token: data }
  } catch (e) {
    return { error: `github exchange: ${(e as Error).message}` }
  }
}
