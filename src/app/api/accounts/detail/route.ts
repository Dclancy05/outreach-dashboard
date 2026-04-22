import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { authenticator } from "otplib"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: Request) {
  try {
    const { account_id } = await request.json()
    if (!account_id) return NextResponse.json({ error: "Missing account_id" }, { status: 400 })

    const { data: account, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("account_id", String(account_id))
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 })

    let totp: { code: string; remaining: number } | null = null
    if (account.twofa_secret) {
      try {
        const cleaned = String(account.twofa_secret).replace(/\s+/g, "").toUpperCase()
        if (/^[A-Z2-7]+=*$/.test(cleaned)) {
          authenticator.options = { window: 1, digits: 6, step: 30 }
          const code = authenticator.generate(cleaned)
          const epoch = Math.floor(Date.now() / 1000)
          totp = { code, remaining: 30 - (epoch % 30) }
        }
      } catch {}
    }

    const hasSession = Boolean(account.session_cookie && String(account.session_cookie).length > 10)
    let sessionAge: number | null = null
    if (hasSession && account.last_used_at) {
      sessionAge = Math.floor((Date.now() - new Date(account.last_used_at).getTime()) / 86400000)
    }

    const [proxyRes, warmupRes, sendsRes] = await Promise.all([
      account.proxy_group_id
        ? supabase.from("proxy_groups").select("*").eq("id", account.proxy_group_id).maybeSingle()
        : Promise.resolve({ data: null }),
      account.warmup_sequence_id
        ? supabase.from("warmup_sequences").select("*").eq("id", account.warmup_sequence_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("send_log")
        .select("*")
        .eq("account_id", account.account_id)
        .order("sent_at", { ascending: false })
        .limit(25),
    ])

    const recentSends = (sendsRes as any).data || []
    const failureCount = recentSends.filter((s: any) => s.status === "failed" || s.status === "error").length
    const consecFailures = (() => {
      let c = 0
      for (const s of recentSends) {
        if (s.status === "failed" || s.status === "error") c++
        else break
      }
      return c
    })()

    const flagSignals: string[] = []
    if (account.status === "banned") flagSignals.push("Marked as banned")
    if (account.status === "cooldown") flagSignals.push("On cooldown")
    if (consecFailures >= 3) flagSignals.push(`${consecFailures} consecutive send failures`)
    if (recentSends.length >= 10 && failureCount / recentSends.length > 0.5)
      flagSignals.push(`${Math.round((failureCount / recentSends.length) * 100)}% failure rate`)
    if (sessionAge !== null && sessionAge > 30) flagSignals.push(`No activity in ${sessionAge} days`)

    return NextResponse.json({
      account,
      totp,
      session: { hasCookie: hasSession, ageDays: sessionAge },
      proxy: (proxyRes as any).data || null,
      warmup: (warmupRes as any).data || null,
      recentSends,
      flags: { signals: flagSignals, needsAttention: flagSignals.length > 0 },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
