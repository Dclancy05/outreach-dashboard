import { NextRequest, NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")
  const state = req.nextUrl.searchParams.get("state") // email address
  const error = req.nextUrl.searchParams.get("error")

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://outreach-dashboard-five.vercel.app"
  const redirectUri = `${baseUrl}/api/email/oauth/callback`
  const clientId = (await getSecret("MICROSOFT_CLIENT_ID")) || ""
  const clientSecret = (await getSecret("MICROSOFT_CLIENT_SECRET")) || ""

  if (error) {
    const desc = req.nextUrl.searchParams.get("error_description") || error
    return NextResponse.redirect(
      `${baseUrl}/oauth-complete?error=${encodeURIComponent(desc)}`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${baseUrl}/oauth-complete?error=${encodeURIComponent("Missing authorization code")}`
    )
  }

  try {
    // Exchange code for tokens
    const tokenParams: Record<string, string> = {
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: "Mail.Read offline_access openid email",
    }
    if (clientSecret) tokenParams.client_secret = clientSecret

    const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenParams),
    })

    const tokenData = await tokenRes.json()

    if (tokenData.error) {
      return NextResponse.redirect(
        `${baseUrl}/oauth-complete?error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`
      )
    }

    const refreshToken = tokenData.refresh_token || ""

    // Redirect to oauth-complete page which posts token back to opener and auto-closes
    return NextResponse.redirect(
      `${baseUrl}/oauth-complete?connected=${encodeURIComponent(state)}#token=${encodeURIComponent(refreshToken)}`
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token exchange failed"
    return NextResponse.redirect(
      `${baseUrl}/oauth-complete?error=${encodeURIComponent(msg)}`
    )
  }
}
