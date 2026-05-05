import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    // Get total leads
    const { count: total } = await supabase.from("leads").select("*", { count: "exact", head: true })

    // Check if enrichment columns exist
    const { data: testLead } = await supabase.from("leads").select("enrichment_status").limit(1)
    const hasEnrichmentColumns = !!testLead

    let enriched = 0, pending = 0, failed = 0
    let needsLinkedin = 0, needsFacebook = 0, needsInstagram = 0, needsEmail = 0

    if (hasEnrichmentColumns) {
      const { count: e } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("enrichment_status", "enriched")
      const { count: f } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("enrichment_status", "failed")
      enriched = e || 0
      failed = f || 0
      pending = (total || 0) - enriched - failed
    } else {
      // Count by checking platform_profile for enrichment_status
      const { data: allLeads } = await supabase.from("leads").select("platform_profile, linkedin_url, facebook_url, instagram_url, email, website")
      for (const lead of allLeads || []) {
        try {
          const profile = JSON.parse(lead.platform_profile || "{}")
          if (profile.enrichment_status === "enriched") enriched++
          else if (profile.enrichment_status === "failed") failed++
          else pending++
        } catch { pending++ }

        if (!lead.linkedin_url || /linkedin\.com\/company\//i.test(lead.linkedin_url)) needsLinkedin++
        if (!lead.facebook_url) needsFacebook++
        if (!lead.instagram_url) needsInstagram++
        if (!lead.email && lead.website) needsEmail++
      }
    }

    // Count leads with company LinkedIn pages
    const { data: companyLeads } = await supabase.from("leads").select("linkedin_url").ilike("linkedin_url", "%/company/%")
    const companyPages = companyLeads?.length || 0

    // Count missing fields
    if (hasEnrichmentColumns) {
      const { count: nl } = await supabase.from("leads").select("*", { count: "exact", head: true }).or("linkedin_url.eq.,linkedin_url.is.null")
      const { count: nf } = await supabase.from("leads").select("*", { count: "exact", head: true }).or("facebook_url.eq.,facebook_url.is.null")
      const { count: ni } = await supabase.from("leads").select("*", { count: "exact", head: true }).or("instagram_url.eq.,instagram_url.is.null")
      needsLinkedin = (nl || 0) + companyPages
      needsFacebook = nf || 0
      needsInstagram = ni || 0
    }

    return NextResponse.json({
      total: total || 0,
      enriched,
      pending,
      failed,
      company_linkedin_pages: companyPages,
      needs_linkedin: needsLinkedin,
      needs_facebook: needsFacebook,
      needs_instagram: needsInstagram,
      needs_email: needsEmail,
      has_enrichment_columns: hasEnrichmentColumns,
      brave_api_configured: !!(await getSecret("BRAVE_SEARCH_API_KEY")) || !!(await getSecret("BRAVE_API_KEY")),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
