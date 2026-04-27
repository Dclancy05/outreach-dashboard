import { NextRequest, NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

/**
 * P5.1 — Multi-platform single-session control plane.
 *
 * POST /api/vnc/session/[id]/open-tab
 *   body: { platform?: string, url?: string }
 *
 * Asks the VNC Manager to open an additional tab inside an existing Chrome
 * session (the one identified by [id]). This is the "IG + X + LinkedIn in one
 * browser window" primitive Dylan wanted: dashboard/worker first creates a
 * single session (POST /api/vnc/session with the primary platform), then
 * calls this route for every additional social to pop a new tab.
 *
 * If the caller passes `platform`, we resolve it to the social's root URL so
 * the worker doesn't need to hardcode URLs.
 */
const PLATFORM_URLS: Record<string, string> = {
  instagram: "https://www.instagram.com/",
  ig:        "https://www.instagram.com/",
  facebook:  "https://www.facebook.com/",
  fb:        "https://www.facebook.com/",
  linkedin:  "https://www.linkedin.com/feed/",
  li:        "https://www.linkedin.com/feed/",
  twitter:   "https://twitter.com/home",
  x:         "https://twitter.com/home",
  tiktok:    "https://www.tiktok.com/",
  youtube:   "https://www.youtube.com/",
  snapchat:  "https://web.snapchat.com/",
  pinterest: "https://www.pinterest.com/",
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}))
    const { platform, url } = body as { platform?: string; url?: string }

    const targetUrl = url || (platform ? PLATFORM_URLS[platform.toLowerCase()] : undefined)
    if (!targetUrl) {
      return NextResponse.json({ error: "platform or url required" }, { status: 400 })
    }

    const VNC_MANAGER_URL = (await getSecret("VNC_MANAGER_URL")) || "http://127.0.0.1:18790"
    const VNC_API_KEY = (await getSecret("VNC_API_KEY")) || ""
    const res = await fetch(`${VNC_MANAGER_URL}/sessions/${params.id}/tabs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": VNC_API_KEY },
      body: JSON.stringify({ url: targetUrl, platform }),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "VNC Manager unreachable" }, { status: 502 })
  }
}
