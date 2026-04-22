import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/accounts/:id/fingerprint — returns the pinned fingerprint, or null.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const account_id = params.id
  if (!account_id) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("account_fingerprints")
    .select("*")
    .eq("account_id", account_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ fingerprint: data || null })
}
