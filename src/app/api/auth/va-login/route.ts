import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { signVaSession } from "@/lib/session-crypto"
import { rateLimit, ipFromRequest } from "@/lib/rate-limit"
import crypto from "crypto"

export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function constantTimeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

export async function POST(req: NextRequest) {
  const ip = ipFromRequest(req)
  const rl = rateLimit(`va-login:${ip}`, 5, 10 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) } }
    )
  }

  try {
    const { pin } = await req.json()

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "PIN required" }, { status: 400 })
    }

    const { data: members, error } = await supabase
      .from("team_members")
      .select("*")
      .eq("status", "active")

    if (error) {
      return NextResponse.json({ error: "Lookup failed" }, { status: 500 })
    }

    let matched: any = null
    for (const m of members || []) {
      if (m.pin_hash && typeof m.pin_hash === "string") {
        try {
          const { verifyPin } = await import("@/lib/pin-hash")
          if (await verifyPin(pin, m.pin_hash)) {
            matched = m
            break
          }
        } catch {}
      }
      if (!matched && m.pin && typeof m.pin === "string" && constantTimeEq(pin, m.pin)) {
        matched = m
        break
      }
    }

    if (!matched) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 })
    }

    const data = matched

    const [access, perms] = await Promise.all([
      supabase.from("team_business_access").select("business_id").eq("team_member_id", data.id),
      supabase.from("team_page_permissions").select("page_name, allowed").eq("team_member_id", data.id),
    ])

    const sessionData = {
      id: data.id,
      name: data.name,
      role: data.role,
      business_ids: (access.data || []).map((a: { business_id: string }) => a.business_id),
      permissions: (perms.data || []).reduce((acc: Record<string, boolean>, p: { page_name: string; allowed: boolean }) => {
        acc[p.page_name] = p.allowed
        return acc
      }, {}),
      exp: Date.now() + 1000 * 60 * 60 * 12,
    }

    const token = signVaSession(sessionData)
    const res = NextResponse.json({ success: true, data: sessionData })
    res.cookies.set("va_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 12,
      path: "/",
    })
    return res
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
}
