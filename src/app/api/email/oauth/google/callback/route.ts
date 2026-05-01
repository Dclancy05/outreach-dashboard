import { NextRequest, NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")
  const state = req.nextUrl.searchParams.get("state") // email address
  const error = req.nextUrl.searchParams.get("error")

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://outreach-github.vercel.app"
  const redirectUri = `${baseUrl}/api/email/oauth/google/callback`
  const clientId = (await getSecret("GOOGLE_CLIENT_ID")) || ""
  const clientSecret = (await getSecret("GOOGLE_CLIENT_SECRET")) || ""

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/oauth-complete?error=${encodeURIComponent(error)}`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${baseUrl}/oauth-complete?error=${encodeURIComponent("Missing authorization code")}`
    )
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })

    const tokenData = await tokenRes.json()

    if (tokenData.error) {
      return NextResponse.redirect(
        `${baseUrl}/oauth-complete?error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`
      )
    }

    const refreshToken = tokenData.refresh_token || ""

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
