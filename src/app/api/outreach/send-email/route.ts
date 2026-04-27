import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

const INSTANTLY_BASE = "https://api.instantly.ai/api/v1"

export async function POST(req: NextRequest) {
  try {
    const { to_email, subject, body: emailBody, from_email, lead_id, campaign_id } = await req.json()

    if (!to_email || !emailBody) {
      return NextResponse.json({ error: "to_email and body required" }, { status: 400 })
    }

    const INSTANTLY_API_KEY = (await getSecret("INSTANTLY_API_KEY")) || ""

    if (!INSTANTLY_API_KEY) {
      if (lead_id) {
        await supabase.from("send_queue").insert({
          lead_id,
          campaign_id: campaign_id || null,
          platform: "email",
          message_text: emailBody,
          status: "queued",
          error: "Instantly API key not configured",
        })
      }

      return NextResponse.json({
        success: false,
        pending: true,
        message: "Email queued. Instantly API key not configured yet. Add INSTANTLY_API_KEY to environment variables.",
      }, { status: 200 })
    }

    const emailRes = await fetch(`${INSTANTLY_BASE}/unibox/emails/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${INSTANTLY_API_KEY}`,
      },
      body: JSON.stringify({
        from_email: from_email || "",
        to_email,
        subject: subject || "Quick question",
        body: emailBody,
      }),
    })

    const emailData = await emailRes.json()

    if (lead_id) {
      await supabase.from("send_queue").insert({
        lead_id,
        campaign_id: campaign_id || null,
        platform: "email",
        message_text: emailBody,
        status: emailRes.ok ? "sent" : "failed",
        sent_at: emailRes.ok ? new Date().toISOString() : null,
        error: emailRes.ok ? null : JSON.stringify(emailData),
      })
    }

    if (!emailRes.ok) {
      return NextResponse.json({ error: "Email send failed", details: emailData }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: emailData })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
