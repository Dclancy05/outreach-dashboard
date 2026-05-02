// GET /api/mcp/oauth/[provider]/start — kick off the OAuth flow.
// v1 supports provider=github (PKCE). Sets a signed httpOnly cookie
// holding the PKCE verifier + state nonce + a 10-min expiry, then
// 302-redirects to the provider's authorize URL.

import { NextRequest, NextResponse } from "next/server"
import {
  buildGithubAuthorizeUrl,
  encodeStateCookie,
  newPkcePair,
  newStateNonce,
  stateCookieName,
  stateTtlMs,
} from "@/lib/mcp/oauth"
import type { McpApiError } from "@/lib/mcp/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type Ctx = { params: Promise<{ provider: string }> }

export async function GET(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const { provider } = await params
  if (provider !== "github") {
    return NextResponse.json(
      { error: `unsupported provider '${provider}' (v1 supports github only)`, code: "validation" },
      { status: 400 }
    )
  }

  const { verifier, challenge } = newPkcePair()
  const state = newStateNonce()
  const returnTo = req.nextUrl.searchParams.get("return_to") || "/jarvis/mcps"

  const callbackUrl = new URL(`/api/mcp/oauth/${provider}/callback`, req.url).toString()

  const built = await buildGithubAuthorizeUrl({
    state,
    challenge,
    redirectUri: callbackUrl,
    scopes: ["repo", "read:org", "workflow"],
  })
  if ("error" in built) {
    return NextResponse.json({ error: built.error, code: "missing_token" }, { status: 412 })
  }

  const cookieValue = encodeStateCookie({
    provider: "github",
    verifier,
    state,
    exp: Date.now() + stateTtlMs(),
    return_to: returnTo,
  })

  const res = NextResponse.redirect(built.url, { status: 302 })
  res.cookies.set(stateCookieName(), cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(stateTtlMs() / 1000),
  })
  return res
}
