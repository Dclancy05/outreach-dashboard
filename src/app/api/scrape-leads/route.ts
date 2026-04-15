import { NextRequest, NextResponse } from "next/server"

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || ""

export async function POST(req: NextRequest) {
  const { location, business_type, limit = 20 } = await req.json()

  if (!location || !business_type) {
    return NextResponse.json({ error: "Location and business type required" }, { status: 400 })
  }

  const query = `${business_type} in ${location}`
  const results: Array<{
    name: string
    url: string
    description: string
    address: string
    phone: string
    email: string
    ig_handle: string
    website: string
  }> = []

  try {
    // Use Brave Search
    const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(limit, 20)}`
    const res = await fetch(searchUrl, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_API_KEY,
      },
    })

    if (!res.ok) {
      // Fallback: return placeholder data explaining API key needed
      return NextResponse.json({
        data: [],
        message: "Brave Search API key not configured. Add BRAVE_SEARCH_API_KEY to .env.local",
      })
    }

    const data = await res.json()
    const webResults = data.web?.results || []

    for (const r of webResults.slice(0, limit)) {
      // Extract basic info from search results
      const entry = {
        name: r.title || "",
        url: r.url || "",
        description: (r.description || "").slice(0, 300),
        address: "",
        phone: "",
        email: "",
        ig_handle: "",
        website: r.url || "",
      }

      // Try to extract phone from description
      const phoneMatch = entry.description.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)
      if (phoneMatch) entry.phone = phoneMatch[0]

      // Try to extract email
      const emailMatch = entry.description.match(/[\w.-]+@[\w.-]+\.\w+/)
      if (emailMatch) entry.email = emailMatch[0]

      results.push(entry)
    }

    // Also search for local results
    const localUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query + " contact phone email")}&count=10`
    const localRes = await fetch(localUrl, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_API_KEY,
      },
    })

    if (localRes.ok) {
      const localData = await localRes.json()
      for (const r of localData.web?.results || []) {
        const exists = results.find(e => e.url === r.url)
        if (!exists && results.length < limit) {
          results.push({
            name: r.title || "",
            url: r.url || "",
            description: (r.description || "").slice(0, 300),
            address: "",
            phone: "",
            email: "",
            ig_handle: "",
            website: r.url || "",
          })
        }
      }
    }
  } catch (err) {
    return NextResponse.json({
      error: "Search failed",
      message: err instanceof Error ? err.message : String(err),
      data: [],
    })
  }

  return NextResponse.json({ data: results, count: results.length })
}
