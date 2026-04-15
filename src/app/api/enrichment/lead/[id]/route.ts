import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY || ""

async function braveSearch(query: string) {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
    { headers: { Accept: "application/json", "X-Subscription-Token": BRAVE_API_KEY } }
  )
  if (!res.ok) throw new Error(`Brave API ${res.status}`)
  const data = await res.json()
  return data.web?.results || []
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const { data: lead, error } = await supabase.from("leads").select("*").eq("lead_id", id).single()
    if (error || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 })

    const changes: Record<string, string> = {}
    const log: string[] = []

    // Website scrape
    if (lead.website) {
      try {
        const res = await fetch(lead.website, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; enrichment-bot/1.0)" },
          signal: AbortSignal.timeout(10000),
          redirect: "follow",
        })
        const html = await res.text()

        const emailMatch = html.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)
        if (!lead.email && emailMatch?.[0]) {
          const junk = ["example.com", "wixpress.com", "w3.org"]
          const clean = emailMatch.filter((e: string) => !junk.some(j => e.includes(j)))
          if (clean.length) { changes.email = clean[0]; log.push(`email: ${clean[0]}`) }
        }

        const igMatch = html.match(/instagram\.com\/([a-zA-Z0-9_.]+)/i)
        if (!lead.instagram_url && igMatch && !["p", "reel", "explore"].includes(igMatch[1])) {
          changes.instagram_url = `https://instagram.com/${igMatch[1]}`
          log.push(`ig from website: ${igMatch[1]}`)
        }

        const fbMatch = html.match(/facebook\.com\/([a-zA-Z0-9_.]+)/i)
        if (!lead.facebook_url && fbMatch && !["sharer", "share", "plugins"].includes(fbMatch[1])) {
          changes.facebook_url = `https://facebook.com/${fbMatch[1]}`
          log.push(`fb from website: ${fbMatch[1]}`)
        }
      } catch { log.push("website fetch failed") }
    }

    // LinkedIn via Brave
    if (!lead.linkedin_url || /linkedin\.com\/company\//i.test(lead.linkedin_url)) {
      try {
        const results = await braveSearch(`${lead.name} ${lead.city || ""} linkedin owner founder`)
        for (const r of results) {
          if (/linkedin\.com\/in\/[a-zA-Z0-9_\-]+/i.test(r.url)) {
            const url = r.url.split("?")[0]
            if (/linkedin\.com\/company\//i.test(lead.linkedin_url)) {
              changes.linkedin_personal_url = url
            } else {
              changes.linkedin_url = url
            }
            log.push(`linkedin: ${url}`)
            break
          }
        }
      } catch { log.push("linkedin search failed") }
    }

    // Facebook via Brave
    if (!lead.facebook_url && !changes.facebook_url) {
      try {
        const results = await braveSearch(`"${lead.name}" "${lead.city || ""}" facebook`)
        for (const r of results) {
          if (/facebook\.com\/(?!sharer|share|dialog)[a-zA-Z0-9_.]+/i.test(r.url)) {
            changes.facebook_url = r.url.split("?")[0]
            log.push(`facebook: ${changes.facebook_url}`)
            break
          }
        }
      } catch { log.push("facebook search failed") }
    }

    // Instagram via Brave
    if (!lead.instagram_url && !changes.instagram_url) {
      try {
        const results = await braveSearch(`"${lead.name}" "${lead.city || ""}" instagram`)
        for (const r of results) {
          if (/instagram\.com\/(?!p\/|reel\/|explore)[a-zA-Z0-9_.]+/i.test(r.url)) {
            changes.instagram_url = r.url.split("?")[0]
            log.push(`instagram: ${changes.instagram_url}`)
            break
          }
        }
      } catch { log.push("instagram search failed") }
    }

    // Save
    if (Object.keys(changes).length > 0) {
      const enrichData = { enrichment_status: "enriched", enrichment_data: JSON.stringify(log), enriched_at: new Date().toISOString() }

      // Try new columns first
      const { error: updateErr } = await supabase.from("leads").update({ ...changes, ...enrichData }).eq("lead_id", id)
      if (updateErr?.message?.includes("enrichment_status")) {
        const existing = JSON.parse(lead.platform_profile || "{}")
        const update = { ...changes }
        delete (update as Record<string, string | undefined>).linkedin_personal_url
        ;(update as Record<string, string>).platform_profile = JSON.stringify({
          ...existing,
          ...enrichData,
          linkedin_personal_url: changes.linkedin_personal_url || existing.linkedin_personal_url || "",
        })
        await supabase.from("leads").update(update).eq("lead_id", id)
      }
    }

    return NextResponse.json({
      lead_id: id,
      changes,
      log,
      enriched: Object.keys(changes).length > 0,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
