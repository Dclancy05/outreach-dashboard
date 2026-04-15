import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const action = url.searchParams.get("action") || ""
  const niche = url.searchParams.get("niche") || ""
  const platform = url.searchParams.get("platform") || ""
  const style = url.searchParams.get("style") || ""
  const audit_type = url.searchParams.get("audit_type") || ""
  const lead_id = url.searchParams.get("lead_id") || ""

  try {
    switch (action) {
      case "pain_points": {
        if (!niche) return NextResponse.json({ error: "niche required" }, { status: 400 })
        const { data, error } = await supabase
          .from("niche_pain_points")
          .select("*")
          .eq("niche", niche)
          .order("severity", { ascending: true })
        if (error) throw error
        return NextResponse.json({ success: true, data })
      }

      case "openers": {
        let query = supabase.from("opener_templates").select("*")
        if (niche) query = query.or(`niche.eq.${niche},niche.is.null`)
        else query = query.is("niche", null)
        if (platform) query = query.eq("platform", platform)
        if (style) query = query.eq("style", style)
        const { data, error } = await query
        if (error) throw error
        return NextResponse.json({ success: true, data })
      }

      case "micro_audits": {
        let query = supabase.from("micro_audit_templates").select("*")
        if (niche) query = query.or(`niche.eq.${niche},niche.is.null`)
        else query = query.is("niche", null)
        if (audit_type) query = query.eq("audit_type", audit_type)
        const { data, error } = await query
        if (error) throw error
        return NextResponse.json({ success: true, data })
      }

      case "generate_opener": {
        if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 })

        // Get lead data
        const { data: lead, error: leadErr } = await supabase
          .from("leads")
          .select("*")
          .eq("lead_id", lead_id)
          .single()
        if (leadErr || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 })

        // Parse scrape data
        let scrape: Record<string, any> = {}
        try {
          scrape = lead._raw_scrape_data
            ? typeof lead._raw_scrape_data === "string"
              ? JSON.parse(lead._raw_scrape_data)
              : lead._raw_scrape_data
            : {}
        } catch { /* */ }

        // Determine niche key from business_type
        const bizType = (lead.business_type || "").toLowerCase()
        const nicheMap: Record<string, string> = {
          restaurant: "restaurants", cafe: "restaurants", pizza: "restaurants", bakery: "restaurants",
          contractor: "contractors", remodeling: "contractors", construction: "contractors",
          dentist: "dentists", dental: "dentists", orthodont: "dentists",
          barber: "barbers",
          gym: "gyms", fitness: "gyms", crossfit: "gyms", yoga: "gyms",
          pet: "pet_groomers", groomer: "pet_groomers", grooming: "pet_groomers",
          auto: "auto_shops", mechanic: "auto_shops",
          nail: "nail_salons", manicure: "nail_salons",
          photo: "photographers", videograph: "photographers",
          retail: "retail", boutique: "retail", shop: "retail",
          salon: "salons", hair: "salons", beauty: "salons",
          chiro: "chiropractors",
          "med spa": "med_spas", medspa: "med_spas", aesthet: "med_spas",
          law: "lawyers", attorney: "lawyers", legal: "lawyers",
          "real estate": "real_estate", realtor: "real_estate", realty: "real_estate",
          clean: "cleaning", maid: "cleaning", janitorial: "cleaning",
          hvac: "hvac_plumbers", plumb: "hvac_plumbers", heating: "hvac_plumbers",
          daycare: "daycares", childcare: "daycares", preschool: "daycares",
        }
        let leadNiche = ""
        for (const [keyword, nicheVal] of Object.entries(nicheMap)) {
          if (bizType.includes(keyword)) { leadNiche = nicheVal; break }
        }

        // Get templates (niche-specific + generic)
        let query = supabase.from("opener_templates").select("*")
        if (leadNiche) {
          query = query.or(`niche.eq.${leadNiche},niche.is.null`)
        } else {
          query = query.is("niche", null)
        }
        // Prefer ig templates but fall back to any
        const { data: templates } = await query
        if (!templates?.length) return NextResponse.json({ success: true, data: [] })

        // Pick 3 diverse openers (one per style if possible)
        const styles = ["direct", "value-drop", "compliment"]
        const picked: any[] = []
        for (const s of styles) {
          // Prefer niche-specific, then generic
          const match = templates.find(t => t.style === s && t.niche === leadNiche) ||
                       templates.find(t => t.style === s && !t.niche)
          if (match) picked.push(match)
        }
        // Fill up to 3 if needed
        for (const t of templates) {
          if (picked.length >= 3) break
          if (!picked.find(p => p.id === t.id)) picked.push(t)
        }

        // Fill variables
        const vars: Record<string, string> = {
          "{{name}}": lead.name?.split(" ")[0] || "there",
          "{{business_name}}": lead.name || scrape.ig_business_name || "",
          "{{business_type}}": lead.business_type || "business",
          "{{city}}": lead.city || "your area",
          "{{followers}}": scrape.ig_followers ? Number(scrape.ig_followers).toLocaleString() : "",
          "{{bio_snippet}}": scrape.ig_bio ? String(scrape.ig_bio).slice(0, 80) : "",
          "{{last_post_topic}}": scrape.ig_last_caption ? String(scrape.ig_last_caption).slice(0, 60) : "",
          "{{website_issue}}": "",
        }

        const filledOpeners = picked.map(t => {
          let filled = t.template
          for (const [key, val] of Object.entries(vars)) {
            filled = filled.replaceAll(key, val)
          }
          return {
            id: t.id,
            style: t.style,
            platform: t.platform,
            filled_text: filled,
            original_template: t.template,
          }
        })

        return NextResponse.json({ success: true, data: filledOpeners })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 })
  }
}
