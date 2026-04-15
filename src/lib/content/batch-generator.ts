/**
 * Batch Content Generator Engine
 * 
 * Produces high-quality, persona-specific content using live trend data.
 * 75% video (reels/shorts), 25% image (carousel/static).
 * Every piece is researched, trend-matched, and voice-locked to the persona.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── Types ───────────────────────────────────────────────────────────

export interface BatchConfig {
  persona_ids: string[]
  posts_per_persona: number
  date_start: string // ISO date
  date_end: string   // ISO date
  video_ratio: number // 0-100, default 75
  platforms: string[] // ig, fb, li, x, tiktok
}

export interface Persona {
  id: string
  name: string
  emoji: string
  description: string
  vibe: string
  voice_style: string
  visual_style: any
  hook_preferences: string[]
  content_rules: string[]
}

export interface TrendData {
  id: string
  platform: string
  trending_sound: string
  hook_type: string
  virality_score: number
  format_type: string
  description: string
  source_url: string
  metadata: any
}

export interface HookData {
  id: string
  text: string
  category: string
  template: string
  performance_rating: number
  platform: string
  metadata: any
}

export interface GeneratedPiece {
  title: string
  persona_id: string
  persona_name: string
  persona_emoji: string
  platform: string
  format: string  // reel, carousel, static, story
  status: string
  script: string
  body: string    // caption
  hook_used: string
  trending_sound: string
  hashtags: string[]
  visual_direction: string
  scheduled_date: string
  research_notes: any
  mood: string
  batch_id: string
}

interface ProgressCallback {
  (step: string, detail: string, pct: number): Promise<void>
}

// ── Content Templates ───────────────────────────────────────────────

const VIDEO_FORMATS = [
  { name: 'talking_head', desc: 'Direct to camera, high energy hook, personal story/tip', weight: 30 },
  { name: 'text_overlay', desc: 'Trending sound + bold text overlays with transitions', weight: 25 },
  { name: 'tutorial', desc: 'Step-by-step walkthrough, screen recording or demo style', weight: 15 },
  { name: 'story_time', desc: 'Narrative arc: hook → tension → resolution → CTA', weight: 15 },
  { name: 'before_after', desc: 'Transformation reveal with dramatic sound', weight: 10 },
  { name: 'reaction', desc: 'React to trending content/news in your niche', weight: 5 },
]

const IMAGE_FORMATS = [
  { name: 'carousel', desc: 'Multi-slide educational/value content (5-10 slides)', weight: 50 },
  { name: 'infographic', desc: 'Single powerful stat or framework visual', weight: 25 },
  { name: 'quote_card', desc: 'Provocative quote or hot take with branded design', weight: 15 },
  { name: 'meme', desc: 'Relatable niche meme, shareable', weight: 10 },
]

const HOOK_FRAMEWORKS: Record<string, string[]> = {
  curiosity_gap: [
    "I discovered something about {niche_topic} that changed everything",
    "Nobody's talking about this {niche_topic} hack",
    "The {niche_topic} secret that {persona_type} don't want you to know",
    "I spent {time_period} researching {niche_topic}. Here's what I found",
    "This one {niche_topic} trick got me {result}",
  ],
  bold_claim: [
    "Stop doing {common_mistake}. Do this instead",
    "{niche_topic} is broken. Here's the fix",
    "99% of people get {niche_topic} wrong",
    "This is the only {niche_topic} guide you'll ever need",
    "I'm about to save you {time/money} on {niche_topic}",
  ],
  pattern_interrupt: [
    "POV: You just discovered {niche_topic}",
    "Wait... {niche_topic} actually works like THIS?",
    "Plot twist: {common_belief} is actually wrong",
    "Unpopular opinion: {hot_take_about_niche}",
    "Hold on — did you know {surprising_fact}?",
  ],
  social_proof: [
    "How I helped {number} {clients/people} with {niche_topic}",
    "My {client/student} went from {before} to {after} in {time}",
    "Here's the exact {strategy/system} that got {result}",
    "{Number} {people} are already doing this. Are you?",
    "Case study: {result} in {time} using {method}",
  ],
  storytelling: [
    "I was {relatable_situation} when I discovered {niche_topic}",
    "3 months ago I was {before}. Today I'm {after}. Here's how",
    "The story of how {event} changed my approach to {niche_topic}",
    "I almost gave up on {niche_topic}. Then this happened",
    "Day 1 vs Day 90 of {niche_topic}",
  ],
  how_to: [
    "How to {desired_outcome} in {time} (step by step)",
    "{Number} steps to {desired_outcome} — even if you're a beginner",
    "The {adjective} guide to {niche_topic} (save this)",
    "Do this every {time_period} for {result}",
    "Want to {desired_outcome}? Start here ↓",
  ],
  fear_of_missing_out: [
    "Everyone's switching to {new_thing}. Here's why",
    "If you're not doing {strategy} in {year}, you're behind",
    "This {niche_topic} trend is blowing up right now",
    "Last chance to get ahead on {niche_topic} before everyone catches on",
    "The {niche_topic} wave is coming. Here's how to ride it",
  ],
  controversy: [
    "Hot take: {controversial_opinion_about_niche}",
    "I'm going to get hate for this but {honest_opinion}",
    "Why I stopped {common_practice} (and what I do instead)",
    "{Popular_advice} is actually terrible advice. Here's why",
    "The uncomfortable truth about {niche_topic}",
  ],
  question: [
    "What would you do if {scenario}?",
    "Is {common_belief} actually true? Let's find out",
    "Which {niche_option} is better: {A} or {B}?",
    "How are you still not doing {strategy}?",
    "Can you {challenge} in {time}? I tried it",
  ],
}

const CTA_TEMPLATES = [
  "Follow for more content like this 🔥",
  "Save this for later — you'll need it",
  "Drop a 🔥 if this helped",
  "Share this with someone who needs to hear it",
  "Comment INFO and I'll send you the full breakdown",
  "Link in bio for the full guide",
  "Follow + turn on notifications — big things coming",
  "Tag someone who needs this",
  "What's your experience with this? Drop it below ⬇️",
  "Double tap if you agree 👊",
]

const TRENDING_HASHTAG_BASES = [
  'trending', 'viral', 'fyp', 'foryou', 'explore', 'reels',
  'trending2026', 'growthhacks', 'entrepreneur', 'business',
  'smallbusiness', 'marketing', 'socialmedia', 'contentcreator',
  'hustle', 'motivation', 'success', 'ai', 'automation',
]

const MOODS = ['energetic', 'motivational', 'educational', 'raw', 'funny', 'dramatic', 'chill', 'intense']

// ── Utility Functions ───────────────────────────────────────────────

function weightedRandom<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((sum, i) => sum + i.weight, 0)
  let r = Math.random() * total
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return item
  }
  return items[items.length - 1]
}

function pickRandom<T>(arr: T[], count: number = 1): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, arr.length))
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  // Clean up any unfilled vars with generic text
  result = result.replace(/\{[^}]+\}/g, (match) => {
    const key = match.slice(1, -1)
    const fallbacks: Record<string, string> = {
      niche_topic: 'this strategy',
      result: 'incredible results',
      time_period: '30 days',
      time: '30 days',
      number: '100+',
      persona_type: 'most people',
      common_mistake: 'this one thing',
      desired_outcome: 'level up',
      year: '2026',
      keyword: 'INFO',
      resource: 'the full guide',
      before: 'struggling',
      after: 'thriving',
      'time/money': 'hours',
      client: 'client',
      clients: 'clients',
      people: 'people',
      strategy: 'this approach',
      method: 'this system',
      event: 'one conversation',
      adjective: 'ultimate',
      new_thing: 'this approach',
      common_practice: 'what everyone else does',
      common_belief: 'the conventional wisdom',
      scenario: 'you had unlimited resources',
      challenge: 'do this',
      A: 'Option A',
      B: 'Option B',
      niche_option: 'approach',
    }
    return fallbacks[key] || key.replace(/_/g, ' ')
  })
  return result
}

function generateDatesInRange(start: string, end: string, count: number): string[] {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const range = endDate.getTime() - startDate.getTime()
  const dates: string[] = []

  for (let i = 0; i < count; i++) {
    const offset = (range / (count + 1)) * (i + 1)
    const date = new Date(startDate.getTime() + offset)
    dates.push(date.toISOString().split('T')[0])
  }
  return dates
}

// ── Niche Detection ─────────────────────────────────────────────────

function detectNiche(persona: Persona): { niche: string; topics: string[]; audience: string } {
  const text = `${persona.description} ${persona.vibe} ${persona.name}`.toLowerCase()

  if (text.includes('business') || text.includes('entrepreneur') || text.includes('hustle') || text.includes('startup')) {
    return {
      niche: 'business/entrepreneurship',
      topics: ['scaling a business', 'finding clients', 'revenue growth', 'productivity hacks', 'building systems', 'AI tools for business', 'marketing strategies', 'sales techniques', 'time management', 'networking'],
      audience: 'aspiring entrepreneurs and business owners',
    }
  }
  if (text.includes('fitness') || text.includes('gym') || text.includes('health')) {
    return {
      niche: 'fitness/health',
      topics: ['workout routines', 'nutrition tips', 'body transformation', 'supplements', 'mental health', 'recovery', 'discipline', 'morning routine'],
      audience: 'fitness enthusiasts and people starting their journey',
    }
  }
  if (text.includes('tech') || text.includes('ai') || text.includes('code') || text.includes('developer')) {
    return {
      niche: 'tech/AI',
      topics: ['AI tools', 'automation', 'coding tips', 'tech trends', 'productivity apps', 'no-code tools', 'AI in business', 'future of work'],
      audience: 'tech enthusiasts and professionals',
    }
  }
  if (text.includes('college') || text.includes('student') || text.includes('school')) {
    return {
      niche: 'college/student life',
      topics: ['side hustles while in school', 'AI for students', 'building while young', 'networking in college', 'study hacks', 'making money as a student', 'college entrepreneur', 'learning in public'],
      audience: 'college students and young entrepreneurs',
    }
  }
  if (text.includes('marketing') || text.includes('social media') || text.includes('content')) {
    return {
      niche: 'marketing/social media',
      topics: ['content strategy', 'algorithm hacks', 'viral content', 'DM outreach', 'building an audience', 'monetizing content', 'brand deals', 'engagement tactics'],
      audience: 'marketers and content creators',
    }
  }
  // Fallback
  return {
    niche: 'general business',
    topics: ['productivity', 'making money online', 'personal brand', 'networking', 'mindset', 'AI tools', 'growth strategies', 'side hustles'],
    audience: 'motivated individuals looking to level up',
  }
}

// ── Voice Adapter ───────────────────────────────────────────────────

function adaptToVoice(text: string, persona: Persona): string {
  const voiceLower = (persona.voice_style || '').toLowerCase()
  const vibeLower = (persona.vibe || '').toLowerCase()

  // Apply persona rules
  if (persona.content_rules?.length) {
    for (const rule of persona.content_rules) {
      const ruleLower = rule.toLowerCase()
      if (ruleLower.includes('never sound corporate')) {
        text = text
          .replace(/leverage/gi, 'use')
          .replace(/utilize/gi, 'use')
          .replace(/implement/gi, 'do')
          .replace(/facilitate/gi, 'help')
          .replace(/synergy/gi, 'teamwork')
          .replace(/optimize/gi, 'improve')
      }
    }
  }

  // Casual voice adjustments
  if (voiceLower.includes('casual') || vibeLower.includes('authentic') || vibeLower.includes('chaotic')) {
    text = text
      .replace(/\bdo not\b/gi, "don't")
      .replace(/\bcan not\b/gi, "can't")
      .replace(/\bwill not\b/gi, "won't")
      .replace(/\bI am\b/g, "I'm")
      .replace(/\bgoing to\b/gi, 'gonna')
      .replace(/\bwant to\b/gi, 'wanna')
      .replace(/However,/gi, 'But')
      .replace(/Furthermore,/gi, 'Plus,')
      .replace(/In addition,/gi, 'Also,')
      .replace(/Therefore,/gi, 'So')
  }

  return text
}

// ── Scene Generator (for video scripts) ─────────────────────────────

function generateVideoScript(
  hook: string,
  topic: string,
  persona: Persona,
  format: string,
  nicheData: ReturnType<typeof detectNiche>,
  trendData: TrendData | null,
  mood: string,
): string {
  const scenes: string[] = []
  const voiceNote = persona.voice_style || 'natural, engaging'

  if (format === 'talking_head') {
    scenes.push(
      `[SCENE 1 — HOOK (0-3s)]`,
      `Visual: Close-up, direct eye contact, slightly off-center framing`,
      `Text Overlay: "${hook}"`,
      `Voice (${voiceNote}): "${hook}"`,
      `Energy: HIGH — stop the scroll immediately`,
      ``,
      `[SCENE 2 — CONTEXT (3-8s)]`,
      `Visual: Slight zoom out, hand gestures`,
      `Voice: Set up the problem or context. Why should they care?`,
      `"Here's the thing about ${topic}..."`,
      ``,
      `[SCENE 3 — VALUE DROP (8-20s)]`,
      `Visual: B-roll or screen recording if relevant. Text overlays for key points.`,
      `Voice: Deliver the main insight/tip/story. Be specific, not vague.`,
      `Key points to hit:`,
      `- One concrete example or data point`,
      `- Why this works (the "aha" moment)`,
      `- Make it personal — "I did this" or "my client did this"`,
      ``,
      `[SCENE 4 — CTA (20-30s)]`,
      `Visual: Back to direct camera, lean in slightly`,
      `Voice: "${pickRandom(CTA_TEMPLATES)[0]}"`,
      `Text Overlay: CTA text on screen`,
    )
  } else if (format === 'text_overlay') {
    scenes.push(
      `[SCENE 1 — HOOK TEXT (0-2s)]`,
      `Visual: Bold text animation on ${persona.visual_style?.filters || 'clean dark'} background`,
      `Text: "${hook}"`,
      `Sound: ${trendData?.trending_sound || 'trending audio'} — beat drop on text reveal`,
      ``,
      `[SCENE 2-4 — KEY POINTS (2-15s)]`,
      `Visual: Quick cuts between text cards, each on beat`,
      `3-5 text slides with key points about ${topic}:`,
      `- Point 1: The problem (relatable)`,
      `- Point 2: The insight (surprising)`,
      `- Point 3: The solution (actionable)`,
      `- Point 4: The proof (results)`,
      `Each text card: max 8 words, bold font, high contrast`,
      `Transitions: zoom, swipe, or glitch — on the beat`,
      ``,
      `[SCENE 5 — CTA (15-20s)]`,
      `Visual: Final text card`,
      `Text: "Follow for more" + handle`,
    )
  } else if (format === 'tutorial') {
    scenes.push(
      `[SCENE 1 — HOOK (0-3s)]`,
      `Visual: End result preview or text hook`,
      `Text: "${hook}"`,
      ``,
      `[SCENE 2 — STEP 1 (3-10s)]`,
      `Visual: Screen recording or demo`,
      `Voiceover: Walk through the first step clearly`,
      `Text overlay: "Step 1: [action]"`,
      ``,
      `[SCENE 3 — STEP 2 (10-18s)]`,
      `Visual: Continue demo`,
      `Voiceover: Second step with specific details`,
      `Text overlay: "Step 2: [action]"`,
      ``,
      `[SCENE 4 — RESULT + CTA (18-25s)]`,
      `Visual: Show the final result`,
      `Voiceover: "And that's it. ${pickRandom(CTA_TEMPLATES)[0]}"`,
    )
  } else if (format === 'story_time') {
    scenes.push(
      `[SCENE 1 — HOOK (0-3s)]`,
      `Visual: Close up, intense expression`,
      `Voice: "${hook}"`,
      `Energy: Draw them in, create tension`,
      ``,
      `[SCENE 2 — THE SETUP (3-10s)]`,
      `Visual: Walking, pacing, or sitting — natural movement`,
      `Voice: Set the scene. When, where, what was happening.`,
      `Make it personal and specific.`,
      ``,
      `[SCENE 3 — THE TURNING POINT (10-20s)]`,
      `Visual: Lean in, change energy`,
      `Voice: What changed? The discovery, the moment, the insight.`,
      `This is where ${topic} becomes relevant.`,
      ``,
      `[SCENE 4 — THE LESSON + CTA (20-30s)]`,
      `Visual: Direct to camera, confident`,
      `Voice: What you learned. How it applies to the viewer.`,
      `CTA: "${pickRandom(CTA_TEMPLATES)[0]}"`,
    )
  } else if (format === 'before_after') {
    scenes.push(
      `[SCENE 1 — BEFORE (0-5s)]`,
      `Visual: "Before" state — messy, struggling, relatable`,
      `Text: "Me before ${topic}"`,
      `Sound: Slow, melancholic section of trending audio`,
      ``,
      `[SCENE 2 — TRANSITION (5-7s)]`,
      `Visual: Quick cut, flash, or dramatic transition`,
      `Text: "Then I discovered..."`,
      `Sound: Beat drop / transition`,
      ``,
      `[SCENE 3 — AFTER (7-15s)]`,
      `Visual: "After" state — polished, successful, aspirational`,
      `Text: "Me after ${topic}"`,
      `Sound: Hype section of the audio`,
      ``,
      `[SCENE 4 — CTA]`,
      `Text: "Want the same results? Follow for the playbook"`,
    )
  } else {
    // reaction format
    scenes.push(
      `[SCENE 1 — SHOW THE CONTENT (0-3s)]`,
      `Visual: Screenshot/clip of the trending content being reacted to`,
      `Text: "${hook}"`,
      ``,
      `[SCENE 2 — REACTION (3-15s)]`,
      `Visual: Split screen or green screen reaction`,
      `Voice: Give your take. Be opinionated. ${persona.vibe || 'Keep it real.'}`,
      ``,
      `[SCENE 3 — YOUR TAKE (15-25s)]`,
      `Visual: Direct to camera`,
      `Voice: Add value beyond just reacting. What's the deeper insight?`,
      `CTA: "${pickRandom(CTA_TEMPLATES)[0]}"`,
    )
  }

  return scenes.join('\n')
}

// ── Image Content Generator ─────────────────────────────────────────

function generateImageContent(
  hook: string,
  topic: string,
  persona: Persona,
  format: string,
  nicheData: ReturnType<typeof detectNiche>,
): { caption: string; visual_direction: string } {
  const colors = persona.visual_style?.colors || ['#7C3AED', '#06B6D4']
  const fonts = persona.visual_style?.fonts || ['Inter', 'Space Grotesk']

  if (format === 'carousel') {
    const caption = adaptToVoice(
      `${hook}\n\n` +
      `Swipe through for the full breakdown ➡️\n\n` +
      `Slide 1: The Problem — what most people get wrong about ${topic}\n` +
      `Slide 2: The Truth — what actually works\n` +
      `Slide 3: Step 1 — the foundation\n` +
      `Slide 4: Step 2 — the execution\n` +
      `Slide 5: Step 3 — the optimization\n` +
      `Slide 6: Results you can expect\n` +
      `Slide 7: Save this & follow for more\n\n` +
      `${pickRandom(CTA_TEMPLATES)[0]}`,
      persona
    )

    const visual_direction = [
      `CAROUSEL — 7 slides`,
      `Style: ${persona.visual_style?.filters || 'clean, modern, bold'}`,
      `Colors: ${colors.join(', ')}`,
      `Fonts: ${fonts.join(', ')} — headline bold, body regular`,
      `Slide 1 (Cover): "${hook}" — large text, eye-catching, persona emoji ${persona.emoji}`,
      `Slides 2-6: One key point per slide, max 30 words, icons/illustrations`,
      `Slide 7: CTA + handle, branded design`,
      `Keep text large enough to read on mobile`,
      `Add subtle branded elements (logo, color accent) on each slide`,
    ].join('\n')

    return { caption, visual_direction }
  }

  if (format === 'infographic') {
    const caption = adaptToVoice(
      `${hook}\n\n` +
      `Here's the data that proves it 📊\n\n` +
      `The key takeaway: ${topic} isn't just a theory — it's backed by results.\n\n` +
      `Save this and come back to it when you need a reminder.\n\n` +
      `${pickRandom(CTA_TEMPLATES)[0]}`,
      persona
    )

    return {
      caption,
      visual_direction: [
        `INFOGRAPHIC — single image`,
        `Style: Data-driven, clean layout`,
        `Colors: ${colors.join(', ')}`,
        `Include: One powerful stat or framework about ${topic}`,
        `Layout: Top headline → visual data → bottom CTA`,
        `Make the key number/stat HUGE and eye-catching`,
      ].join('\n'),
    }
  }

  if (format === 'quote_card') {
    const caption = adaptToVoice(
      `${hook}\n\n` +
      `Real talk. This is something I had to learn the hard way.\n\n` +
      `If this resonates, you probably needed to hear it today.\n\n` +
      `${pickRandom(CTA_TEMPLATES)[0]}`,
      persona
    )

    return {
      caption,
      visual_direction: [
        `QUOTE CARD — single image`,
        `Style: ${persona.visual_style?.filters || 'bold, minimal'}`,
        `Colors: ${colors.join(', ')}`,
        `Quote text: "${hook}"`,
        `Attribution: ${persona.name} ${persona.emoji}`,
        `Design: Large quote text centered, subtle background texture`,
      ].join('\n'),
    }
  }

  // meme
  const caption = adaptToVoice(
    `If you know, you know 😂\n\n` +
    `Tag someone who relates to this\n\n` +
    `${pickRandom(CTA_TEMPLATES)[0]}`,
    persona
  )

  return {
    caption,
    visual_direction: [
      `MEME — single image`,
      `Topic: ${topic}`,
      `Style: Relatable, shareable, niche-specific humor`,
      `Format: Top text / bottom text OR modern meme layout`,
      `Make it specific to ${nicheData.niche} audience`,
      `Bonus: Reference current trends or viral formats`,
    ].join('\n'),
  }
}

// ── Main Batch Generator ────────────────────────────────────────────

export class BatchGenerator {
  private supabase: SupabaseClient
  private batchId: string = ''

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }

  async generate(config: BatchConfig, onProgress?: ProgressCallback): Promise<string> {
    // Create batch record
    const { data: batch, error: batchErr } = await this.supabase
      .from('content_batches')
      .insert({
        status: 'scanning',
        config,
        total_pieces: config.persona_ids.length * config.posts_per_persona,
        completed_pieces: 0,
      })
      .select()
      .single()

    if (batchErr || !batch) throw new Error(`Failed to create batch: ${batchErr?.message}`)
    this.batchId = batch.id

    try {
      // ─── Step 1: Scan Trends ──────────────────────────────
      await this.updateProgress('scanning', 'Scanning live trends from IG & TikTok...', 10)
      if (onProgress) await onProgress('scanning', 'Fetching live trend data', 10)

      const trends = await this.fetchTrends()
      const hooks = await this.fetchHooks()

      // ─── Step 2: Research ─────────────────────────────────
      await this.updateProgress('researching', `Analyzing ${trends.length} trends and ${hooks.length} hooks...`, 25)
      if (onProgress) await onProgress('researching', `Found ${trends.length} trends, ${hooks.length} hooks`, 25)

      // ─── Step 3: Load Personas ────────────────────────────
      const personas = await this.loadPersonas(config.persona_ids)

      // ─── Step 4: Generate Content ─────────────────────────
      await this.updateProgress('generating', 'Creating content pieces...', 40)
      if (onProgress) await onProgress('generating', `Generating for ${personas.length} personas`, 40)

      const allPieces: GeneratedPiece[] = []
      const totalPieces = config.persona_ids.length * config.posts_per_persona

      for (let pi = 0; pi < personas.length; pi++) {
        const persona = personas[pi]
        const nicheData = detectNiche(persona)
        const dates = generateDatesInRange(config.date_start, config.date_end, config.posts_per_persona)

        // Determine video/image split
        const videoCount = Math.round(config.posts_per_persona * (config.video_ratio / 100))
        const imageCount = config.posts_per_persona - videoCount

        for (let i = 0; i < config.posts_per_persona; i++) {
          const isVideo = i < videoCount
          const platform = config.platforms[i % config.platforms.length] || 'ig'

          // Pick format
          const formatObj = isVideo ? weightedRandom(VIDEO_FORMATS) : weightedRandom(IMAGE_FORMATS)

          // Match trends to this piece
          const relevantTrends = trends
            .filter(t => t.platform === 'instagram' || t.platform === 'tiktok')
            .sort((a, b) => b.virality_score - a.virality_score)
          const matchedTrend = relevantTrends[i % Math.max(relevantTrends.length, 1)] || null

          // Pick hook
          const hookCategory = persona.hook_preferences?.[i % persona.hook_preferences.length] ||
            pickRandom(Object.keys(HOOK_FRAMEWORKS))[0]
          const hookTemplates = HOOK_FRAMEWORKS[hookCategory] || HOOK_FRAMEWORKS.curiosity_gap
          const topic = pickRandom(nicheData.topics)[0]
          const hookTemplate = pickRandom(hookTemplates)[0]
          const hook = fillTemplate(hookTemplate, {
            niche_topic: topic,
            persona_type: nicheData.audience,
          })

          // Pick mood
          const mood = pickRandom(MOODS)[0]

          // Pick trending sound
          const trendingSound = matchedTrend?.trending_sound && matchedTrend.trending_sound !== 'original sound'
            ? matchedTrend.trending_sound
            : isVideo ? 'Use current #1 trending sound in Reels' : ''

          // Generate hashtags
          const hashtags = this.generateHashtags(topic, nicheData.niche, platform)

          // Generate the actual content
          let script = ''
          let caption = ''
          let visualDirection = ''
          const title = `${persona.emoji} ${formatObj.name.replace(/_/g, ' ')} — ${topic}`

          if (isVideo) {
            script = generateVideoScript(hook, topic, persona, formatObj.name, nicheData, matchedTrend, mood)
            caption = adaptToVoice(
              `${hook}\n\n` +
              `Full breakdown in the video ☝️\n\n` +
              `${pickRandom(CTA_TEMPLATES)[0]}\n\n` +
              hashtags.map(h => `#${h}`).join(' '),
              persona
            )
            visualDirection = [
              `FORMAT: ${formatObj.name.replace(/_/g, ' ').toUpperCase()}`,
              `DURATION: 15-30 seconds`,
              `MOOD: ${mood}`,
              `STYLE: ${persona.visual_style?.filters || 'clean, modern'}`,
              `SOUND: ${trendingSound}`,
              formatObj.desc,
            ].join('\n')
          } else {
            const imageContent = generateImageContent(hook, topic, persona, formatObj.name, nicheData)
            caption = imageContent.caption + '\n\n' + hashtags.map(h => `#${h}`).join(' ')
            caption = adaptToVoice(caption, persona)
            visualDirection = imageContent.visual_direction
          }

          const piece: GeneratedPiece = {
            title,
            persona_id: persona.id,
            persona_name: persona.name,
            persona_emoji: persona.emoji,
            platform,
            format: isVideo ? 'reel' : formatObj.name,
            status: 'draft',
            script: isVideo ? script : '',
            body: caption,
            hook_used: hook,
            trending_sound: trendingSound,
            hashtags,
            visual_direction: visualDirection,
            scheduled_date: dates[i] || dates[0],
            research_notes: {
              niche: nicheData.niche,
              topic,
              hook_category: hookCategory,
              matched_trend_id: matchedTrend?.id || null,
              matched_trend_virality: matchedTrend?.virality_score || null,
              format_type: formatObj.name,
              mood,
              audience: nicheData.audience,
            },
            mood,
            batch_id: this.batchId,
          }

          allPieces.push(piece)

          // Update progress
          const pct = 40 + Math.round(((pi * config.posts_per_persona + i + 1) / totalPieces) * 40)
          await this.updateProgress('generating', `Generated ${allPieces.length}/${totalPieces} pieces`, pct)
        }
      }

      // ─── Step 5: Quality Pass ─────────────────────────────
      await this.updateProgress('editing', 'Running quality checks...', 85)
      if (onProgress) await onProgress('editing', 'Quality review pass', 85)

      const editedPieces = this.qualityPass(allPieces)

      // ─── Step 6: Save to DB ───────────────────────────────
      await this.updateProgress('saving', 'Saving to database...', 92)
      if (onProgress) await onProgress('saving', 'Writing to database', 92)

      let saved = 0
      for (const piece of editedPieces) {
        const { error } = await this.supabase.from('content_pieces').insert({
          title: piece.title,
          persona_id: piece.persona_id,
          persona_name: piece.persona_name,
          persona_emoji: piece.persona_emoji,
          platform: piece.platform,
          format: piece.format,
          status: piece.status,
          script: piece.script,
          body: piece.body,
          hook_used: piece.hook_used,
          trending_sound: piece.trending_sound,
          hashtags: JSON.stringify(piece.hashtags),
          visual_direction: piece.visual_direction,
          scheduled_date: piece.scheduled_date,
          research_notes: piece.research_notes,
          mood: piece.mood,
          batch_id: piece.batch_id,
        })
        if (!error) saved++
      }

      // ─── Done ─────────────────────────────────────────────
      await this.supabase.from('content_batches').update({
        status: 'complete',
        completed_pieces: saved,
        progress: { step: 'complete', pct: 100, detail: `${saved} pieces created` },
        results: editedPieces.map(p => ({ title: p.title, format: p.format, persona: p.persona_name })),
        updated_at: new Date().toISOString(),
      }).eq('id', this.batchId)

      if (onProgress) await onProgress('complete', `${saved} pieces created`, 100)

      return this.batchId

    } catch (err: any) {
      await this.supabase.from('content_batches').update({
        status: 'error',
        error_message: err.message,
        updated_at: new Date().toISOString(),
      }).eq('id', this.batchId)
      throw err
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private async fetchTrends(): Promise<TrendData[]> {
    const { data } = await this.supabase
      .from('content_trends')
      .select('*')
      .order('virality_score', { ascending: false })
      .limit(50)
    return data || []
  }

  private async fetchHooks(): Promise<HookData[]> {
    const { data } = await this.supabase
      .from('content_hooks')
      .select('*')
      .order('performance_rating', { ascending: false })
      .limit(50)
    return data || []
  }

  private async loadPersonas(ids: string[]): Promise<Persona[]> {
    if (ids.length === 0) {
      const { data } = await this.supabase.from('content_personas').select('*').limit(10)
      return data || []
    }
    const { data } = await this.supabase.from('content_personas').select('*').in('id', ids)
    return data || []
  }

  private generateHashtags(topic: string, niche: string, platform: string): string[] {
    const tags = new Set<string>()

    // Niche-specific
    const nicheTag = niche.replace(/[^a-zA-Z]/g, '').toLowerCase()
    tags.add(nicheTag)

    // Topic-specific
    const topicTag = topic.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    tags.add(topicTag)

    // Trending bases
    const trendingPicks = pickRandom(TRENDING_HASHTAG_BASES, 8)
    trendingPicks.forEach(t => tags.add(t))

    // Platform-specific
    if (platform === 'ig' || platform === 'instagram') {
      tags.add('instagramreels')
      tags.add('reelsinstagram')
    }
    if (platform === 'tiktok') {
      tags.add('tiktok')
      tags.add('tiktokviral')
    }
    if (platform === 'li' || platform === 'linkedin') {
      tags.add('linkedin')
      tags.add('linkedintips')
    }

    // Niche combos
    tags.add(`${nicheTag}tips`)
    tags.add(`${nicheTag}2026`)

    return Array.from(tags).slice(0, 20)
  }

  private qualityPass(pieces: GeneratedPiece[]): GeneratedPiece[] {
    return pieces.map(piece => {
      let score = 0
      const issues: string[] = []

      // Check hook strength
      if (piece.hook_used.length > 10) score += 2
      else issues.push('Hook too short')

      // Check script/body length
      if (piece.format === 'reel' && piece.script.length > 200) score += 2
      else if (piece.format !== 'reel' && piece.body.length > 100) score += 2
      else issues.push('Content too thin')

      // Check hashtags
      if (piece.hashtags.length >= 5) score += 1
      else issues.push('Too few hashtags')

      // Check visual direction
      if (piece.visual_direction.length > 50) score += 1
      else issues.push('Weak visual direction')

      // Check CTA presence
      if (piece.body.toLowerCase().includes('follow') || piece.body.toLowerCase().includes('save') || piece.body.toLowerCase().includes('comment')) {
        score += 1
      } else {
        issues.push('Missing CTA')
        // Fix: add a CTA
        piece.body += `\n\n${pickRandom(CTA_TEMPLATES)[0]}`
      }

      // Store quality data
      piece.research_notes = {
        ...piece.research_notes,
        quality_score: score,
        quality_max: 7,
        quality_issues: issues,
      }

      return piece
    })
  }

  private async updateProgress(step: string, detail: string, pct: number) {
    await this.supabase.from('content_batches').update({
      status: step,
      progress: { step, detail, pct },
      updated_at: new Date().toISOString(),
    }).eq('id', this.batchId)
  }
}
