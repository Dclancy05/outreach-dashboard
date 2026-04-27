import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import * as crypto from "crypto"
import { getSecret } from "@/lib/secrets"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * AI Video Generation API
 *
 * Uses Kling AI with JWT auth (access key + secret key).
 * Free tier: ~66 videos/month.
 * Falls back to manual queue if no keys configured.
 */

// Generate JWT token for Kling API auth
async function generateKlingJWT(): Promise<string> {
  const KLING_ACCESS_KEY = (await getSecret("KLING_ACCESS_KEY")) || ""
  const KLING_SECRET_KEY = (await getSecret("KLING_SECRET_KEY")) || ""
  const header = { alg: "HS256", typ: "JWT" }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: KLING_ACCESS_KEY,
    exp: now + 1800, // 30 min expiry
    nbf: now - 5,
    iat: now,
  }
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url")
  const unsigned = `${b64(header)}.${b64(payload)}`
  const sig = crypto.createHmac("sha256", KLING_SECRET_KEY).update(unsigned).digest("base64url")
  return `${unsigned}.${sig}`
}

// GET: List video generations
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")
  const limit = parseInt(searchParams.get("limit") || "50")

  let query = supabase
    .from("video_generations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (status && status !== "all") {
    query = query.eq("status", status)
  }

  const { data, error } = await query
  if (error) {
    // Table might not exist yet
    if (error.message.includes("video_generations")) {
      return NextResponse.json({ data: [], count: 0, table_missing: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data || [], count: (data || []).length })
}

// POST: Create a new video generation request
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { prompt, style, duration, aspect_ratio, content_id } = body

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    const id = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()
    const KLING_ACCESS_KEY = (await getSecret("KLING_ACCESS_KEY")) || ""
    const KLING_SECRET_KEY = (await getSecret("KLING_SECRET_KEY")) || ""
    const KLING_API_URL = (await getSecret("KLING_API_URL")) || "https://api.klingai.com"

    const record = {
      id,
      prompt: prompt.trim(),
      style: style || "promo",
      duration: duration || 10,
      aspect_ratio: aspect_ratio || "9:16",
      status: "queued",
      provider: (KLING_ACCESS_KEY && KLING_SECRET_KEY) ? "kling" : "manual",
      provider_task_id: "",
      video_url: "",
      thumbnail_url: "",
      error_message: "",
      content_id: content_id || "",
      business_id: "default",
      created_at: now,
      updated_at: now,
      completed_at: "",
    }

    // Save to Supabase
    const { error: insertError } = await supabase.from("video_generations").insert(record)
    if (insertError) {
      return NextResponse.json({ error: insertError.message, table_missing: insertError.message.includes("video_generations") }, { status: 500 })
    }

    // If Kling keys are configured, submit to Kling
    if (KLING_ACCESS_KEY && KLING_SECRET_KEY) {
      try {
        const jwt = await generateKlingJWT()
        const klingRes = await fetch(`${KLING_API_URL}/v1/videos/text2video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            prompt: record.prompt,
            duration: record.duration,
            aspect_ratio: record.aspect_ratio,
            model: "kling-v1",
          }),
        })

        if (klingRes.ok) {
          const result = await klingRes.json()
          const taskId = result.task_id || result.id || ""

          await supabase.from("video_generations").update({
            status: "generating",
            provider_task_id: taskId,
            updated_at: new Date().toISOString(),
          }).eq("id", id)

          return NextResponse.json({
            success: true,
            id,
            status: "generating",
            provider: "kling",
            task_id: taskId,
          })
        } else {
          const errText = await klingRes.text()
          await supabase.from("video_generations").update({
            status: "failed",
            error_message: `Kling API: ${errText.slice(0, 200)}`,
            updated_at: new Date().toISOString(),
          }).eq("id", id)

          return NextResponse.json({
            success: false,
            id,
            status: "failed",
            error: `Kling API error: ${errText.slice(0, 200)}`,
          })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error"
        await supabase.from("video_generations").update({
          status: "failed",
          error_message: msg,
          updated_at: new Date().toISOString(),
        }).eq("id", id)

        return NextResponse.json({ success: false, id, status: "failed", error: msg })
      }
    }

    // No API key — stored as queued for manual processing
    return NextResponse.json({
      success: true,
      id,
      status: "queued",
      provider: "manual",
      message: "Video request queued. No AI provider configured — add KLING_API_KEY to .env.local for auto-generation.",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE: Remove a video generation
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const { error } = await supabase.from("video_generations").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
