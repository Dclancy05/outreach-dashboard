import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { account_id, lead_id, platform, message } = body

  if (!lead_id || !platform || !message) {
    return NextResponse.json({ error: "Missing required fields: lead_id, platform, message" }, { status: 400 })
  }

  // 1. Get lead info
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("lead_id", lead_id)
    .single()

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  // 2. Determine target username/URL
  let targetUsername = ""
  if (platform === "instagram") {
    targetUsername = (lead.instagram_url || "").replace(/.*instagram\.com\//, "").replace(/\/$/, "")
  } else if (platform === "facebook") {
    targetUsername = lead.facebook_url || ""
  } else if (platform === "linkedin") {
    targetUsername = lead.linkedin_url || ""
  }

  if (!targetUsername) {
    return NextResponse.json({ error: `No ${platform} URL for this lead` }, { status: 400 })
  }

  // 3. Check account daily limit if account provided
  let dailyLimit = 40
  let actualSends = 0
  const today = new Date().toISOString().split("T")[0]

  if (account_id) {
    const { data: account } = await supabase
      .from("accounts")
      .select("*")
      .eq("account_id", account_id)
      .single()

    dailyLimit = parseInt(account?.daily_limit || "40")

    const { data: schedule } = await supabase
      .from("account_schedule")
      .select("*")
      .eq("account_id", account_id)
      .eq("date", today)
      .single()

    actualSends = schedule?.actual_sends || 0

    if (actualSends >= dailyLimit) {
      // Create notification
      await supabase.from("notifications").insert({
        type: "account_warning",
        title: "Daily Limit Reached",
        message: `Account ${account?.username || account_id} hit daily limit (${actualSends}/${dailyLimit})`,
      })
      return NextResponse.json({ error: `Daily limit reached (${actualSends}/${dailyLimit})` }, { status: 403 })
    }
  }

  // 4. Insert into send_queue for VPS processing
  const queueId = `sq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  const { error: queueError } = await supabase.from("send_queue").insert({
    id: queueId,
    platform,
    lead_id,
    lead_name: lead.name || "",
    username_or_url: targetUsername,
    message,
    account_id: account_id || null,
    status: "pending",
  })

  if (queueError) {
    return NextResponse.json({ error: "Failed to queue send: " + queueError.message }, { status: 500 })
  }

  // 5. Also create a send_log entry
  const logId = `sl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  await supabase.from("send_log").insert({
    id: logId,
    campaign_id: body.campaign_id || "",
    account_id: account_id || "",
    lead_id,
    platform,
    message_text: message,
    template_id: body.template_id || "",
    status: "queued",
    follow_up_of: body.follow_up_of || "",
  })

  // 6. Log to manual_sends for backward compat
  await supabase.from("manual_sends").insert({
    send_id: `ms_${Date.now()}`,
    lead_id,
    platform,
    template_id: body.template_id || "",
    message_body: message,
    sent_at: new Date().toISOString(),
    business_id: body.business_id || "default",
  })

  // 7. Update lead status
  await supabase
    .from("leads")
    .update({ status: "contacted", updated_at: new Date().toISOString() })
    .eq("lead_id", lead_id)

  return NextResponse.json({
    success: true,
    queue_id: queueId,
    log_id: logId,
    status: "queued",
    message: "Message queued for sending. The VPS processor will send it shortly.",
    sends_today: actualSends + 1,
    daily_limit: dailyLimit,
  })
}

// GET - check status of a queued send
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const queueId = searchParams.get("queue_id")
  
  if (queueId) {
    const { data } = await supabase
      .from("send_queue")
      .select("*")
      .eq("id", queueId)
      .single()
    return NextResponse.json({ data })
  }

  // Return recent queue items
  const { data } = await supabase
    .from("send_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20)

  return NextResponse.json({ data })
}
