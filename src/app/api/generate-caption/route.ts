import { NextResponse } from "next/server"

/**
 * AI Caption Generator
 * Uses OpenAI if available, otherwise falls back to templates.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""

const CAPTION_TEMPLATES: Record<string, string[]> = {
  image: [
    "✨ New post alert!\n\n{persona_line}Every day is a chance to grow. Double-tap if you agree 👇\n\n{hashtags}",
    "📸 {persona_line}Consistency is key. Show up, create, inspire.\n\nWhat are you working on today? 💬\n\n{hashtags}",
    "🔥 {persona_line}Big things are coming. Stay tuned!\n\nDrop a 🙌 if you're ready\n\n{hashtags}",
  ],
  reel: [
    "🎬 Watch this!\n\n{persona_line}Sometimes the best content is the real content. No filters, no scripts.\n\nSave this for later 🔖\n\n{hashtags}",
    "📱 POV: You finally started {niche_or_content}\n\n{persona_line}This is your sign to start today.\n\nTag someone who needs this 👇\n\n{hashtags}",
  ],
  carousel: [
    "📚 Swipe for value ➡️\n\n{persona_line}Save this carousel for when you need a reminder.\n\nWhich slide hit hardest? Comment below 👇\n\n{hashtags}",
  ],
  story: [
    "Quick thought 💭\n\n{persona_line}Let me know what you think! Tap to vote 📊\n\n{hashtags}",
  ],
}

function generateTemplateCaption(contentType: string, persona: { name?: string; niche?: string; tone?: string; hashtag_groups?: string } | null) {
  const templates = CAPTION_TEMPLATES[contentType] || CAPTION_TEMPLATES.image
  const template = templates[Math.floor(Math.random() * templates.length)]

  const personaLine = persona?.name ? `From ${persona.name} • ` : ""
  const nicheOrContent = persona?.niche || "creating content"
  const hashtags = persona?.hashtag_groups || "#content #socialmedia #growth"

  return {
    caption: template
      .replace("{persona_line}", personaLine ? personaLine + "\n\n" : "")
      .replace("{niche_or_content}", nicheOrContent)
      .replace("{hashtags}", ""),
    hashtags,
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { content_type, persona, existing_caption } = body

    // Try OpenAI first
    if (OPENAI_API_KEY) {
      try {
        const systemPrompt = persona
          ? `You are a social media content writer. Write in a ${persona.tone || "casual"} tone for a ${persona.niche || "general"} audience. The persona is "${persona.name || "generic"}".`
          : "You are a social media content writer. Write engaging Instagram captions."

        const userPrompt = existing_caption
          ? `Improve this Instagram caption for a ${content_type} post:\n\n"${existing_caption}"\n\nMake it more engaging. Return JSON: { "caption": "...", "hashtags": "..." }`
          : `Write an engaging Instagram caption for a ${content_type} post${persona?.niche ? ` about ${persona.niche}` : ""}. Return JSON: { "caption": "...", "hashtags": "..." }`

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.8,
            max_tokens: 500,
          }),
        })

        if (res.ok) {
          const result = await res.json()
          const text = result.choices?.[0]?.message?.content || ""
          try {
            const jsonMatch = text.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0])
              return NextResponse.json({ caption: parsed.caption, hashtags: parsed.hashtags, source: "openai" })
            }
          } catch {
            // If JSON parse fails, use text as caption
            return NextResponse.json({ caption: text, hashtags: persona?.hashtag_groups || "", source: "openai" })
          }
        }
      } catch {
        // Fall through to template
      }
    }

    // Fallback: template-based
    const result = generateTemplateCaption(content_type || "image", persona)
    return NextResponse.json({ ...result, source: "template" })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
