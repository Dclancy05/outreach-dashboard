import { NextRequest, NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

export async function POST(req: NextRequest) {
  try {
    const { email, refreshToken } = await req.json()

    if (!email || !refreshToken) {
      return NextResponse.json({ error: "Email and refreshToken required" }, { status: 400 })
    }

    const clientId = await getSecret("GOOGLE_CLIENT_ID")
    const clientSecret = await getSecret("GOOGLE_CLIENT_SECRET")
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 })
    }

    // 1. Refresh the access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })

    const tokenData = await tokenRes.json()
    if (tokenData.error) {
      return NextResponse.json(
        { error: `Auth failed: ${tokenData.error_description || tokenData.error}` },
        { status: 401 }
      )
    }

    const accessToken = tokenData.access_token

    // 2. Fetch last 10 emails via Gmail API
    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    const listData = await listRes.json()
    if (listData.error) {
      return NextResponse.json(
        { error: `Gmail API error: ${listData.error.message}` },
        { status: 500 }
      )
    }

    if (!listData.messages || listData.messages.length === 0) {
      return NextResponse.json({ emails: [], total: 0 })
    }

    // 3. Fetch details for each message
    const emails = await Promise.all(
      listData.messages.slice(0, 10).map(async (msg: { id: string }) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        const msgData = await msgRes.json()

        const headers = msgData.payload?.headers || []
        const subject = headers.find((h: any) => h.name === "Subject")?.value || "(no subject)"
        const from = headers.find((h: any) => h.name === "From")?.value || "Unknown"
        const snippet = msgData.snippet || ""
        const date = new Date(parseInt(msgData.internalDate || "0")).toISOString()

        const codeMatch =
          snippet.match(/\b(\d{4,8})\b/) ||
          subject.match(/\b(\d{4,8})\b/)

        return {
          subject,
          from,
          date,
          snippet: codeMatch
            ? `🔑 Code: ${codeMatch[1]} — ${snippet.slice(0, 200)}`
            : snippet.slice(0, 200),
          hasCode: !!codeMatch,
          code: codeMatch ? codeMatch[1] : null,
        }
      })
    )

    return NextResponse.json({ emails, total: emails.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
