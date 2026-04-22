import { NextResponse } from "next/server"
import { authenticator } from "otplib"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const { secret } = await request.json()
    if (!secret || typeof secret !== "string") {
      return NextResponse.json({ error: "Missing secret" }, { status: 400 })
    }

    const cleaned = secret.replace(/\s+/g, "").toUpperCase()
    if (!/^[A-Z2-7]+=*$/.test(cleaned)) {
      return NextResponse.json({ error: "Invalid base32 secret" }, { status: 400 })
    }

    authenticator.options = { window: 1, digits: 6, step: 30 }
    const code = authenticator.generate(cleaned)
    const epoch = Math.floor(Date.now() / 1000)
    const remaining = 30 - (epoch % 30)

    return NextResponse.json({ code, remaining, step: 30 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "TOTP generation failed" }, { status: 500 })
  }
}
