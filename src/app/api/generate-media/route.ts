import { NextResponse } from "next/server"

/**
 * Media Generation via Kling AI API
 * Generates videos and images for content posts
 * 
 * ENV VARS NEEDED:
 * - KLING_API_KEY — your Kling AI API key
 * - KLING_API_URL — Kling API base URL (default: https://api.klingai.com)
 * 
 * Kling AI docs: https://docs.klingai.com
 * Supports: text-to-video, text-to-image, image-to-video
 */

const KLING_API_KEY = process.env.KLING_API_KEY || ""
const KLING_API_URL = process.env.KLING_API_URL || "https://api.klingai.com"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { content_id, prompt, content_type, aspect_ratio } = body

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 })
    }

    if (!KLING_API_KEY) {
      return NextResponse.json({
        error: "KLING_API_KEY not configured",
        placeholder: true,
        message: "Media generation is not yet configured. Add KLING_API_KEY to your .env.local file.",
        content_id,
      }, { status: 200 })
    }

    // ── Video Generation (Reels/Stories) ──────────────────────────────
    if (content_type === "reel" || content_type === "story") {
      const res = await fetch(`${KLING_API_URL}/v1/videos/text2video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${KLING_API_KEY}`,
        },
        body: JSON.stringify({
          prompt,
          duration: content_type === "story" ? 15 : 30,
          aspect_ratio: aspect_ratio || "9:16",
          model: "kling-v1",
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        return NextResponse.json({ error: `Kling API error: ${text.slice(0, 200)}` }, { status: 502 })
      }

      const result = await res.json()
      return NextResponse.json({
        success: true,
        content_id,
        task_id: result.task_id || result.id,
        status: "generating",
        media_type: "video",
      })
    }

    // ── Image Generation (Posts/Carousels) ────────────────────────────
    const res = await fetch(`${KLING_API_URL}/v1/images/text2image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KLING_API_KEY}`,
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: aspect_ratio || "1:1",
        model: "kling-v1",
        n: content_type === "carousel" ? 4 : 1,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Kling API error: ${text.slice(0, 200)}` }, { status: 502 })
    }

    const result = await res.json()
    return NextResponse.json({
      success: true,
      content_id,
      task_id: result.task_id || result.id,
      status: "generating",
      media_type: "image",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
