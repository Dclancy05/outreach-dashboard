import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const LATE_API_KEY = "sk_546633e01d1e0942f6015a423965d0dccd66af0d364a3bcbe43bafeabc47e616"

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { cross_post_id } = body

  if (!cross_post_id) return NextResponse.json({ error: "Missing cross_post_id" }, { status: 400 })

  // Get the cross post
  const { data: post, error: fetchError } = await supabase
    .from("cross_posts")
    .select("*")
    .eq("id", cross_post_id)
    .single()

  if (fetchError || !post) return NextResponse.json({ error: "Post not found" }, { status: 404 })

  const platforms = post.platforms || []
  const results: Array<{ platform: string; status: string; error?: string; platform_post_id?: string }> = []

  for (const platform of platforms) {
    try {
      // Call Late API to publish
      const lateRes = await fetch("https://api.getlate.dev/v1/post/create", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LATE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: post.content,
          platforms: [platform],
          mediaUrls: post.media_url ? [post.media_url] : [],
          scheduledDate: post.schedule_at || undefined,
        }),
      })

      const lateData = await lateRes.json()

      if (lateRes.ok) {
        results.push({
          platform,
          status: "sent",
          platform_post_id: lateData.id || lateData.postId || null,
        })
      } else {
        results.push({
          platform,
          status: "failed",
          error: lateData.message || lateData.error || "Unknown error",
        })
      }
    } catch (err) {
      results.push({
        platform,
        status: "failed",
        error: String(err),
      })
    }
  }

  // Save results to cross_post_results
  for (const result of results) {
    await supabase.from("cross_post_results").insert({
      cross_post_id,
      platform: result.platform,
      status: result.status,
      platform_post_id: result.platform_post_id || null,
      error_message: result.error || null,
      sent_at: result.status === "sent" ? new Date().toISOString() : null,
    })
  }

  // Update cross_post status
  const allSent = results.every(r => r.status === "sent")
  const allFailed = results.every(r => r.status === "failed")
  await supabase
    .from("cross_posts")
    .update({ status: allSent ? "sent" : allFailed ? "failed" : "partial" })
    .eq("id", cross_post_id)

  return NextResponse.json({ success: true, results })
}
