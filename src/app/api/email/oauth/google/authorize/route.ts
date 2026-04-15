import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")
  if (!email) {
    return NextResponse.json({ error: "Email parameter required" }, { status: 400 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: "GOOGLE_CLIENT_ID not configured" }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://outreach-dashboard-five.vercel.app"
  const redirectUri = `${baseUrl}/api/email/oauth/google/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    state: email,
    access_type: "offline",
    prompt: "consent",
    login_hint: email,
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  return NextResponse.redirect(authUrl)
}
