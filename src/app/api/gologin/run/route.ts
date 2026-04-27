import { NextRequest, NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"

const GOLOGIN_API = "https://api.gologin.com/browser"

export async function POST(req: NextRequest) {
  const TOKEN = await getSecret("GOLOGIN_API_TOKEN")
  if (!TOKEN) {
    return NextResponse.json({ error: "GOLOGIN_API_TOKEN not configured" }, { status: 500 })
  }

  try {
    const { profileId } = await req.json()
    if (!profileId) {
      return NextResponse.json({ error: "profileId is required" }, { status: 400 })
    }

    const headers = {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    }

    // Step 1: Get all profiles to find and stop any running sessions
    // GoLogin Pro has a limit on concurrent cloud sessions
    try {
      const listRes = await fetch(`${GOLOGIN_API}/v2?limit=100`, { headers, cache: "no-store" })
      if (listRes.ok) {
        const listData = await listRes.json()
        const profileIds = (listData.profiles || []).map((p: any) => p.id)
        
        // Try to stop all other profiles (ignore errors — they may not be running)
        const stopPromises = profileIds
          .filter((id: string) => id !== profileId)
          .map((id: string) =>
            fetch(`${GOLOGIN_API}/${id}/web`, {
              method: "DELETE",
              headers,
            }).catch(() => null)
          )
        
        // Wait for stops with a short timeout
        await Promise.race([
          Promise.allSettled(stopPromises),
          new Promise(resolve => setTimeout(resolve, 5000)),
        ])
      }
    } catch {
      // Non-critical — continue with launch attempt
    }

    // Step 2: Also stop this profile in case it's in a stale state
    try {
      await fetch(`${GOLOGIN_API}/${profileId}/web`, {
        method: "DELETE",
        headers,
      })
    } catch {}

    // Step 3: Small delay for GoLogin to clean up
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Step 4: Start cloud browser session with timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    try {
      const res = await fetch(`${GOLOGIN_API}/${profileId}/web`, {
        method: "POST",
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!res.ok) {
        const text = await res.text()
        let errorMsg = `GoLogin error (${res.status})`
        
        // Parse common errors
        if (text.includes("limit") || text.includes("concurrent")) {
          errorMsg = "Cloud browser session limit reached. Try stopping other browsers first."
        } else if (text.includes("already running")) {
          errorMsg = "This profile is already running. Click Stop & Save first."
        } else if (res.status === 429) {
          errorMsg = "Too many requests. Wait a moment and try again."
        } else {
          try {
            const parsed = JSON.parse(text)
            errorMsg = parsed.message || parsed.error || errorMsg
          } catch {
            errorMsg = text || errorMsg
          }
        }

        return NextResponse.json({ error: errorMsg }, { status: res.status })
      }

      const data = await res.json()
      return NextResponse.json(data)
    } catch (e) {
      clearTimeout(timeout)
      if (e instanceof Error && e.name === "AbortError") {
        return NextResponse.json(
          { error: "Launch timed out. GoLogin may be busy — try again in a moment." },
          { status: 504 }
        )
      }
      throw e
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    )
  }
}
