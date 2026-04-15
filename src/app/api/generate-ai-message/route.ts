import { NextResponse } from "next/server"

interface LeadData {
  business_name?: string
  business_type?: string
  city?: string
  state?: string
  website?: string
  ig_bio?: string
  ig_followers?: number
  ig_last_caption?: string
  fb_about?: string
  fb_followers?: number
  li_description?: string
  li_industry?: string
  google_rating?: number
  google_review_count?: number
  owner_name?: string
  [key: string]: unknown
}

interface GenerateRequest {
  lead: LeadData
  message_type: "initial_dm" | "follow_up_1" | "follow_up_2"
  platform: "instagram" | "facebook" | "linkedin"
  template_id?: string
  custom_instructions?: string
}

// ── TEMPLATE ENGINE (ZERO API COST) ──────────────────────────────────────────

const OPENERS = {
  instagram: [
    "Hey! 👋", "Hi there! ✨", "Hey hey! 🙌", "Hi! 😊", "Hey! 🔥",
    "What's up! 👋", "Hi there! 💪", "Hey! ✌️", "Yo! 🎯", "Hi! 🚀",
  ],
  facebook: [
    "Hi there!", "Hey! Hope you're having a great day!", "Hello!", "Hi! 👋",
    "Hey there!", "Good to connect!", "Hi! Hope all's well!", "Hey! 😊",
    "Hello there!", "Hi! Quick message —",
  ],
  linkedin: [
    "Hi there —", "Hello!", "Hi! Hope you're doing well.", "Hey — quick note.",
    "Hi there, hope your week is going well!", "Hello — reaching out briefly.",
    "Hi! I'll keep this short.", "Hey there!", "Hi — hope I'm not interrupting.",
    "Hello! Quick intro —",
  ],
}

const INDUSTRY_HOOKS: Record<string, string[]> = {
  restaurant: [
    "your menu looks amazing", "the food photos on your page are 🔥",
    "love the vibe of your spot", "your place looks like a must-try",
  ],
  salon: [
    "the transformations you post are incredible", "your work is seriously impressive",
    "the before/afters on your page are goals", "your styling work speaks for itself",
  ],
  gym: [
    "the energy at your gym looks unmatched", "love seeing the community you've built",
    "your members look like they're crushing it", "the fitness content you share is solid",
  ],
  dental: [
    "your practice looks top-notch", "love that you make dental care approachable",
    "your patient reviews are stellar", "your office looks so welcoming",
  ],
  default: [
    "what you've built is really impressive", "love the energy of your brand",
    "your business stands out", "you've got something really special going",
  ],
}

const CTАС = [
  "Would love to chat about a couple ideas I had for you!",
  "I think there's a cool opportunity here — mind if I share?",
  "Happy to share some thoughts if you're open to it!",
  "Got a few ideas that might help — want me to send them over?",
  "Would you be open to a quick chat sometime?",
  "I'd love to bounce a couple ideas off you!",
  "Let me know if you'd be interested in hearing more!",
  "Mind if I share what I had in mind?",
  "Would love to connect and share some thoughts!",
  "Curious if you'd be open to exploring some ideas together?",
]

const CLOSINGS = [
  "Either way, keep crushing it! 💪", "Wishing you an awesome week!",
  "No pressure at all — just thought I'd reach out!", "Hope to hear from you! 🙌",
  "Looking forward to connecting!", "Talk soon! ✌️",
]

const INITIAL_DM_TEMPLATES = [
  "{{opener}} Love what you're doing with {{business_name}}{{location}}. {{hook}} — {{cta}}",
  "{{opener}} Just came across {{business_name}}{{location}} and {{hook}}. {{cta}}",
  "{{opener}} Been checking out {{business_name}} and honestly, {{hook}}. {{cta}}",
  "{{opener}} {{business_name}}{{location}} caught my eye — {{hook}}. I work in digital marketing and {{cta}}",
  "{{opener}} Really digging what {{business_name}} is all about. {{hook}}! {{cta}}",
  "{{opener}} Stumbled onto {{business_name}}{{location}} and had to reach out. {{hook}}. {{cta}}",
  "{{opener}} Your page is great — {{hook}}. I help businesses like {{business_name}} grow online. {{cta}}",
  "{{opener}} {{hook}} — seriously, {{business_name}} is doing it right. {{cta}}",
  "{{opener}} I help local businesses grow their online presence, and {{business_name}}{{location}} looks like a perfect fit. {{cta}}",
  "{{opener}} Quick one — {{hook}}. I've got some ideas for {{business_name}} that could help you reach more people. {{cta}}",
  "{{opener}} {{business_name}} looks awesome{{location}}! {{hook}}. I specialize in helping businesses like yours grow. {{cta}}",
  "{{opener}} Noticed {{business_name}}{{location}} and {{hook}}. I do social media growth for local businesses — {{cta}}",
]

const FOLLOW_UP_1_TEMPLATES = [
  "Hey! Just following up on my earlier message. Had a couple specific ideas for {{business_name}} that I think could really move the needle. {{cta}}",
  "Hi again! Wanted to circle back — I've been thinking about {{business_name}} and have some ideas I'd love to share. {{cta}}",
  "Hey! Not sure if you saw my last message. I genuinely think {{business_name}} has huge potential for growth online. {{cta}}",
  "Hi! Following up real quick — I put together some thoughts specifically for {{business_name}}. {{cta}}",
  "Hey there! Just bumping this up. I work with businesses like {{business_name}} and I think there's a real opportunity here. {{cta}}",
  "Hi! Circling back on my message from the other day. Still think {{business_name}} could benefit from what I do. No pressure! {{cta}}",
  "Hey! Quick follow-up — saw some new stuff from {{business_name}} and had even more ideas. Would love to share! {{cta}}",
  "Hi again! Just making sure my message didn't get buried. Got some concrete ideas for {{business_name}}. {{cta}}",
  "Hey! Following up — I know you're busy running {{business_name}}, but I think this could be worth 5 minutes. {{cta}}",
  "Hi! Wanted to reconnect. I've helped similar businesses to {{business_name}} grow significantly. {{cta}}",
]

const FOLLOW_UP_2_TEMPLATES = [
  "Last one from me — just wanted to make sure my messages didn't get lost! If {{business_name}} is looking to grow online, I'd love to help. {{closing}}",
  "Hey! Final follow-up. Totally get if the timing isn't right. If {{business_name}} ever wants to level up online, I'm here! {{closing}}",
  "Hi! Sending one last note. I think {{business_name}} deserves more visibility and I'd love to help make that happen. {{closing}}",
  "Quick last message — no hard feelings if you're not interested! Just genuinely think I could help {{business_name}}. {{closing}}",
  "Hey, last reach-out from me! If you ever want to chat about growing {{business_name}} online, my door's always open. {{closing}}",
  "Hi! I'll keep this brief — if {{business_name}} is ever ready to grow its online presence, I'd love to be your go-to. {{closing}}",
  "Final note! I know timing is everything. Whenever {{business_name}} is ready to grow online, feel free to reach out. {{closing}}",
  "Last message, promise! 😄 Still think {{business_name}} has amazing potential. Here whenever you're ready! {{closing}}",
  "Hey! This is my last follow-up. If you change your mind about growing {{business_name}} online, just drop me a message. {{closing}}",
  "One last note — I really believe in what {{business_name}} is building. Whenever the time's right, I'm just a message away. {{closing}}",
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function getIndustryHook(businessType?: string): string {
  if (!businessType) return pick(INDUSTRY_HOOKS.default)
  const key = businessType.toLowerCase()
  for (const [industry, hooks] of Object.entries(INDUSTRY_HOOKS)) {
    if (key.includes(industry)) return pick(hooks)
  }
  return pick(INDUSTRY_HOOKS.default)
}

function getBioHook(lead: LeadData): string | null {
  const bio = lead.ig_bio || lead.fb_about || lead.li_description || ""
  if (!bio) return null
  const lower = bio.toLowerCase()
  if (lower.includes("family")) return "love that it's a family business"
  if (lower.includes("years") || lower.includes("since")) return "the experience really shows"
  if (lower.includes("award") || lower.includes("best")) return "the recognition you've earned says it all"
  if (lower.includes("community") || lower.includes("local")) return "love the community focus"
  if (lower.includes("organic") || lower.includes("natural")) return "the commitment to quality is clear"
  if (lower.includes("custom") || lower.includes("bespoke")) return "the personalized approach is awesome"
  return null
}

function generateMessage(lead: LeadData, messageType: string, platform: string): string {
  const businessName = lead.business_name || "your business"
  const location = lead.city ? ` in ${lead.city}` : ""
  const opener = pick(OPENERS[platform as keyof typeof OPENERS] || OPENERS.instagram)
  const hook = getBioHook(lead) || getIndustryHook(lead.business_type)
  const cta = pick(CTАС)
  const closing = pick(CLOSINGS)

  let templates: string[]
  if (messageType === "follow_up_1") templates = FOLLOW_UP_1_TEMPLATES
  else if (messageType === "follow_up_2") templates = FOLLOW_UP_2_TEMPLATES
  else templates = INITIAL_DM_TEMPLATES

  let msg = pick(templates)
  msg = msg.replace(/\{\{opener\}\}/g, opener)
  msg = msg.replace(/\{\{business_name\}\}/g, businessName)
  msg = msg.replace(/\{\{location\}\}/g, location)
  msg = msg.replace(/\{\{hook\}\}/g, hook)
  msg = msg.replace(/\{\{cta\}\}/g, cta)
  msg = msg.replace(/\{\{closing\}\}/g, closing)
  msg = msg.replace(/\{\{city\}\}/g, lead.city || "")
  msg = msg.replace(/\{\{niche\}\}/g, lead.business_type || "local business")
  msg = msg.replace(/\{\{owner_name\}\}/g, lead.owner_name || "")
  msg = msg.replace(/\{\{platform\}\}/g, platform)

  // Google rating bonus
  if (lead.google_rating && lead.google_rating >= 4.5 && messageType === "initial_dm") {
    msg = msg.replace(hook, `${hook} (and that ${lead.google_rating}⭐ rating speaks for itself!)`)
  }

  return msg
}

export async function POST(req: Request) {
  try {
    const body: GenerateRequest = await req.json()
    const { lead, message_type, platform } = body

    if (!lead?.business_name) {
      return NextResponse.json({ error: "Missing lead data" }, { status: 400 })
    }

    const message = generateMessage(lead, message_type, platform)

    return NextResponse.json({
      success: true,
      message,
      source: "template",
      note: "Free template-based generation — zero API cost",
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
