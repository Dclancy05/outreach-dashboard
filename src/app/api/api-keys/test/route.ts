/**
 * /api/api-keys/test — POST { id } → live-probe the value at that row.
 * Reads the raw value server-side; never returns it.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { runKeyProbe } from "@/lib/key-probes"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 })
  }

  const id = typeof body.id === "string" ? body.id : ""
  if (!id) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("api_keys")
    .select("env_var, value")
    .eq("id", id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "key not found" }, { status: 404 })
  }
  if (!data.value) {
    return NextResponse.json({ ok: false, error: "value is empty" })
  }

  try {
    const result = await runKeyProbe(data.env_var as string, data.value as string)
    return NextResponse.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "probe failed"
    return NextResponse.json({ ok: false, error: msg })
  }
}
