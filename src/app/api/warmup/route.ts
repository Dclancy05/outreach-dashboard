import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/warmup — list warmup sequences. Each row is enriched with
// `accounts_count`, the number of accounts currently using that sequence.
// The Accounts page renders this as a "Used by N" pill so Dylan can see at
// a glance which sequences are live before deleting one.
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("business_id") || ""

  let query = supabase.from("warmup_sequences").select("*").order("created_at", { ascending: false })
  if (businessId) query = query.or(`business_id.eq.${businessId},business_id.eq.default`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sequences = data || []
  const ids = sequences.map((s: any) => s.id).filter(Boolean)

  // Single round-trip: pull every account row whose warmup_sequence_id is
  // in the result set, then bucket-count them in memory. Cheap because the
  // `accounts` table is at most a few hundred rows per business.
  const counts: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: usage, error: usageErr } = await supabase
      .from("accounts")
      .select("warmup_sequence_id")
      .in("warmup_sequence_id", ids)

    if (usageErr) {
      // Soft-fail: we'd rather return sequences with `accounts_count: 0`
      // than blow up the whole list because the count query glitched.
      console.warn("[warmup GET] usage count failed:", usageErr.message)
    } else {
      for (const row of usage || []) {
        const id = (row as any).warmup_sequence_id
        if (!id) continue
        counts[id] = (counts[id] || 0) + 1
      }
    }
  }

  const enriched = sequences.map((s: any) => ({
    ...s,
    accounts_count: counts[s.id] || 0,
  }))

  return NextResponse.json({ data: enriched })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === "create") {
    const id = `ws_${Date.now().toString(36)}`
    const row = {
      id,
      name: body.name || "New Sequence",
      platform: body.platform || "",
      business_id: body.business_id || "default",
      steps: body.steps || [],
    }
    const { error } = await supabase.from("warmup_sequences").insert(row)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: row })
  }

  if (action === "update") {
    const { id, ...updates } = body
    delete updates.action
    const { error } = await supabase.from("warmup_sequences").update(updates).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "delete") {
    const { error } = await supabase.from("warmup_sequences").delete().eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "duplicate") {
    // Clone an existing sequence so Dylan can tweak a copy without losing
    // the original's tuned step values. Appends " (Copy)" to the name and
    // keeps the same business_id + platform + steps.
    const { id } = body
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    const { data: source, error: srcErr } = await supabase
      .from("warmup_sequences")
      .select("*")
      .eq("id", id)
      .maybeSingle()

    if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 })
    if (!source) return NextResponse.json({ error: "Source sequence not found" }, { status: 404 })

    const newId = `ws_${Date.now()}`
    const row = {
      id: newId,
      name: `${source.name || "Sequence"} (Copy)`,
      platform: source.platform || "",
      business_id: source.business_id || "default",
      steps: source.steps || [],
    }
    const { error } = await supabase.from("warmup_sequences").insert(row)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: row })
  }

  if (action === "assign") {
    // Assign warmup sequence to an account
    const { account_id, warmup_sequence_id } = body
    if (!account_id) return NextResponse.json({ error: "Missing account_id" }, { status: 400 })

    const { error } = await supabase
      .from("accounts")
      .update({ warmup_sequence_id: warmup_sequence_id || "", warmup_day: 1 })
      .eq("account_id", account_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
