import { NextResponse } from "next/server"

/**
 * Instagram Publishing via Meta Graph API
 * Publishes content to Instagram Business accounts
 * 
 * ENV VARS NEEDED:
 * - META_APP_ID — your Meta Developer App ID
 * - META_APP_SECRET — your Meta Developer App Secret
 * 
 * Per-account: each outreach_account needs:
 * - ig_access_token — long-lived Instagram access token
 * - ig_user_id — Instagram Business account user ID  
 * - fb_page_id — linked Facebook Page ID
 * 
 * Setup Flow (VA Guide):
 * 1. Convert IG account to Business/Creator
 * 2. Create Facebook Page and link to IG
 * 3. Add IG account to Meta Developer App
 * 4. Generate access token via Graph API Explorer
 * 5. Exchange for long-lived token (60 days)
 * 
 * Meta Graph API docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
 */

const META_APP_ID = process.env.META_APP_ID || ""
const META_APP_SECRET = process.env.META_APP_SECRET || ""
const GRAPH_API_URL = "https://graph.facebook.com/v21.0"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { content_id, ig_user_id, ig_access_token, caption, media_url, content_type } = body

    if (!ig_access_token || !ig_user_id) {
      return NextResponse.json({
        error: "Missing ig_access_token or ig_user_id",
        placeholder: true,
        message: "Instagram publishing not configured for this account. Complete the VA Setup Guide first.",
        setup_needed: true,
      }, { status: 200 })
    }

    if (!media_url) {
      return NextResponse.json({ error: "Missing media_url — generate media first" }, { status: 400 })
    }

    // Step 1: Create media container
    const containerParams: Record<string, string> = {
      access_token: ig_access_token,
      caption: caption || "",
    }

    if (content_type === "reel" || content_type === "story") {
      containerParams.video_url = media_url
      containerParams.media_type = content_type === "reel" ? "REELS" : "STORIES"
    } else {
      containerParams.image_url = media_url
    }

    const containerRes = await fetch(
      `${GRAPH_API_URL}/${ig_user_id}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(containerParams),
      }
    )

    if (!containerRes.ok) {
      const err = await containerRes.json()
      return NextResponse.json({
        error: `Meta API error creating container: ${err.error?.message || JSON.stringify(err)}`,
        code: err.error?.code,
      }, { status: 502 })
    }

    const container = await containerRes.json()
    const containerId = container.id

    // Step 2: Wait for container to be ready (for videos)
    if (content_type === "reel" || content_type === "story") {
      // In production, poll this status until FINISHED
      // For now, return the container ID for async polling
      return NextResponse.json({
        success: true,
        content_id,
        container_id: containerId,
        status: "processing",
        message: "Video container created. Poll status before publishing.",
      })
    }

    // Step 3: Publish the container
    const publishRes = await fetch(
      `${GRAPH_API_URL}/${ig_user_id}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: ig_access_token,
        }),
      }
    )

    if (!publishRes.ok) {
      const err = await publishRes.json()
      return NextResponse.json({
        error: `Meta API error publishing: ${err.error?.message || JSON.stringify(err)}`,
      }, { status: 502 })
    }

    const published = await publishRes.json()

    return NextResponse.json({
      success: true,
      content_id,
      ig_media_id: published.id,
      status: "posted",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
