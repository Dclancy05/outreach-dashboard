import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export function throwOnError<T>(result: { data: T | null; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []) as NonNullable<T>
}

export function calculatePlatformScores(data: Record<string, unknown>): Record<string, number> {
  const scores: Record<string, number> = {}
  const flat: Record<string, unknown> = { ...data }
  for (const key of Object.keys(data)) {
    if (typeof data[key] === "object" && data[key] !== null && !Array.isArray(data[key])) {
      Object.assign(flat, data[key] as Record<string, unknown>)
    }
  }

  const igFollowers = Number(flat.ig_followers) || 0
  if (igFollowers > 0) {
    let s = 0
    if (igFollowers > 100) s++
    if (igFollowers > 500) s++
    if (igFollowers > 2000) s++
    if (Number(flat.ig_engagement_rate) > 2) s++
    if (Number(flat.ig_posts_count) > 10) s++
    scores.ig_score = Math.min(s, 5)
  }

  const fbFollowers = Number(flat.fb_followers) || Number(flat.fb_likes) || 0
  if (fbFollowers > 0) {
    let s = 0
    if (fbFollowers > 50) s++
    if (fbFollowers > 500) s++
    if (fbFollowers > 2000) s++
    if (flat.fb_about) s++
    if (flat.fb_last_post) s++
    scores.fb_score = Math.min(s, 5)
  }

  const liFollowers = Number(flat.li_followers) || 0
  if (liFollowers > 0 || flat.li_description) {
    let s = 0
    if (liFollowers > 50) s++
    if (liFollowers > 500) s++
    if (flat.li_description) s++
    if (Number(flat.li_employee_count) > 5) s++
    if (flat.li_last_post) s++
    scores.li_score = Math.min(s, 5)
  }

  const platformScores: number[] = []
  if (scores.ig_score != null) platformScores.push(scores.ig_score)
  if (scores.fb_score != null) platformScores.push(scores.fb_score)
  if (scores.li_score != null) platformScores.push(scores.li_score)

  let totalScore = platformScores.length > 0
    ? platformScores.reduce((a, b) => a + b, 0) / platformScores.length
    : 0

  const googleRating = Number(flat.google_rating) || 0
  if (googleRating > 0) totalScore += Math.min(googleRating * 0.5, 2.5)
  const yelpRating = Number(flat.yelp_rating) || 0
  if (yelpRating > 0) totalScore += Math.min(yelpRating * 0.5, 2.5)
  if (flat.website_has_online_booking === true) totalScore += 1

  scores.total_score = Math.round(Math.min(totalScore, 10) * 10) / 10
  return scores
}

export async function logActivity(type: string, summary: string, details: Record<string, unknown> = {}, leadCount = 0, businessId = "default"): Promise<string> {
  const activityId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  throwOnError(
    await supabase.from("activity").insert({
      activity_id: activityId,
      type,
      status: "processing",
      summary,
      details: JSON.stringify(details),
      lead_count: String(leadCount),
      created_at: new Date().toISOString(),
      completed_at: "",
      business_id: businessId,
    })
  )
  return activityId
}

export async function updateActivity(activityId: string, updates: { status?: string; summary?: string; details?: Record<string, unknown> }) {
  const patch: Record<string, string> = {}
  if (updates.status) patch.status = updates.status
  if (updates.summary) patch.summary = updates.summary
  if (updates.details) patch.details = JSON.stringify(updates.details)
  if (updates.status === "completed" || updates.status === "failed") {
    patch.completed_at = new Date().toISOString()
  }
  await supabase.from("activity").update(patch).eq("activity_id", activityId)
}

/** Apply default pagination to list queries */
export function applyPagination(body: Record<string, unknown>): { limit: number; offset: number } {
  const limit = Number(body.limit) || 50
  const offset = Number(body.offset) || 0
  return { limit, offset }
}
