import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json()

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "PIN required" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("team_members")
      .select("*")
      .eq("pin", pin)
      .eq("status", "active")
      .single()

    if (error || !data) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 })
    }

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
      exp: Date.now() + 1000 * 60 * 60 * 12, // 12h expiry
    }

    const res = NextResponse.json({ success: true, data: sessionData })
    // Set httpOnly cookie with VA session
    res.cookies.set("va_session", JSON.stringify(sessionData), {
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
