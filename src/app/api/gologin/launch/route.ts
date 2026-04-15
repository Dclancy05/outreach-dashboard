import { NextRequest, NextResponse } from 'next/server'

const GOLOGIN_API = 'https://api.gologin.com'

export async function POST(req: NextRequest) {
  try {
    const { profileId } = await req.json()
    if (!profileId) {
      return NextResponse.json({ error: 'profileId is required' }, { status: 400 })
    }

    const token = process.env.GOLOGIN_API_TOKEN
    if (!token) {
      return NextResponse.json({ error: 'GOLOGIN_API_TOKEN not configured' }, { status: 500 })
    }

    const res = await fetch(`${GOLOGIN_API}/browser/${profileId}/web`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: `GoLogin API error: ${res.status}`, details: text },
        { status: 502 }
      )
    }

    const data = await res.json()

    return NextResponse.json({
      status: data.status,
      browserUrl: data.remoteOrbitaUrl,
      profileId,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
