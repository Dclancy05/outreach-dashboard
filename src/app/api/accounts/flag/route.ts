import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED = new Set(["active", "paused", "banned", "cooldown", "warming", "pending_setup", "flagged"])

export async function POST(request: Request) {
  try {
    const { account_id, status, reason } = await request.json()
    if (!account_id) return NextResponse.json({ error: "Missing account_id" }, { status: 400 })
    if (!status || !ALLOWED.has(status))
      return NextResponse.json({ error: `Invalid status. Use: ${Array.from(ALLOWED).join(", ")}` }, { status: 400 })

    const updates: Record<string, unknown> = { status }
    if (status === "cooldown") updates.cooldown_until = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    if (status === "active") updates.cooldown_until = ""
    if (reason) {
      const { data: current } = await supabase.from("accounts").select("notes").eq("account_id", account_id).maybeSingle()
      const prior = current?.notes || ""
      updates.notes = `[${new Date().toISOString().slice(0, 16)}] ${status}: ${reason}\n${prior}`.slice(0, 2000)
    }

    const { error } = await supabase.from("accounts").update(updates).eq("account_id", String(account_id))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
