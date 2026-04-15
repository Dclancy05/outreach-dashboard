import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY || ""

// Rate limiting
let lastBraveRequest = 0
const RATE_LIMIT_MS = 1100

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function braveSearch(query: string): Promise<Array<{ url: string; title: string; description: string }>> {
  const now = Date.now()
  if (now - lastBraveRequest < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - (now - lastBraveRequest))
  }
  lastBraveRequest = Date.now()

  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
    { headers: { Accept: "application/json", "X-Subscription-Token": BRAVE_API_KEY } }
  )
  if (!res.ok) throw new Error(`Brave API ${res.status}`)
  const data = await res.json()
  return data.web?.results || []
}

function extractLinkedInPersonalUrl(results: Array<{ url: string }>) {
  for (const r of results) {
    if (/linkedin\.com\/in\/[a-zA-Z0-9_\-]+/i.test(r.url)) return r.url.split("?")[0]
  }
  return null
}

function extractFacebookUrl(results: Array<{ url: string }>) {
  for (const r of results) {
    if (/facebook\.com\/(?!sharer|share|dialog|plugins|tr|login|help)[a-zA-Z0-9_.]+/i.test(r.url)) return r.url.split("?")[0]
  }
  return null
}

function extractInstagramUrl(results: Array<{ url: string }>) {
  for (const r of results) {
    if (/instagram\.com\/(?!p\/|reel\/|explore|accounts|stories)[a-zA-Z0-9_.]+/i.test(r.url)) return r.url.split("?")[0]
  }
  return null
}

function extractEmails(html: string): string[] {
  const matches = html.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || []
  const junk = ["example.com", "domain.com", "wixpress.com", "googleapis.com", "w3.org", "schema.org", "wordpress.org"]
  return [...new Set(matches.filter(e => !junk.some(j => e.toLowerCase().includes(j)) && !/\.(png|jpg|js|css)$/.test(e)))]
}

function extractPhones(html: string): string[] {
  const text = html.replace(/<[^>]+>/g, " ")
  const matches = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || []
  return [...new Set(matches.map(p => p.trim()))]
}

interface Lead {
  lead_id: string
  name: string
  city: string
  state: string
  website: string
  email: string
  phone: string
  instagram_url: string
  facebook_url: string
  linkedin_url: string
  platform_profile: string
  [key: string]: string | number | null
}

async function enrichSingleLead(lead: Lead) {
  const changes: Record<string, string> = {}
  const log: { searched: string[]; found: string[] } = { searched: [], found: [] }

  // Website scrape
  if (lead.website) {
    log.searched.push("website")
    try {
      const res = await fetch(lead.website, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; enrichment-bot/1.0)" },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      })
      const html = await res.text()

      if (!lead.email) {
        const emails = extractEmails(html)
        if (emails.length) { changes.email = emails[0]; log.found.push("email") }
      }
      if (!lead.phone) {
        const phones = extractPhones(html)
        if (phones.length) { changes.phone = phones[0]; log.found.push("phone") }
      }

      // Social links from website
      const igMatch = html.match(/https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)/i)
      if (!lead.instagram_url && igMatch && !["p", "reel", "explore"].includes(igMatch[1])) {
        changes.instagram_url = `https://instagram.com/${igMatch[1]}`
        log.found.push("instagram_from_website")
      }
      const fbMatch = html.match(/https?:\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9_.]+)/i)
      if (!lead.facebook_url && fbMatch && !["sharer", "share", "plugins"].includes(fbMatch[1])) {
        changes.facebook_url = `https://facebook.com/${fbMatch[1]}`
        log.found.push("facebook_from_website")
      }
    } catch { /* website fetch failed, continue */ }
  }

  // LinkedIn
  if (!lead.linkedin_url || /linkedin\.com\/company\//i.test(lead.linkedin_url)) {
    log.searched.push("linkedin")
    try {
      const q = `${lead.name} ${lead.city || ""} linkedin owner founder CEO`
      const results = await braveSearch(q)
      const url = extractLinkedInPersonalUrl(results)
      if (url) {
        if (/linkedin\.com\/company\//i.test(lead.linkedin_url)) {
          changes.linkedin_personal_url = url
        } else {
          changes.linkedin_url = url
        }
        log.found.push("linkedin")
      }
    } catch { /* */ }
  }

  // Facebook
  if (!lead.facebook_url && !changes.facebook_url) {
    log.searched.push("facebook")
    try {
      const results = await braveSearch(`"${lead.name}" "${lead.city || ""}" facebook`)
      const url = extractFacebookUrl(results)
      if (url) { changes.facebook_url = url; log.found.push("facebook") }
    } catch { /* */ }
  }

  // Instagram
  if (!lead.instagram_url && !changes.instagram_url) {
    log.searched.push("instagram")
    try {
      const results = await braveSearch(`"${lead.name}" "${lead.city || ""}" instagram`)
      const url = extractInstagramUrl(results)
      if (url) { changes.instagram_url = url; log.found.push("instagram") }
    } catch { /* */ }
  }

  return { changes, log }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const leadIds = body.lead_ids as string[] | undefined
    const batchSize = Math.min(body.batch_size || 50, 200)

    // Get leads to enrich
    let query = supabase.from("leads").select("*")

    if (leadIds?.length) {
      query = query.in("lead_id", leadIds)
    } else {
      // Get leads that need enrichment
      query = query.order("total_score", { ascending: false }).limit(batchSize)
    }

    const { data: allLeads, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Filter to leads that actually need enrichment
    const leads = (allLeads || []).filter((lead: Lead) => {
      try {
        const profile = JSON.parse(lead.platform_profile || "{}")
        if (profile.enrichment_status === "enriched") return false
      } catch { /* */ }
      const needsSomething = !lead.linkedin_url || /linkedin\.com\/company\//i.test(lead.linkedin_url) ||
        !lead.facebook_url || !lead.instagram_url || (!lead.email && lead.website)
      return needsSomething
    })

    if (!leads.length) {
      return NextResponse.json({ message: "No leads need enrichment", total: 0, enriched: 0 })
    }

    // Process in background-ish (respond immediately with job info, process async)
    let enriched = 0, failed = 0

    for (const lead of leads) {
      try {
        const result = await enrichSingleLead(lead as Lead)
        if (Object.keys(result.changes).length > 0) {
          // Save changes
          const update: Record<string, string> = { ...result.changes }

          // Handle linkedin_personal_url via platform_profile if column doesn't exist
          const enrichData = {
            enrichment_status: "enriched",
            enrichment_data: result.log,
            enriched_at: new Date().toISOString(),
            linkedin_personal_url: result.changes.linkedin_personal_url || "",
          }

          // Try direct columns first
          const { error: updateErr } = await supabase.from("leads").update({
            ...update,
            enrichment_status: "enriched",
            enrichment_data: JSON.stringify(result.log),
            enriched_at: new Date().toISOString(),
          }).eq("lead_id", lead.lead_id)

          if (updateErr?.message?.includes("enrichment_status")) {
            // Columns don't exist — use platform_profile
            const existing = JSON.parse(lead.platform_profile || "{}")
            update.platform_profile = JSON.stringify({ ...existing, ...enrichData })
            delete update.linkedin_personal_url
            await supabase.from("leads").update(update).eq("lead_id", lead.lead_id)
          }

          enriched++
        }
      } catch {
        failed++
      }
    }

    return NextResponse.json({
      message: `Enriched ${enriched} of ${leads.length} leads`,
      total: leads.length,
      enriched,
      failed,
      skipped: leads.length - enriched - failed,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
