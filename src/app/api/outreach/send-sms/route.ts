import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

const GHL_API_KEY = "pit-a779c378-1685-4463-8738-b5eae8a3eade"
const GHL_LOCATION_ID = "NmH7aRBeDRq1Wo9qwOqq"
const GHL_BASE = "https://services.leadconnectorhq.com"

export async function POST(req: NextRequest) {
  try {
    const { phone, message, lead_id, campaign_id } = await req.json()

    if (!phone || !message) {
      return NextResponse.json({ error: "phone and message required" }, { status: 400 })
    }

    const formatted = phone.startsWith("+") ? phone : `+1${phone.replace(/\D/g, "")}`

    let contactId: string | null = null
    const searchRes = await fetch(
      `${GHL_BASE}/contacts/search/duplicate?locationId=${GHL_LOCATION_ID}&number=${encodeURIComponent(formatted)}`,
      { headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-07-28" } }
    )
    const searchData = await searchRes.json()
    contactId = searchData?.contact?.id || null

    if (!contactId) {
      const createRes = await fetch(`${GHL_BASE}/contacts/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GHL_API_KEY}`,
          "Content-Type": "application/json",
          Version: "2021-07-28",
        },
        body: JSON.stringify({
          locationId: GHL_LOCATION_ID,
          phone: formatted,
          source: "outreach-dashboard",
        }),
      })
      const createData = await createRes.json()
      contactId = createData?.contact?.id
    }

    if (!contactId) {
      return NextResponse.json({ error: "Failed to find/create GHL contact" }, { status: 500 })
    }

    const smsRes = await fetch(`${GHL_BASE}/conversations/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GHL_API_KEY}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      body: JSON.stringify({
        type: "SMS",
        contactId,
        message,
      }),
    })

    const smsData = await smsRes.json()

    if (lead_id) {
      await supabase.from("send_queue").insert({
        lead_id,
        campaign_id: campaign_id || null,
        platform: "sms",
        message_text: message,
        status: smsRes.ok ? "sent" : "failed",
        sent_at: smsRes.ok ? new Date().toISOString() : null,
        error: smsRes.ok ? null : JSON.stringify(smsData),
      })
    }

    if (!smsRes.ok) {
      return NextResponse.json({ error: "SMS send failed", details: smsData }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message_id: smsData?.messageId || smsData?.id,
      contact_id: contactId,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
