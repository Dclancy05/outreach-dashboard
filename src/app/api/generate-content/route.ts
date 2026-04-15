import { NextResponse } from "next/server"

/**
 * Content Planning — Template-based (ZERO API COST)
 * Generates a week's worth of content from predefined templates
 */

interface ContentItem {
  title: string
  caption: string
  hashtags: string
  content_type: string
  ai_prompt: string
  scheduled_time: string
  day_offset: number
  category: string
}

const CATEGORIES = ["testimonial", "tip", "promo", "behind-the-scenes", "engagement"] as const

const CONTENT_TEMPLATES: Record<string, Array<{ title: string; caption: string; content_type: string; ai_prompt: string }>> = {
  testimonial: [
    {
      title: "Client Success Story",
      caption: "🌟 Another happy client!\n\n\"Working with {{persona_name}} has been a game-changer for our business.\"\n\nResults speak louder than words. Ready to be our next success story?\n\n👇 Drop a comment or DM us!",
      content_type: "carousel",
      ai_prompt: "Create a testimonial carousel with client quote overlay on branded background",
    },
    {
      title: "Before & After Results",
      caption: "📈 The transformation is REAL.\n\nSwipe to see what's possible when you invest in your online presence ➡️\n\n{{niche}} businesses are seeing incredible results.\n\nWant this for your business? Link in bio! 🔗",
      content_type: "carousel",
      ai_prompt: "Before and after comparison carousel showing business growth metrics",
    },
    {
      title: "Client Spotlight",
      caption: "🎉 Client Spotlight!\n\nSo proud to work with amazing {{niche}} businesses.\n\nThis is what happens when strategy meets execution 💪\n\nWho's next? 👀",
      content_type: "image",
      ai_prompt: "Client spotlight graphic with business logo and growth stats",
    },
  ],
  tip: [
    {
      title: "Quick Growth Tip",
      caption: "💡 FREE tip that most {{niche}} businesses miss:\n\nYour online presence is your 24/7 salesperson. Make sure it's working as hard as you do.\n\nHere are 3 things you can do TODAY:\n1️⃣ Update your Google listing\n2️⃣ Post consistently (3-5x/week)\n3️⃣ Engage with your community\n\nSave this for later! 🔖",
      content_type: "carousel",
      ai_prompt: "Educational carousel with 3 tips, branded design, easy-to-read layout",
    },
    {
      title: "Common Mistake to Avoid",
      caption: "🚫 Stop doing this on social media!\n\nThe #1 mistake {{niche}} businesses make? Posting without a strategy.\n\nRandom posts = random results.\nStrategic posts = consistent growth.\n\nDM us 'STRATEGY' for a free audit! 📊",
      content_type: "reel",
      ai_prompt: "Short-form video about common social media mistakes with text overlays",
    },
    {
      title: "Industry Insight",
      caption: "📊 Did you know?\n\n80% of customers check a business online before visiting.\n\nIf your {{niche}} business isn't showing up strong online, you're leaving money on the table.\n\nDouble-tap if you agree 👇",
      content_type: "image",
      ai_prompt: "Statistic infographic with bold numbers and clean design",
    },
  ],
  promo: [
    {
      title: "Limited Time Offer",
      caption: "🔥 Limited spots available!\n\nWe're taking on {{spots}} new {{niche}} clients this month.\n\nWhat you get:\n✅ Custom strategy\n✅ Content creation\n✅ Growth management\n✅ Monthly reporting\n\nDM 'READY' to claim your spot! ⏰",
      content_type: "image",
      ai_prompt: "Promotional graphic with urgency elements, countdown style, bold CTA",
    },
    {
      title: "Free Audit Offer",
      caption: "🎁 FREE Social Media Audit!\n\nWant to know exactly where your {{niche}} business stands online?\n\nWe'll review your profiles, content, and give you actionable tips — completely free.\n\nComment 'AUDIT' below 👇",
      content_type: "reel",
      ai_prompt: "Quick video showing the audit process and value, screen recording style",
    },
    {
      title: "Service Showcase",
      caption: "What we do for {{niche}} businesses 👇\n\n📱 Social Media Management\n📸 Content Creation\n📊 Analytics & Strategy\n🎯 Targeted Growth\n💬 Community Management\n\nAll so you can focus on what you do best — running your business.\n\nDM to learn more!",
      content_type: "carousel",
      ai_prompt: "Service showcase carousel with icons and brief descriptions for each service",
    },
  ],
  "behind-the-scenes": [
    {
      title: "Day in the Life",
      caption: "📱 A day in the life of running a digital marketing agency!\n\nFrom strategy calls to content creation — every day is different and we love it.\n\nThe best part? Seeing our {{niche}} clients win. 🏆\n\nWhat does your day look like? 👇",
      content_type: "reel",
      ai_prompt: "Day-in-the-life style reel showing work process, meetings, content creation",
    },
    {
      title: "Team Feature",
      caption: "Meet the team behind the magic ✨\n\nWe're a crew of creatives, strategists, and growth nerds who are passionate about helping {{niche}} businesses thrive online.\n\nGot questions? We're always just a DM away! 💬",
      content_type: "image",
      ai_prompt: "Team photo or illustrated team graphic in branded style",
    },
    {
      title: "Process Reveal",
      caption: "🎬 Behind the scenes of how we create content for our clients!\n\nStep 1: Research & Strategy\nStep 2: Content Creation\nStep 3: Review & Optimize\nStep 4: Post & Engage\nStep 5: Analyze & Improve\n\nIt's a system that works. Want us to do this for you? DM us! 🚀",
      content_type: "reel",
      ai_prompt: "Process walkthrough video showing each step with visual examples",
    },
  ],
  engagement: [
    {
      title: "This or That",
      caption: "🤔 This or That — {{niche}} Edition!\n\nComment below 👇\n\nA) Quality over quantity\nB) Quantity builds momentum\n\nThere's no wrong answer! Let's debate 🔥",
      content_type: "story",
      ai_prompt: "This-or-that poll graphic with two options, vibrant colors",
    },
    {
      title: "Question of the Day",
      caption: "❓ Question for {{niche}} business owners:\n\nWhat's your biggest challenge with social media right now?\n\nA) Finding time to post\nB) Coming up with content ideas\nC) Getting engagement\nD) Converting followers to customers\n\nComment your answer! We might have a solution 😉",
      content_type: "image",
      ai_prompt: "Poll-style graphic with four options, engaging and colorful design",
    },
    {
      title: "Fill in the Blank",
      caption: "Fill in the blank! ✏️\n\nThe best thing about running a {{niche}} business is ___________.\n\nWe'll go first: seeing the impact on our community! 💛\n\nYour turn 👇",
      content_type: "image",
      ai_prompt: "Fill-in-the-blank style graphic with space for answers, fun design",
    },
  ],
}

const OPTIMAL_TIMES = ["09:00", "11:30", "13:00", "15:30", "18:00", "19:30", "20:00"]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function fillVars(text: string, vars: Record<string, string>): string {
  let result = text
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value)
  }
  return result
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { persona, week_start } = body

    if (!persona) {
      return NextResponse.json({ error: "Missing persona" }, { status: 400 })
    }

    const postCount = persona.posting_frequency || 5
    const vars: Record<string, string> = {
      persona_name: persona.name || "our team",
      niche: persona.niche || "local",
      tone: persona.tone || "professional",
      spots: String(Math.floor(Math.random() * 3) + 3),
    }

    const content: ContentItem[] = []
    const usedCategories = new Set<string>()

    for (let i = 0; i < postCount; i++) {
      // Rotate through categories, then random
      const catIdx = i % CATEGORIES.length
      const category = CATEGORIES[catIdx]
      const templates = CONTENT_TEMPLATES[category]
      const template = pick(templates)

      content.push({
        title: fillVars(template.title, vars),
        caption: fillVars(template.caption, vars),
        hashtags: persona.hashtag_groups || "#socialmedia #growth #marketing",
        content_type: template.content_type,
        ai_prompt: fillVars(template.ai_prompt, vars),
        scheduled_time: OPTIMAL_TIMES[i % OPTIMAL_TIMES.length],
        day_offset: i % 7,
        category,
      })
      usedCategories.add(category)
    }

    return NextResponse.json({
      success: true,
      content,
      source: "template",
      note: "Free template-based content — zero API cost",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
