import { NextRequest, NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

export async function POST(req: NextRequest) {
  try {
    const { email, refreshToken } = await req.json()

    if (!email || !refreshToken) {
      return NextResponse.json({ error: "Email and refreshToken required" }, { status: 400 })
    }

    const clientId = await getSecret("MICROSOFT_CLIENT_ID")
    const clientSecret = await getSecret("MICROSOFT_CLIENT_SECRET")
    if (!clientId) {
      return NextResponse.json({ error: "MICROSOFT_CLIENT_ID not configured" }, { status: 500 })
    }

    // 1. Use refresh token to get a new access token
    const tokenParams: Record<string, string> = {
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
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
      return NextResponse.json(
        { error: `Auth failed: ${tokenData.error_description || tokenData.error}` },
        { status: 401 }
      )
    }

    const accessToken = tokenData.access_token

    // 2. Fetch last 10 emails via Microsoft Graph API
    const graphRes = await fetch(
      "https://graph.microsoft.com/v1.0/me/messages?$top=10&$orderby=receivedDateTime desc&$select=subject,from,receivedDateTime,bodyPreview",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    const graphData = await graphRes.json()
    if (graphData.error) {
      return NextResponse.json(
        { error: `Graph API error: ${graphData.error.message}` },
        { status: 500 }
      )
    }

    const emails = (graphData.value || []).map((msg: any) => {
      const snippet = msg.bodyPreview || ""
      const subject = msg.subject || "(no subject)"

      // Try to find verification codes (4-8 digit numbers)
      const codeMatch =
        snippet.match(/\b(\d{4,8})\b/) ||
        subject.match(/\b(\d{4,8})\b/)

      return {
        subject,
        from: msg.from?.emailAddress
          ? `${msg.from.emailAddress.name || ""} <${msg.from.emailAddress.address || ""}>`
          : "Unknown",
        date: msg.receivedDateTime || "",
        snippet: codeMatch
          ? `🔑 Code: ${codeMatch[1]} — ${snippet.slice(0, 200)}`
          : snippet.slice(0, 200),
        hasCode: !!codeMatch,
        code: codeMatch ? codeMatch[1] : null,
      }
    })

    // Return new refresh token if one was issued
    return NextResponse.json({
      emails,
      total: emails.length,
      newRefreshToken: tokenData.refresh_token || null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
