import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SEARCH_QUERIES = [
  "appointment setter commission only remote",
  "warm leads outreach specialist remote commission",
  "reactivation specialist commission remote",
  "appointment setting commission only work from home",
  "remote outreach specialist commission based",
]

interface JobResult {
  title: string
  company: string
  description: string
  url: string
  source: string
  location: string
  pay_type: string
  match_score: number
}

function calculateMatchScore(title: string, description: string): number {
  const text = `${title} ${description}`.toLowerCase()
  let score = 0
  const keywords: [string, number][] = [
    ["commission", 20],
    ["commission only", 15],
    ["appointment setter", 15],
    ["appointment setting", 15],
    ["warm leads", 10],
    ["warm outreach", 10],
    ["reactivation", 10],
    ["remote", 10],
    ["outreach specialist", 10],
    ["no base", 5],
    ["zero risk", 5],
    ["commission based", 10],
  ]
  for (const [kw, pts] of keywords) {
    if (text.includes(kw)) score += pts
  }
  return Math.min(score, 100)
}

function detectPayType(text: string): string {
  const t = text.toLowerCase()
  if (t.includes("commission only") || t.includes("100% commission")) return "Commission Only"
  if (t.includes("commission") && t.includes("base")) return "Base + Commission"
  if (t.includes("commission")) return "Commission"
  return "Unknown"
}

function detectSource(url: string): string {
  if (url.includes("indeed.com")) return "Indeed"
  if (url.includes("linkedin.com")) return "LinkedIn"
  if (url.includes("ziprecruiter.com")) return "ZipRecruiter"
  if (url.includes("glassdoor.com")) return "Glassdoor"
  if (url.includes("monster.com")) return "Monster"
  return "Web"
}

export async function POST() {
  try {
    const allJobs: JobResult[] = []

    // Use Brave Search API via web fetch to find job listings
    for (const query of SEARCH_QUERIES) {
      try {
        const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query + " site:indeed.com OR site:linkedin.com OR site:ziprecruiter.com")}&count=10`
        
        const res = await fetch(searchUrl, {
          headers: {
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": process.env.BRAVE_API_KEY || "",
          },
        })

        if (res.ok) {
          const data = await res.json()
          const results = data.web?.results || []
          
          for (const r of results) {
            const title = r.title || ""
            const description = r.description || ""
            const url = r.url || ""
            
            // Skip non-job URLs
            if (!url.includes("indeed.com") && !url.includes("linkedin.com") && !url.includes("ziprecruiter.com") && !url.includes("glassdoor.com")) continue
            
            const matchScore = calculateMatchScore(title, description)
            if (matchScore < 15) continue // Skip low relevance
            
            allJobs.push({
              title: title.replace(/ - Indeed| \| LinkedIn| - ZipRecruiter/gi, "").trim(),
              company: extractCompany(title, description),
              description: description.slice(0, 2000),
              url,
              source: detectSource(url),
              location: "Remote",
              pay_type: detectPayType(`${title} ${description}`),
              match_score: matchScore,
            })
          }
        }
      } catch {
        // Continue with next query
      }

      // Also try direct Indeed scrape
      try {
        const indeedUrl = `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}&l=remote&fromage=7`
        const res = await fetch(indeedUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        })
        if (res.ok) {
          const html = await res.text()
          // Basic extraction from Indeed HTML
          const jobCards = html.match(/class="job_seen_beacon"[\s\S]*?<\/td>/g) || []
          for (const card of jobCards.slice(0, 5)) {
            const titleMatch = card.match(/title="([^"]+)"/)
            const companyMatch = card.match(/data-testid="company-name"[^>]*>([^<]+)/)
            const linkMatch = card.match(/href="(\/rc\/clk[^"]+)"/)
            if (titleMatch) {
              const t = titleMatch[1]
              const desc = card.replace(/<[^>]+>/g, " ").slice(0, 500)
              const score = calculateMatchScore(t, desc)
              if (score >= 15) {
                allJobs.push({
                  title: t,
                  company: companyMatch?.[1]?.trim() || "Unknown",
                  description: desc.trim(),
                  url: linkMatch ? `https://www.indeed.com${linkMatch[1]}` : indeedUrl,
                  source: "Indeed",
                  location: "Remote",
                  pay_type: detectPayType(`${t} ${desc}`),
                  match_score: score,
                })
              }
            }
          }
        }
      } catch {
        // Continue
      }
    }

    // Deduplicate by URL
    const seen = new Set<string>()
    const unique = allJobs.filter(j => {
      const key = j.url.replace(/[?#].*/, "")
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Check existing URLs to avoid duplicates in DB
    const urls = unique.map(j => j.url.replace(/[?#].*/, "").slice(0, 500))
    const { data: existing } = await supabase.from("job_listings").select("url")
    const existingUrls = new Set((existing || []).map((e: { url: string }) => e.url.replace(/[?#].*/, "")))

    const newJobs = unique.filter(j => !existingUrls.has(j.url.replace(/[?#].*/, "")))

    if (newJobs.length > 0) {
      const { error } = await supabase.from("job_listings").insert(
        newJobs.map(j => ({
          title: j.title,
          company: j.company,
          description: j.description,
          url: j.url,
          source: j.source,
          location: j.location,
          pay_type: j.pay_type,
          match_score: j.match_score,
          status: "new",
          scraped_at: new Date().toISOString(),
        }))
      )
      if (error) throw error
    }

    return NextResponse.json({
      success: true,
      found: unique.length,
      new: newJobs.length,
      total_queries: SEARCH_QUERIES.length,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("job_listings")
      .select("*")
      .order("match_score", { ascending: false })
      .order("scraped_at", { ascending: false })
      .limit(200)

    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 })
    
    const { error } = await supabase.from("job_listings").update(updates).eq("id", id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

function extractCompany(title: string, description: string): string {
  // Try to extract company name from common patterns
  const patterns = [
    /at\s+([A-Z][A-Za-z\s&]+?)(?:\s*[-–|]|$)/,
    /([A-Z][A-Za-z\s&]+?)\s+is\s+(?:hiring|looking|seeking)/,
    /^([A-Z][A-Za-z\s&]+?)\s*[-–|]/,
  ]
  for (const p of patterns) {
    const m = (title + " " + description).match(p)
    if (m?.[1] && m[1].length < 50) return m[1].trim()
  }
  return "Unknown"
}
