import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function apifyToken(): Promise<string> {
  return (
    (await getSecret("APIFY_TOKEN")) ||
    (await getSecret("APIFY_API_TOKEN")) ||
    ""
  )
}

function extractUsername(url: string, platform: string): string {
  if (!url) return ""
  try {
    const path = new URL(url).pathname.replace(/\/$/, "")
    return path.split("/").filter(Boolean).pop() || ""
  } catch {
    if (platform === "instagram") return url.replace(/.*instagram\.com\//, "").replace(/[\/?#].*/, "")
    if (platform === "facebook") return url.replace(/.*facebook\.com\//, "").replace(/[\/?#].*/, "")
    return url
  }
}

async function scrapeInstagram(username: string): Promise<Record<string, unknown>> {
  const APIFY_TOKEN = await apifyToken()
  if (!APIFY_TOKEN) throw new Error("APIFY_API_TOKEN not configured")

  const res = await fetch("https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=" + APIFY_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames: [username],
      resultsLimit: 1,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Apify IG error ${res.status}: ${err}`)
  }

  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return {}

  const profile = data[0]
  return {
    ig_username: profile.username || username,
    ig_followers: profile.followersCount || 0,
    ig_following: profile.followsCount || 0,
    ig_posts_count: profile.postsCount || 0,
    ig_bio: profile.biography || "",
    ig_full_name: profile.fullName || "",
    ig_is_business: profile.isBusinessAccount || false,
    ig_business_category: profile.businessCategoryName || "",
    ig_external_url: profile.externalUrl || "",
    ig_is_verified: profile.verified || false,
    ig_profile_pic: profile.profilePicUrlHD || profile.profilePicUrl || "",
    // Recent posts summary
    ig_last_post: profile.latestPosts?.[0]?.timestamp || "",
    ig_last_caption: (profile.latestPosts?.[0]?.caption || "").slice(0, 500),
    ig_recent_topics: (profile.latestPosts || []).slice(0, 3).map((p: Record<string, unknown>) => (p.caption as string || "").slice(0, 100)).join(" | "),
  }
}

async function scrapeFacebook(urlOrUsername: string): Promise<Record<string, unknown>> {
  const APIFY_TOKEN = await apifyToken()
  if (!APIFY_TOKEN) throw new Error("APIFY_API_TOKEN not configured")

  // Use the Facebook Pages Scraper
  const res = await fetch("https://api.apify.com/v2/acts/apify~facebook-pages-scraper/run-sync-get-dataset-items?token=" + APIFY_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startUrls: [{ url: urlOrUsername.startsWith("http") ? urlOrUsername : `https://www.facebook.com/${urlOrUsername}` }],
      resultsLimit: 1,
    }),
  })

  if (!res.ok) {
    // Facebook scraper may not be available — return empty rather than fail
    console.error(`Apify FB error ${res.status}: ${await res.text()}`)
    return {}
  }

  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return {}

  const page = data[0]
  return {
    fb_name: page.name || "",
    fb_followers: page.likes || page.followers || 0,
    fb_about: (page.about || page.description || "").slice(0, 500),
    fb_category: page.categories?.join(", ") || page.category || "",
    fb_website: page.website || "",
    fb_phone: page.phone || "",
    fb_address: page.address || "",
    fb_last_post: page.posts?.[0]?.time || "",
    fb_last_post_text: (page.posts?.[0]?.text || "").slice(0, 500),
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { lead_ids, platforms } = body as { lead_ids: string[]; platforms?: string[] }

    if (!lead_ids?.length) {
      return NextResponse.json({ success: false, error: "No lead_ids provided" }, { status: 400 })
    }

    // Fetch leads
    const { data: leads, error } = await supabase
      .from("leads")
      .select("lead_id, name, instagram_url, facebook_url, _raw_scrape_data")
      .in("lead_id", lead_ids)

    if (error) throw new Error(error.message)
    if (!leads?.length) return NextResponse.json({ success: false, error: "No leads found" })

    const scrapeIG = !platforms || platforms.includes("instagram")
    const scrapeFB = !platforms || platforms.includes("facebook")

    const results: { lead_id: string; name: string; scraped: string[]; errors: string[] }[] = []

    for (const lead of leads) {
      const scraped: string[] = []
      const errors: string[] = []
      let existingData: Record<string, unknown> = {}

      try {
        existingData = lead._raw_scrape_data
          ? (typeof lead._raw_scrape_data === "string" ? JSON.parse(lead._raw_scrape_data) : lead._raw_scrape_data)
          : {}
      } catch { /* ignore parse errors */ }

      // Instagram
      if (scrapeIG && lead.instagram_url) {
        const username = extractUsername(lead.instagram_url, "instagram")
        if (username) {
          try {
            const igData = await scrapeInstagram(username)
            Object.assign(existingData, igData)
            scraped.push("instagram")
          } catch (err) {
            errors.push(`IG: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
      }

      // Facebook
      if (scrapeFB && lead.facebook_url) {
        const fbIdentifier = lead.facebook_url
        try {
          const fbData = await scrapeFacebook(fbIdentifier)
          if (Object.keys(fbData).length > 0) {
            Object.assign(existingData, fbData)
            scraped.push("facebook")
          }
        } catch (err) {
          errors.push(`FB: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      // Save updated scrape data
      if (scraped.length > 0) {
        await supabase.from("leads").update({
          _raw_scrape_data: JSON.stringify(existingData),
          scraped_at: new Date().toISOString(),
        }).eq("lead_id", lead.lead_id)
      }

      results.push({ lead_id: lead.lead_id, name: lead.name || "", scraped, errors })
    }

    // 🔄 Auto-score all scraped leads
    const scrapedIds = results.filter(r => r.scraped.length > 0).map(r => r.lead_id)
    if (scrapedIds.length > 0) {
      try {
        const origin = request.headers.get("origin") || request.headers.get("referer")?.replace(/\/[^/]*$/, "") || ""
        const baseUrl = origin || `https://${request.headers.get("host")}`
        await fetch(`${baseUrl}/api/lead-scoring`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_ids: scrapedIds }),
        })
      } catch (scoreErr) {
        console.error("Auto-score after scrape failed:", scoreErr)
      }
    }

    const totalScraped = results.filter((r) => r.scraped.length > 0).length
    return NextResponse.json({
      success: true,
      message: `Scraped ${totalScraped}/${leads.length} leads (auto-scored)`,
      results,
    })
  } catch (error) {
    console.error("Scrape API error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
