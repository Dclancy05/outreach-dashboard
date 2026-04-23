import { NextRequest, NextResponse } from "next/server"
import { signAdminSession } from "@/lib/session-crypto"
import { rateLimit, ipFromRequest } from "@/lib/rate-limit"
import crypto from "crypto"

export const runtime = "nodejs"

function constantTimeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

export async function POST(req: NextRequest) {
  const ip = ipFromRequest(req)
  const rl = rateLimit(`verify-pin:${ip}`, 5, 10 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) } }
    )
  }

  try {
    const { pin } = await req.json()
    const adminPin = process.env.ADMIN_PIN

    if (!adminPin) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
    }

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "PIN required" }, { status: 400 })
    }

    if (!constantTimeEq(pin, adminPin)) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 })
    }

    const token = signAdminSession()
    const res = NextResponse.json({ success: true })
    res.cookies.set("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    })
    return res
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
}
