import { NextRequest, NextResponse } from "next/server"

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY || ""

interface BraveResult {
  title: string
  url: string
  description: string
}

interface BraveResponse {
  web?: {
    results?: BraveResult[]
  }
}

const CONTENT_TYPES = ["reel", "carousel", "image", "carousel", "reel"] as const

export async function POST(req: NextRequest) {
  try {
    const { brandId, niche, tone } = await req.json()

    if (!niche) {
      return NextResponse.json({ success: false, error: "niche is required" }, { status: 400 })
    }

    const now = new Date()
    const month = now.toLocaleString("en-US", { month: "long" })
    const year = now.getFullYear()

    if (!BRAVE_API_KEY) {
      return NextResponse.json({ success: false, error: "BRAVE_SEARCH_API_KEY missing on server" }, { status: 500 })
    }

    const queries = [
      `${niche} trending content ideas ${month} ${year}`,
      `${niche} viral posts`,
      `${niche} content strategy`,
    ]

    const allResults: BraveResult[] = []

    for (const query of queries) {
      try {
        const res = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
          {
            headers: {
              Accept: "application/json",
              "Accept-Encoding": "gzip",
              "X-Subscription-Token": BRAVE_API_KEY,
            },
          }
        )
        if (res.ok) {
          const data: BraveResponse = await res.json()
          if (data.web?.results) {
            allResults.push(...data.web.results)
          }
        }
      } catch {
        // skip failed queries
      }
    }

    // Deduplicate by URL and parse into ideas
    const seen = new Set<string>()
    const ideas = allResults
      .filter((r) => {
        if (seen.has(r.url)) return false
        seen.add(r.url)
        return true
      })
      .slice(0, 10)
      .map((r, i) => ({
        id: `idea-${brandId || "new"}-${Date.now()}-${i}`,
        brand_id: brandId || null,
        title: r.title.replace(/ - .*$/, "").replace(/\|.*$/, "").trim().slice(0, 80),
        description: r.description.slice(0, 200),
        source_url: r.url,
        content_type: CONTENT_TYPES[i % CONTENT_TYPES.length],
        status: "pending" as const,
        created_at: new Date().toISOString(),
      }))

    return NextResponse.json({ success: true, ideas, count: ideas.length })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    )
  }
}
