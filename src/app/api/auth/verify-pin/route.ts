import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json()
    const adminPin = process.env.ADMIN_PIN

    if (!adminPin) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
    }

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "PIN required" }, { status: 400 })
    }

    if (pin === adminPin) {
      const res = NextResponse.json({ success: true })
      // Set httpOnly cookie for admin session (24h expiry)
      res.cookies.set("admin_session", "authenticated", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24,
        path: "/",
      })
      return res
    }

    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 })
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
}
