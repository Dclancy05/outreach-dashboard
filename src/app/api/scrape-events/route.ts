import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || ""
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { location = "NYC", type = "business networking" } = await req.json()

  const events: Array<{
    name: string
    url: string
    location: string
    date: string | null
    source: string
    description: string
  }> = []

  try {
    // Search Eventbrite
    const ebQuery = `site:eventbrite.com ${type} events ${location}`
    const ebRes = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(ebQuery)}&count=10`,
      { headers: { "Accept": "application/json", "X-Subscription-Token": BRAVE_API_KEY } }
    )
    if (ebRes.ok) {
      const ebData = await ebRes.json()
      for (const r of ebData.web?.results || []) {
        events.push({
          name: r.title?.replace(/ \| Eventbrite/i, "") || "",
          url: r.url || "",
          location: location,
          date: null,
          source: "eventbrite",
          description: (r.description || "").slice(0, 500),
        })
      }
    }

    // Search Meetup
    const muQuery = `site:meetup.com ${type} ${location}`
    const muRes = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(muQuery)}&count=10`,
      { headers: { "Accept": "application/json", "X-Subscription-Token": BRAVE_API_KEY } }
    )
    if (muRes.ok) {
      const muData = await muRes.json()
      for (const r of muData.web?.results || []) {
        events.push({
          name: r.title?.replace(/ \| Meetup/i, "") || "",
          url: r.url || "",
          location: location,
          date: null,
          source: "meetup",
          description: (r.description || "").slice(0, 500),
        })
      }
    }
  } catch (err) {
    return NextResponse.json({
      error: "Event search failed",
      message: err instanceof Error ? err.message : String(err),
      data: [],
    })
  }

  // Save to events table
  if (events.length > 0) {
    for (const evt of events) {
      try {
        await supabase.from("events").upsert(
          { name: evt.name, url: evt.url, location: evt.location, source: evt.source, description: evt.description },
          { onConflict: "url" }
        )
      } catch {
        // Ignore dupe errors
      }
    }
  }

  return NextResponse.json({ data: events, count: events.length })
}
