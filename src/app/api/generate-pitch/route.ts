import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: Request) {
  try {
    const { job_id } = await req.json()
    if (!job_id) return NextResponse.json({ success: false, error: "Missing job_id" }, { status: 400 })

    // Fetch the job listing
    const { data: job, error: fetchError } = await supabase
      .from("job_listings")
      .select("*")
      .eq("id", job_id)
      .single()

    if (fetchError || !job) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 })
    }

    const bridgeUrl = process.env.CLAUDE_BRIDGE_URL || "http://localhost:3456"
    const bridgeKey = process.env.CLAUDE_BRIDGE_KEY || "claude-bridge-secret"

    const prompt = `Generate a compelling, concise application pitch/cover message for this job listing. The pitch is from Dylan, a college student at Baruch College in NYC.

Job Title: ${job.title}
Company: ${job.company}
Description: ${job.description}
Source: ${job.source}
Pay Type: ${job.pay_type}

Key points to include in the pitch:
- Dylan is a driven college student at Baruch College studying business
- He has hands-on experience with warm outreach, reactivation campaigns, and appointment setting
- He works commission-only, meaning ZERO risk for the company — they only pay when he delivers results
- He has a proven system for reaching out to warm/past leads and converting them into appointments
- He's available to start immediately and is highly motivated
- Keep it professional but personable, not too long (150-250 words)
- Make it specific to this job listing
- End with a clear call to action

Write ONLY the pitch message, no additional commentary.`

    const res = await fetch(bridgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${bridgeKey}`,
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Claude Bridge error: ${res.status} - ${errText.slice(0, 200)}`)
    }

    const result = await res.json()
    const pitch = result.content?.[0]?.text || result.choices?.[0]?.message?.content || result.text || ""

    if (!pitch) throw new Error("No pitch generated")

    // Save the pitch to the job listing
    await supabase
      .from("job_listings")
      .update({ generated_pitch: pitch })
      .eq("id", job_id)

    return NextResponse.json({ success: true, pitch })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
