import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")
  if (!email) {
    return NextResponse.json({ error: "Email parameter required" }, { status: 400 })
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: "MICROSOFT_CLIENT_ID not configured" }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://outreach-dashboard-five.vercel.app"
  const redirectUri = `${baseUrl}/api/email/oauth/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "Mail.Read offline_access openid email",
    state: email,
    prompt: "consent",
  })

  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`

  return NextResponse.redirect(authUrl)
}
