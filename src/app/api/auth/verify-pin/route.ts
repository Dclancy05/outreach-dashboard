import { NextRequest, NextResponse } from "next/server"
import { signAdminSession } from "@/lib/session-crypto"
import { ipFromRequest, rateLimitAuthDb, retryAfterHeaders } from "@/lib/rate-limit"
import { auditLogAsync } from "@/lib/audit"
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
  const ua = req.headers.get("user-agent")
  const rl = await rateLimitAuthDb(ip, "verify-pin")
  if (!rl.ok) {
    auditLogAsync({ action: "POST /api/auth/verify-pin", resource: "/api/auth/verify-pin", payload: { rate_limited: true }, ip, ua })
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: retryAfterHeaders(rl.resetAt) }
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
      auditLogAsync({ action: "auth.admin_login_failed", resource: "/api/auth/verify-pin", ip, ua })
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
    auditLogAsync({ user_id: "admin", action: "auth.admin_login", resource: "/api/auth/verify-pin", ip, ua })
    return res
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
}
