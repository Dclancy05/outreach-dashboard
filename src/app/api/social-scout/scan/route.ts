import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// This endpoint scans Reddit for matches based on active campaigns
// Can be called by a cron job or manually triggered
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const campaignId = body.campaign_id

    // Get active campaigns
    let query = supabase.from("scout_campaigns").select("*").eq("status", "active")
    if (campaignId) query = query.eq("id", campaignId)
    const { data: campaigns, error: campError } = await query
    if (campError) return NextResponse.json({ error: campError.message }, { status: 500 })
    if (!campaigns?.length) return NextResponse.json({ message: "No active campaigns", scanned: 0 })

    let totalMatches = 0

    for (const campaign of campaigns) {
      const subreddits = campaign.subreddits || []
      const keywords = campaign.keywords || []

      if (!subreddits.length || !keywords.length) continue

      for (const subreddit of subreddits) {
        try {
          // Fetch recent posts from Reddit (public JSON API)
          const res = await fetch(
            `https://www.reddit.com/r/${subreddit}/new.json?limit=25`,
            {
              headers: { "User-Agent": "SocialScout/1.0" },
            }
          )
          if (!res.ok) continue

          const json = await res.json()
          const posts = json?.data?.children || []

          for (const post of posts) {
            const { id: postId, title, selftext, author, score, num_comments, permalink } = post.data
            const postUrl = `https://reddit.com${permalink}`

            // Check if already matched
            const { data: existing } = await supabase
              .from("scout_matches")
              .select("id")
              .eq("post_url", postUrl)
              .eq("campaign_id", campaign.id)
              .limit(1)

            if (existing?.length) continue

            // Check keyword match
            const fullText = `${title} ${selftext}`.toLowerCase()
            const matchedKw = keywords.filter((kw: string) => fullText.includes(kw.toLowerCase()))

            if (matchedKw.length === 0) continue

            // Insert match
            const { error: insertError } = await supabase.from("scout_matches").insert({
              campaign_id: campaign.id,
              platform: "reddit",
              post_url: postUrl,
              post_title: title,
              post_body: (selftext || "").slice(0, 2000),
              subreddit,
              author,
              score: score || 0,
              comment_count: num_comments || 0,
              matched_keywords: matchedKw,
              status: "pending",
            })

            if (!insertError) totalMatches++
          }
        } catch {
          // Skip failed subreddit
        }
      }

      // Update last scan time and match count
      await supabase
        .from("scout_campaigns")
        .update({
          last_scan_at: new Date().toISOString(),
          match_count: (campaign.match_count || 0) + totalMatches,
        })
        .eq("id", campaign.id)
    }

    return NextResponse.json({
      success: true,
      campaigns_scanned: campaigns.length,
      new_matches: totalMatches,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
