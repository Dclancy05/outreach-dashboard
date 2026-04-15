import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { parseStepPlatformAction, isNonMessageAction } from "@/lib/platform-profile"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface GenerateJob {
  lead_id: string
  sequence_id: string
  approach_id: string
  approach_name?: string
  prompt_file: string
  ab_test_id?: string
}

// ── FREE TEMPLATE ENGINE (ZERO API COST) ─────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── APPROACH-AWARE TONE SYSTEM ───────────────────────────────────────────────
// Each approach maps to a "tone" that selects different template banks.

type Tone = "casual" | "professional" | "reactivation"

function detectTone(approach: Record<string, unknown>): Tone {
  const name = String(approach.name || "").toLowerCase()
  const desc = String(approach.description || "").toLowerCase()
  const file = String(approach.prompt_file || "").toLowerCase()
  const combined = `${name} ${desc} ${file}`

  if (combined.includes("reactivation") || combined.includes("offer") || combined.includes("campaign"))
    return "reactivation"
  if (combined.includes("professional") || combined.includes("agency") || combined.includes("formal") || combined.includes("direct"))
    return "professional"
  // Default: casual / student / friendly
  return "casual"
}

// ── OPENERS BY TONE + PLATFORM ───────────────────────────────────────────────

const OPENERS: Record<Tone, Record<string, string[]>> = {
  casual: {
    instagram: ["Hey! 👋", "Hi! ✨", "Hey hey! 🙌", "Hi there! 😊", "Hey! 🔥"],
    facebook: ["Hey! Hope you're having a great day!", "Hi there!", "Hey! 😊", "Hi! Quick message —", "Hello!"],
    linkedin: ["Hey — quick note.", "Hi there!", "Hi! Hope you're doing well.", "Hey there!", "Hi! I'll keep this short."],
  },
  professional: {
    instagram: ["Hi there!", "Hello! 👋", "Hi!", "Good afternoon!", "Hi — quick note."],
    facebook: ["Hello!", "Hi there — hope all's well.", "Good to connect!", "Hi!", "Hello — reaching out briefly."],
    linkedin: ["Hello —", "Hi there, hope your week is going well.", "Hi — I'll be brief.", "Hello! Quick intro.", "Hi there —"],
  },
  reactivation: {
    instagram: ["Hey! 👋", "Hi! Quick question —", "Hey there! 🔥", "Hi! Got something for you —", "Hey! ✨"],
    facebook: ["Hi there! Quick one for you —", "Hey! I have an idea for you.", "Hi! Something came to mind —", "Hello! Quick question —", "Hey! Thought of you."],
    linkedin: ["Hi — I have a quick idea.", "Hello — thought of you.", "Hi there — quick question.", "Hi! Reaching out with an idea.", "Hello — brief note."],
  },
}

// ── INITIAL DM TEMPLATES BY TONE ─────────────────────────────────────────────

const INITIAL_TEMPLATES: Record<Tone, Record<string, string[]>> = {
  casual: {
    instagram: [
      "{{opener}} Love what you're doing with {{name}}{{loc}}. {{hook}} — would love to chat about some ideas I had! 🚀",
      "{{opener}} Just came across {{name}} and {{hook}}. I'm a marketing student and I've got a couple ideas that could help you reach more people. Interested?",
      "{{opener}} {{name}} caught my eye{{loc}}. {{hook}}! I'm studying digital marketing and would love to share some thoughts if you're open to it 😊",
      "{{opener}} Your page is great — {{hook}}. I help businesses like {{name}} grow online. Want to hear more?",
      "{{opener}} {{hook}} — seriously, {{name}} is doing it right{{loc}}. I've been working on some growth strategies and think I could help!",
    ],
    facebook: [
      "{{opener}} Love what you've built with {{name}}{{loc}}. {{hook}}. I'm studying marketing and had some ideas I think could help you grow. Would you be open to a quick chat?",
      "{{opener}} Been checking out {{name}} and I'm impressed — {{hook}}. I help local businesses boost their online presence. Would love to share some ideas!",
      "{{opener}} {{name}}{{loc}} really stands out. {{hook}}. I had a couple specific thoughts that could help you reach more customers. Mind if I share?",
      "{{opener}} {{hook}} — {{name}} is clearly doing something right{{loc}}. I do social media growth and think there's a cool opportunity here!",
      "{{opener}} Quick message — I help businesses like {{name}} grow their online presence. {{hook}} and I think there's a great fit. Open to chatting?",
    ],
    linkedin: [
      "{{opener}} I came across {{name}}{{loc}} and {{hook}}. I'm studying digital marketing and would love to connect and share some thoughts if you're open to it.",
      "{{opener}} {{hook}} — {{name}} clearly has a strong foundation{{loc}}. I work on helping businesses grow online. Would you be open to a brief conversation?",
      "{{opener}} {{name}} caught my attention. {{hook}}. I've been working on growth strategies for local businesses — happy to share some ideas if interested.",
      "{{opener}} I'll keep this brief — {{hook}}, and I think {{name}} has great potential for online growth. Would love to connect!",
      "{{opener}} I help local businesses grow their online presence, and {{name}}{{loc}} looks like a great fit. {{hook}}. Mind if we connect?",
    ],
  },
  professional: {
    instagram: [
      "{{opener}} I've been looking at {{name}}{{loc}} and {{hook}}. We specialize in digital growth for {{niche}} businesses — I'd love to share how we could help.",
      "{{opener}} {{name}} stands out{{loc}}. {{hook}}. Our agency works with similar businesses and we've got a track record of delivering results. Would you be open to a conversation?",
      "{{opener}} {{hook}} — {{name}} has a strong foundation for growth{{loc}}. We help {{niche}} businesses scale their online presence. Happy to share more.",
      "{{opener}} We work with {{niche}} businesses like {{name}} to accelerate online growth. {{hook}}. Would love to discuss some strategies.",
      "{{opener}} {{name}}{{loc}} caught our attention. {{hook}}. Our team specializes in helping businesses like yours reach more customers online.",
    ],
    facebook: [
      "{{opener}} I've been reviewing {{name}}{{loc}} and {{hook}}. Our agency specializes in helping {{niche}} businesses grow their digital presence. I'd love to share some specific ideas if you're interested.",
      "{{opener}} {{name}} has built something impressive{{loc}}. {{hook}}. We work with similar businesses and consistently deliver strong results. Would you have time for a brief conversation?",
      "{{opener}} {{hook}} — it's clear {{name}} has a solid foundation. We help {{niche}} businesses maximize their online reach. I have a few specific strategies that could work well for you.",
      "{{opener}} Our agency works with {{niche}} businesses to drive growth online. {{name}}{{loc}} looks like a great fit — {{hook}}. Would you be open to discussing some ideas?",
      "{{opener}} I noticed {{name}}{{loc}} and {{hook}}. We've helped similar businesses significantly increase their online presence. I'd be happy to share our approach.",
    ],
    linkedin: [
      "{{opener}} I've been reviewing {{name}}{{loc}} and {{hook}}. Our agency helps {{niche}} businesses strengthen their digital presence, and I believe there's a strong opportunity here. Would you be open to a conversation?",
      "{{opener}} {{hook}} — {{name}} has clearly built something valuable{{loc}}. We specialize in digital growth for businesses like yours. I'd welcome the chance to share some tailored strategies.",
      "{{opener}} {{name}} caught my attention{{loc}}. {{hook}}. Our team works with {{niche}} businesses on digital growth — I have some specific ideas I think you'd find valuable.",
      "{{opener}} We help {{niche}} businesses scale their online presence, and {{name}}{{loc}} looks like an ideal fit. {{hook}}. I'd appreciate the opportunity to connect.",
      "{{opener}} I'll be direct — {{hook}}, and I think {{name}} has significant untapped potential online. We specialize in exactly this. Would you be open to a brief call?",
    ],
  },
  reactivation: {
    instagram: [
      "{{opener}} I work with {{niche}} businesses like {{name}} and I had a specific idea — what if you could bring back past customers who haven't visited in a while? We run reactivation campaigns that do exactly that. Interested? 🎯",
      "{{opener}} Quick thought for {{name}}{{loc}} — most {{niche}} businesses are sitting on a goldmine of past customers. We help bring them back with targeted campaigns. Would love to tell you more!",
      "{{opener}} {{hook}} — and I bet {{name}} has tons of past customers who'd come back with the right nudge. That's exactly what we do. Want to hear how it works?",
      "{{opener}} {{name}}{{loc}} looks great. {{hook}}! Quick question — have you ever tried reactivating past customers? We run campaigns that typically bring back 15-30% of them. DM me if curious! 📈",
      "{{opener}} Love {{name}}! {{hook}}. I'm running a pilot program helping {{niche}} businesses bring back past customers — zero risk, pay only for results. Sound interesting?",
    ],
    facebook: [
      "{{opener}} I work with {{niche}} businesses and had a thought about {{name}}{{loc}}. Most businesses have hundreds of past customers who'd come back with the right message. We run reactivation campaigns that bring them back — interested in learning more?",
      "{{opener}} {{hook}} — {{name}} clearly has a loyal following{{loc}}. Here's a question: what if you could re-engage customers who haven't been in recently? We specialize in exactly that. Happy to share how it works.",
      "{{opener}} Quick idea for {{name}} — we help {{niche}} businesses run targeted reactivation campaigns to bring back past customers. Most see a 15-30% return rate. Would you be open to a quick chat about it?",
      "{{opener}} {{name}}{{loc}} looks amazing. {{hook}}. We've been helping similar businesses bring back lapsed customers with targeted outreach campaigns. Results have been great — want to hear more?",
      "{{opener}} Thought of {{name}} for something we're doing — we run customer reactivation campaigns for {{niche}} businesses. You only pay for results. Would that be worth a conversation?",
    ],
    linkedin: [
      "{{opener}} I've been looking at {{name}}{{loc}} and {{hook}}. I work with {{niche}} businesses on customer reactivation — helping bring back past customers through targeted campaigns. We typically see 15-30% return rates. Would you be interested in discussing this?",
      "{{opener}} {{hook}} — {{name}} has clearly built a strong customer base{{loc}}. I specialize in reactivation campaigns that re-engage lapsed customers. It's a high-ROI strategy most businesses overlook. Would you be open to a brief conversation?",
      "{{opener}} Quick idea for {{name}} — most {{niche}} businesses have a significant number of past customers who'd return with the right outreach. We run performance-based reactivation campaigns. I'd welcome the chance to share more.",
      "{{opener}} {{name}}{{loc}} caught my attention. {{hook}}. I help businesses like yours run targeted reactivation campaigns — you pay only for customers who come back. Would this be worth discussing?",
      "{{opener}} I'll be direct — we help {{niche}} businesses bring back past customers through targeted reactivation campaigns. {{name}}{{loc}} looks like a great fit. {{hook}}. Interested in learning more?",
    ],
  },
}

// ── FOLLOW-UP TEMPLATES BY TONE ──────────────────────────────────────────────

const FOLLOWUP_1: Record<Tone, string[]> = {
  casual: [
    "Hey! Just following up on my earlier message about {{name}}. Had a couple specific ideas I think could really help. Happy to share if you're interested! 😊",
    "Hi again! Wanted to circle back — I've been thinking about {{name}} and have some ideas I'd love to share. Would you be open to a quick chat?",
    "Hey! Not sure if you caught my last message. I genuinely think {{name}} has huge potential online. Got a few ideas — want me to send them over?",
    "Hi! Following up real quick — I put together some thoughts specifically for {{name}}. I think you'd find them useful!",
    "Hey there! Just bumping this up. I work with businesses like {{name}} and think there's a real opportunity here. No pressure! 🙌",
  ],
  professional: [
    "Hi — following up on my earlier message regarding {{name}}. I've put together some specific strategies I believe could drive meaningful growth. Would you have time for a brief conversation?",
    "Hello — circling back on my previous message. I've identified some concrete opportunities for {{name}} that I'd be happy to walk you through. Would you be open to connecting?",
    "Hi there — wanted to follow up. I've been doing some additional research on the {{niche}} space and have some insights I think {{name}} would benefit from. Let me know if you'd like to discuss.",
    "Hello — just following up. I've worked with similar {{niche}} businesses and the results have been strong. I'd love to share a few specific ideas for {{name}}.",
    "Hi — following up briefly. I believe {{name}} has significant growth potential online, and I have a few targeted strategies in mind. Would you be interested in hearing more?",
  ],
  reactivation: [
    "Hey! Following up about the reactivation idea for {{name}}. I ran some numbers and I think there's a real opportunity to bring back past customers. Want me to share what I found?",
    "Hi again! Just circling back on my message about customer reactivation for {{name}}. We just helped a similar {{niche}} business bring back 25% of their lapsed customers. Thought you'd want to hear about it!",
    "Hey! Wanted to follow up — the reactivation campaign idea for {{name}} could be a game-changer. We do it performance-based, so there's zero risk. Worth a quick chat?",
    "Hi! Bumping my earlier message about {{name}}. Past customers are your lowest-cost acquisition channel — we help you tap into that. Would love to share more!",
    "Hey! Quick follow-up. I've been thinking more about {{name}} and I think a reactivation campaign could drive serious results. Happy to share the details!",
  ],
}

const FOLLOWUP_2: Record<Tone, string[]> = {
  casual: [
    "Last one from me — just making sure my messages didn't get lost! If {{name}} is ever looking to grow online, I'd love to help. Either way, wishing you the best! 🙌",
    "Hey! Final follow-up. Totally get if the timing isn't right. If {{name}} ever wants to level up online, I'm here! No hard feelings 😊",
    "Hi! One last note — I really believe in what {{name}} is building. Whenever the time's right, feel free to reach out. Keep crushing it! 💪",
    "Quick last message — still think I could help {{name}} reach more people. If you change your mind, just drop me a line!",
    "Last reach-out from me! If {{name}} ever wants to boost its online presence, my door's always open. Wishing you a great week! ✌️",
  ],
  professional: [
    "Hello — sending a final follow-up. I understand timing is important, and I respect that. If {{name}} ever needs support with digital growth, I'd be glad to help. All the best.",
    "Hi — last note from me. I remain confident there's an opportunity for {{name}} to grow significantly online. If and when you're ready, please don't hesitate to reach out.",
    "Hi there — final follow-up. I've seen strong results with {{niche}} businesses, and I believe {{name}} could benefit as well. The offer stands whenever the timing works for you.",
    "Hello — I'll keep this brief. If {{name}} is ready to invest in digital growth, I'd welcome the conversation. Either way, wishing you continued success.",
    "Hi — one last message. Our team has a proven track record with {{niche}} businesses. If {{name}} is ever looking for a growth partner, we'd be happy to connect.",
  ],
  reactivation: [
    "Last message from me! The reactivation offer for {{name}} still stands — bring back past customers, pay only for results. If interested down the road, just reach out! 🙌",
    "Final follow-up! I know you're busy running {{name}}. The customer reactivation idea is an easy win whenever you're ready. No pressure — wishing you the best!",
    "Hey — one last note. We've been getting great results with reactivation campaigns for {{niche}} businesses. If {{name}} ever wants to try it, we're here. All the best! ✌️",
    "Last reach-out! The zero-risk reactivation offer for {{name}} has no expiration. Whenever the timing works, I'm just a message away.",
    "Final note — I genuinely think a reactivation campaign could drive real revenue for {{name}}. The offer stands whenever you're ready. Wishing you success! 💪",
  ],
}

// ── INDUSTRY HOOKS ───────────────────────────────────────────────────────────

const INDUSTRY_HOOKS: Record<string, string[]> = {
  restaurant: ["your menu looks incredible", "the food content on your page is 🔥", "love the vibe of your spot"],
  salon: ["the transformations you post are amazing", "your work is seriously impressive", "the before/afters are goals"],
  gym: ["the energy at your gym looks unreal", "love the community you've built", "your fitness content is solid"],
  dental: ["your practice looks top-notch", "your patient reviews are stellar", "your office looks so welcoming"],
  spa: ["the ambiance looks absolutely stunning", "your services look incredible", "love the wellness focus"],
  auto: ["your shop has a great reputation", "love seeing quality work like yours", "the attention to detail shows"],
  retail: ["your product selection is great", "love the brand you've built", "your store looks awesome"],
  default: ["what you've built is really impressive", "love the energy of your brand", "your business really stands out"],
}

function getHook(lead: Record<string, unknown>): string {
  const bio = String(lead.ig_bio || lead.fb_about || lead.li_description || "")
  if (bio) {
    const lower = bio.toLowerCase()
    if (lower.includes("family")) return "love that it's a family business"
    if (lower.includes("years") || lower.includes("since")) return "the experience really shows"
    if (lower.includes("award") || lower.includes("best")) return "the recognition you've earned says it all"
    if (lower.includes("community")) return "love the community focus"
    if (lower.includes("organic") || lower.includes("natural")) return "the commitment to quality is clear"
    if (lower.includes("handmade") || lower.includes("custom")) return "the personalized approach is awesome"
  }
  const btype = String(lead.business_type || "").toLowerCase()
  for (const [industry, hooks] of Object.entries(INDUSTRY_HOOKS)) {
    if (industry !== "default" && btype.includes(industry)) return pick(hooks)
  }
  return pick(INDUSTRY_HOOKS.default)
}

// ── MESSAGE GENERATION ───────────────────────────────────────────────────────

function generateTemplateMessage(
  lead: Record<string, unknown>,
  platform: string,
  stepNumber: number,
  totalSteps: number,
  tone: Tone
): { body: string; action: string } {
  const name = String(lead.name || lead.business_name || "your business")
  const city = lead.city ? ` in ${lead.city}` : ""
  const niche = String(lead.business_type || "local")
  const hook = getHook(lead)
  const platKey = platform as "instagram" | "facebook" | "linkedin"

  const opener = pick(OPENERS[tone]?.[platKey] || OPENERS.casual.instagram)

  let templates: string[]
  if (stepNumber === 1) {
    templates = INITIAL_TEMPLATES[tone]?.[platKey] || INITIAL_TEMPLATES.casual.instagram
  } else if (stepNumber <= Math.ceil(totalSteps * 0.66)) {
    templates = FOLLOWUP_1[tone] || FOLLOWUP_1.casual
  } else {
    templates = FOLLOWUP_2[tone] || FOLLOWUP_2.casual
  }

  let body = pick(templates)
  body = body.replace(/\{\{opener\}\}/g, opener)
  body = body.replace(/\{\{name\}\}/g, name)
  body = body.replace(/\{\{loc\}\}/g, city)
  body = body.replace(/\{\{niche\}\}/g, niche)
  body = body.replace(/\{\{hook\}\}/g, hook)

  // Google rating bonus for initial messages
  const rawScrape = (lead._raw_scrape_data && typeof lead._raw_scrape_data === "object") ? lead._raw_scrape_data as Record<string, unknown> : {}
  const rating = Number(lead.google_rating || rawScrape.google_rating || 0)
  if (rating >= 4.5 && stepNumber === 1) {
    body = body.replace(hook, `${hook} (and that ${rating}⭐ rating speaks for itself!)`)
  }

  return { body, action: "dm" }
}

// ── SEQUENCE STEP PARSING ────────────────────────────────────────────────────

function buildActiveSteps(steps: Record<string, string>, skippedPlatforms: Set<string>): Array<{ dayKey: string; platform: string; stepNum: number }> {
  const entries = Object.entries(steps)
    .filter(([, v]) => v)
    .sort(([a], [b]) => parseInt(a.replace("day_", "")) - parseInt(b.replace("day_", "")))

  const active: Array<{ dayKey: string; platform: string; stepNum: number }> = []
  let stepNum = 0

  for (const [dayKey, platform] of entries) {
    const { action } = parseStepPlatformAction(platform)
    if (isNonMessageAction(action)) continue
    stepNum++
    if (!skippedPlatforms.has(platform)) {
      active.push({ dayKey, platform, stepNum })
    }
  }

  return active
}

// ── API HANDLER ──────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { jobs, mode } = body as { jobs: GenerateJob[]; mode?: "generate" | "regenerate"; message_id?: string }

    if (mode === "regenerate" && body.message_id) {
      return handleRegenerate(body.message_id as string)
    }

    if (!jobs?.length) {
      return NextResponse.json({ success: false, error: "No jobs provided" }, { status: 400 })
    }

    const leadIds = [...new Set(jobs.map((j) => j.lead_id))]
    const seqIds = [...new Set(jobs.map((j) => j.sequence_id))]
    const approachIds = [...new Set(jobs.map((j) => j.approach_id))]

    const [leadsRes, seqRes, approachRes] = await Promise.all([
      supabase.from("leads").select("*").in("lead_id", leadIds),
      supabase.from("sequences").select("*").in("sequence_id", seqIds),
      supabase.from("approaches").select("*").in("approach_id", approachIds),
    ])

    if (leadsRes.error) throw new Error(leadsRes.error.message)
    if (seqRes.error) throw new Error(seqRes.error.message)
    if (approachRes.error) throw new Error(approachRes.error.message)

    const leadMap = Object.fromEntries((leadsRes.data || []).map((l) => [l.lead_id, l]))
    const seqMap = Object.fromEntries((seqRes.data || []).map((s) => [s.sequence_id, s]))
    const approachMap = Object.fromEntries((approachRes.data || []).map((a) => [a.approach_id, a]))

    const results: { lead_id: string; success: boolean; messages_created: number; approach: string; error?: string }[] = []
    let totalCreated = 0

    for (const job of jobs) {
      const lead = leadMap[job.lead_id]
      const sequence = seqMap[job.sequence_id]
      const approach = approachMap[job.approach_id] || {}

      if (!lead || !sequence) {
        results.push({ lead_id: job.lead_id, success: false, messages_created: 0, approach: job.approach_id, error: "Missing lead/sequence data" })
        continue
      }

      try {
        const steps = typeof sequence.steps === "string" ? JSON.parse(sequence.steps) : sequence.steps
        const rawScrapeData = lead._raw_scrape_data ? (typeof lead._raw_scrape_data === "string" ? JSON.parse(lead._raw_scrape_data) : lead._raw_scrape_data) : {}

        const activeEntries = buildActiveSteps(steps, new Set())
        const totalSteps = activeEntries.length
        const leadContext = { ...lead, ...rawScrapeData }

        // Detect tone from the approach
        const tone = detectTone(approach)

        const messageRows = activeEntries.map((entry) => {
          const platformBase = entry.platform.split(":")[0].toLowerCase()
          const { body, action } = generateTemplateMessage(leadContext, platformBase, entry.stepNum, totalSteps, tone)

          return {
            message_id: `msg_${lead.lead_id}_${job.sequence_id}_${entry.stepNum}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            lead_id: lead.lead_id,
            business_name: lead.name || "",
            sequence_id: job.sequence_id,
            step_number: String(entry.stepNum),
            platform: platformBase,
            action,
            subject: "",
            body,
            status: "pending_approval",
            char_count: String(body.length),
            warnings: "",
            approach_id: job.approach_id,
            generated_at: new Date().toISOString(),
          }
        })

        if (messageRows.length > 0) {
          const { error: insertError } = await supabase.from("messages").insert(messageRows)
          if (insertError) throw new Error(insertError.message)
        }

        await supabase.from("leads").update({ messages_generated: "true", status: "messages_ready" }).eq("lead_id", lead.lead_id)

        totalCreated += messageRows.length
        results.push({ lead_id: job.lead_id, success: true, messages_created: messageRows.length, approach: approach.name || job.approach_id })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`Generation failed for ${lead.name}:`, errMsg)
        results.push({ lead_id: job.lead_id, success: false, messages_created: 0, approach: job.approach_id, error: errMsg })
      }
    }

    return NextResponse.json({ success: true, total_created: totalCreated, results, source: "template", note: "Zero API cost — approach-aware template generation" })
  } catch (error) {
    console.error("Generate API error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

// ── REGENERATE SINGLE MESSAGE ────────────────────────────────────────────────

async function handleRegenerate(messageId: string) {
  try {
    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .select("*")
      .eq("message_id", messageId)
      .single()

    if (msgErr || !msg) {
      return NextResponse.json({ success: false, error: "Message not found" }, { status: 404 })
    }

    const [leadRes, approachRes] = await Promise.all([
      supabase.from("leads").select("*").eq("lead_id", msg.lead_id).single(),
      supabase.from("approaches").select("*").eq("approach_id", msg.approach_id).single(),
    ])

    const lead = leadRes.data
    if (!lead) {
      return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 })
    }

    const approach = approachRes.data || {}
    const rawScrapeData = lead._raw_scrape_data ? (typeof lead._raw_scrape_data === "string" ? JSON.parse(lead._raw_scrape_data) : lead._raw_scrape_data) : {}
    const leadContext = { ...lead, ...rawScrapeData }
    const tone = detectTone(approach)

    const { body } = generateTemplateMessage(leadContext, msg.platform, parseInt(msg.step_number) || 1, 3, tone)

    const { error: updateErr } = await supabase
      .from("messages")
      .update({
        body,
        char_count: String(body.length),
        status: "pending_approval",
        generated_at: new Date().toISOString(),
      })
      .eq("message_id", messageId)

    if (updateErr) throw new Error(updateErr.message)

    return NextResponse.json({ success: true, message: "Message regenerated", source: "template", tone })
  } catch (error) {
    console.error("Regenerate error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
