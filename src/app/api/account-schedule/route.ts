import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id")
  const startDate = req.nextUrl.searchParams.get("start_date") || new Date().toISOString().split("T")[0]
  const endDate = req.nextUrl.searchParams.get("end_date") || startDate

  let query = supabase
    .from("account_schedule")
    .select("*")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date")

  if (accountId) query = query.eq("account_id", accountId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also get accounts to show daily limits
  const accountIds = accountId ? [accountId] : [...new Set((data || []).map((d: { account_id: string }) => d.account_id))]
  const { data: accounts } = await supabase
    .from("accounts")
    .select("account_id, username, platform, daily_limit, warmup_sequence_id, warmup_day")
    .in("account_id", accountIds.length ? accountIds : ["__none__"])

  return NextResponse.json({
    data: data || [],
    accounts: accounts || [],
    date_range: { start: startDate, end: endDate },
  })
}
