import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Generic handles that shouldn't count as duplicates
const GENERIC_HANDLES = new Set([
  "squarespace", "linktree", "linktr.ee", "facebook", "google", "yelp",
  "instagram", "twitter", "tiktok", "youtube", "pinterest", "snapchat",
  "wix", "wordpress", "godaddy", "weebly", "shopify", "etsy",
  "doordash", "grubhub", "ubereats", "postmates", "yelp.com",
  "yellowpages", "bbb", "angieslist", "homeadvisor", "thumbtack",
  "nextdoor", "mapquest", "foursquare", "tripadvisor",
])

function extractIGHandle(url: string): string {
  return url.toLowerCase().replace(/\/$/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/[?#].*/, "").replace(/^@/, "")
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[''`]/g, "").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1).fill(0)
    row[0] = i
    return row
  })
  for (let j = 1; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function namesAreSimilar(a: string, b: string): boolean {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (na === nb) return true
  if (na.substring(0, 5) === nb.substring(0, 5)) return true
  if (levenshtein(na, nb) < 3) return true
  return false
}

function extractDomain(url: string): string {
  try {
    let u = url.trim()
    if (!u.match(/^https?:\/\//)) u = "https://" + u
    const hostname = new URL(u).hostname.replace(/^www\./, "").toLowerCase()
    return hostname
  } catch {
    return url.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/[/?#].*/, "").trim()
  }
}

type Confidence = "exact" | "likely" | "possible"

interface DuplicateGroup {
  match_type: string
  match_value: string
  confidence: Confidence
  leads: { lead_id: string; name: string; city: string; status: string }[]
}

interface LeadRow {
  lead_id: string; name: string; city: string; state: string; status: string;
  instagram_url: string; email: string; phone: string; website: string; business_id: string
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const businessId = url.searchParams.get("business_id")
    
    let query = supabase.from("leads").select("lead_id, name, city, state, status, instagram_url, email, phone, website, business_id")
    if (businessId) query = query.eq("business_id", businessId)
    
    const { data: leads, error } = await query
    if (error) throw new Error(error.message)
    if (!leads?.length) return NextResponse.json({ success: true, duplicates: [], count: 0 })
    
    const groups: DuplicateGroup[] = []
    const seenPairs = new Set<string>() // track lead pairs already grouped
    
    const toLead = (l: LeadRow) => ({ lead_id: l.lead_id, name: l.name, city: l.city, status: l.status })
    
    // 1. Instagram handle (skip generic handles)
    const byIG: Record<string, LeadRow[]> = {}
    for (const lead of leads as LeadRow[]) {
      if (lead.instagram_url) {
        const handle = extractIGHandle(lead.instagram_url)
        if (!handle || handle.length < 2 || GENERIC_HANDLES.has(handle)) continue
        if (!byIG[handle]) byIG[handle] = []
        byIG[handle].push(lead)
      }
    }
    for (const [key, dupes] of Object.entries(byIG)) {
      if (dupes.length > 1) {
        groups.push({ match_type: "instagram", match_value: key, confidence: "exact", leads: dupes.map(toLead) })
        for (let i = 0; i < dupes.length; i++)
          for (let j = i + 1; j < dupes.length; j++)
            seenPairs.add([dupes[i].lead_id, dupes[j].lead_id].sort().join("|"))
      }
    }
    
    // 2. Email (exact match)
    const byEmail: Record<string, LeadRow[]> = {}
    for (const lead of leads as LeadRow[]) {
      if (lead.email) {
        const key = lead.email.toLowerCase().trim()
        if (!byEmail[key]) byEmail[key] = []
        byEmail[key].push(lead)
      }
    }
    for (const [key, dupes] of Object.entries(byEmail)) {
      if (dupes.length > 1) {
        groups.push({ match_type: "email", match_value: key, confidence: "exact", leads: dupes.map(toLead) })
      }
    }
    
    // 3. Website/URL domain dedup
    const byDomain: Record<string, LeadRow[]> = {}
    for (const lead of leads as LeadRow[]) {
      if (lead.website) {
        const domain = extractDomain(lead.website)
        if (domain && domain.length > 3 && !domain.includes("facebook.") && !domain.includes("instagram.") && !domain.includes("yelp.") && !domain.includes("google.")) {
          if (!byDomain[domain]) byDomain[domain] = []
          byDomain[domain].push(lead)
        }
      }
    }
    for (const [key, dupes] of Object.entries(byDomain)) {
      if (dupes.length > 1) {
        groups.push({ match_type: "website", match_value: key, confidence: "exact", leads: dupes.map(toLead) })
      }
    }
    
    // 4. Name+City fuzzy match
    const leadsList = leads as LeadRow[]
    for (let i = 0; i < leadsList.length; i++) {
      for (let j = i + 1; j < leadsList.length; j++) {
        const a = leadsList[i], b = leadsList[j]
        if (!a.name || !b.name || !a.city || !b.city) continue
        const pairKey = [a.lead_id, b.lead_id].sort().join("|")
        if (seenPairs.has(pairKey)) continue
        
        const cityA = a.city.toLowerCase().trim()
        const cityB = b.city.toLowerCase().trim()
        if (cityA !== cityB) continue
        
        const nameA = normalizeName(a.name)
        const nameB = normalizeName(b.name)
        if (nameA === nameB) {
          groups.push({ match_type: "name_city", match_value: `${a.name} | ${a.city}`, confidence: "exact", leads: [toLead(a), toLead(b)] })
          seenPairs.add(pairKey)
        } else if (levenshtein(nameA, nameB) <= 2) {
          groups.push({ match_type: "name_city", match_value: `${a.name} ≈ ${b.name} | ${a.city}`, confidence: "likely", leads: [toLead(a), toLead(b)] })
          seenPairs.add(pairKey)
        } else if (nameA.substring(0, 6) === nameB.substring(0, 6) && nameA.length > 5) {
          groups.push({ match_type: "name_city", match_value: `${a.name} ~ ${b.name} | ${a.city}`, confidence: "possible", leads: [toLead(a), toLead(b)] })
          seenPairs.add(pairKey)
        }
      }
    }
    
    // 5. Phone — only flag if names are also similar
    const byPhone: Record<string, LeadRow[]> = {}
    for (const lead of leadsList) {
      if (lead.phone) {
        const key = lead.phone.replace(/\D/g, "")
        if (key.length >= 7) {
          if (!byPhone[key]) byPhone[key] = []
          byPhone[key].push(lead)
        }
      }
    }
    for (const [key, dupes] of Object.entries(byPhone)) {
      if (dupes.length > 1) {
        // Group only those with similar names
        for (let i = 0; i < dupes.length; i++) {
          for (let j = i + 1; j < dupes.length; j++) {
            const pairKey = [dupes[i].lead_id, dupes[j].lead_id].sort().join("|")
            if (seenPairs.has(pairKey)) continue
            if (namesAreSimilar(dupes[i].name || "", dupes[j].name || "")) {
              groups.push({
                match_type: "phone",
                match_value: key,
                confidence: "likely",
                leads: [toLead(dupes[i]), toLead(dupes[j])],
              })
              seenPairs.add(pairKey)
            }
          }
        }
      }
    }
    
    // Sort: exact first, then likely, then possible
    const order: Record<Confidence, number> = { exact: 0, likely: 1, possible: 2 }
    groups.sort((a, b) => order[a.confidence] - order[b.confidence])
    
    return NextResponse.json({ success: true, duplicates: groups, count: groups.length })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, lead_ids, keep_id } = body
    
    if (action === "merge") {
      if (!keep_id || !lead_ids?.length) return NextResponse.json({ error: "Provide keep_id and lead_ids" }, { status: 400 })
      
      const deleteIds = lead_ids.filter((id: string) => id !== keep_id)
      if (deleteIds.length === 0) return NextResponse.json({ success: true, deleted: 0 })
      
      const { data: keepLead } = await supabase.from("leads").select("*").eq("lead_id", keep_id).single()
      const { data: dupes } = await supabase.from("leads").select("*").in("lead_id", deleteIds)
      
      if (keepLead && dupes?.length) {
        const updates: Record<string, string> = {}
        const fields = ["email", "phone", "website", "instagram_url", "facebook_url", "linkedin_url", "business_type", "notes"]
        for (const field of fields) {
          if (!keepLead[field]) {
            for (const dupe of dupes) {
              if (dupe[field]) { updates[field] = dupe[field]; break }
            }
          }
        }
        const allTags = new Set<string>()
        for (const lead of [keepLead, ...dupes]) {
          if (lead.tags) lead.tags.split(",").map((t: string) => t.trim()).filter(Boolean).forEach((t: string) => allTags.add(t))
        }
        if (allTags.size > 0) updates.tags = [...allTags].join(",")
        
        if (Object.keys(updates).length > 0) {
          await supabase.from("leads").update(updates).eq("lead_id", keep_id)
        }
      }
      
      const { error } = await supabase.from("leads").delete().in("lead_id", deleteIds)
      if (error) throw new Error(error.message)
      
      return NextResponse.json({ success: true, deleted: deleteIds.length, kept: keep_id })
    }
    
    if (action === "delete") {
      if (!lead_ids?.length) return NextResponse.json({ error: "Provide lead_ids" }, { status: 400 })
      const { error } = await supabase.from("leads").delete().in("lead_id", lead_ids)
      if (error) throw new Error(error.message)
      return NextResponse.json({ success: true, deleted: lead_ids.length })
    }
    
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
