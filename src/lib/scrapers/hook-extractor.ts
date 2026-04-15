/**
 * Hook Extractor - Analyzes a single URL (IG Reel, TikTok, YouTube Short)
 * and extracts structured hook data ready for the database.
 * 
 * Setup:
 * - OPENAI_API_KEY: Optional — enables AI-powered analysis
 *   Without it, uses keyword-based categorization (still useful)
 * - APIFY_API_TOKEN: Optional — enables richer data extraction for IG/TikTok
 */

import {
  categorizeHook,
  extractHookText,
  generateHookTemplate,
  calculateViralityScore,
  type HookType,
} from './trend-scanner'

// ─── Types ──────────────────────────────────────────────────────────

export interface HookAnalysis {
  url: string
  platform: 'tiktok' | 'instagram' | 'youtube' | 'unknown'
  title: string
  description: string
  caption: string
  view_count: number
  like_count: number
  comment_count: number
  hook_text: string
  hook_type: HookType
  hook_template: string
  virality_score: number
  tags: string[]
  mood: string
  energy: 'low' | 'medium' | 'high'
  persona_match: string | null
  analyzed_at: string
}

// ─── Platform Detection ─────────────────────────────────────────────

function detectPlatform(url: string): HookAnalysis['platform'] {
  if (/tiktok\.com/i.test(url)) return 'tiktok'
  if (/instagram\.com/i.test(url)) return 'instagram'
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube'
  return 'unknown'
}

// ─── Mood/Energy Detection (keyword-based) ──────────────────────────

function detectMood(text: string): string {
  const lower = text.toLowerCase()
  if (/😂|funny|hilarious|lol|lmao|comedy/i.test(lower)) return 'humorous'
  if (/🔥|fire|insane|crazy|wild|mind.?blow/i.test(lower)) return 'hype'
  if (/😤|angry|frustrated|rant|sick of/i.test(lower)) return 'frustrated'
  if (/💰|money|revenue|income|profit|cash/i.test(lower)) return 'aspirational'
  if (/📚|learn|tip|hack|strategy|secret/i.test(lower)) return 'educational'
  if (/❤️|love|grateful|blessed|thankful/i.test(lower)) return 'heartfelt'
  if (/⚠️|warning|careful|don't|avoid|mistake/i.test(lower)) return 'cautionary'
  return 'neutral'
}

function detectEnergy(text: string): HookAnalysis['energy'] {
  const lower = text.toLowerCase()
  const highEnergy = /!{2,}|🔥|💥|omg|insane|crazy|wild|must see|urgent|now/i
  const lowEnergy = /calm|slow|quiet|gentle|peaceful|mindful|relax/i
  if (highEnergy.test(lower)) return 'high'
  if (lowEnergy.test(lower)) return 'low'
  return 'medium'
}

function suggestPersonaMatch(hookType: HookType, mood: string): string | null {
  // Map hook types to persona suggestions
  const mapping: Record<string, string[]> = {
    curiosity_gap: ['thought_leader', 'insider'],
    bold_claim: ['authority', 'disruptor'],
    pattern_interrupt: ['entertainer', 'creative'],
    social_proof: ['authority', 'mentor'],
    fear_of_missing_out: ['trendsetter', 'insider'],
    how_to: ['educator', 'mentor'],
    controversy: ['disruptor', 'thought_leader'],
    storytelling: ['relatable', 'mentor'],
    listicle: ['educator', 'curator'],
    question: ['community_builder', 'relatable'],
  }
  const matches = mapping[hookType] || []
  return matches[0] || null
}

// ─── URL Fetchers ───────────────────────────────────────────────────

async function fetchTikTokData(url: string): Promise<Partial<HookAnalysis>> {
  try {
    // Try oEmbed first (public, no auth needed)
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
    const res = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (res.ok) {
      const data = await res.json()
      return {
        title: data.title || '',
        description: data.title || '',
        caption: data.title || '',
        // oEmbed doesn't give counts, but gives the caption
      }
    }
  } catch {
    // Fall through to HTML scrape
  }

  // Fallback: fetch the page HTML
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    })
    if (!res.ok) return {}
    const html = await res.text()

    // Extract meta tags
    const title = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"/)?.[ 1] || ''
    const description = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/)?.[ 1] || ''

    // Try to extract view count from meta or JSON-LD
    const jsonLd = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([^<]+)<\/script>/)
    let viewCount = 0
    let likeCount = 0
    let commentCount = 0
    if (jsonLd) {
      try {
        const ld = JSON.parse(jsonLd[1])
        viewCount = Number(ld.interactionStatistic?.find?.((s: { interactionType: string }) =>
          s.interactionType?.includes('Watch'))?.userInteractionCount || 0)
        likeCount = Number(ld.interactionStatistic?.find?.((s: { interactionType: string }) =>
          s.interactionType?.includes('Like'))?.userInteractionCount || 0)
        commentCount = Number(ld.interactionStatistic?.find?.((s: { interactionType: string }) =>
          s.interactionType?.includes('Comment'))?.userInteractionCount || 0)
      } catch { /* ignore */ }
    }

    return {
      title,
      description,
      caption: description || title,
      view_count: viewCount,
      like_count: likeCount,
      comment_count: commentCount,
    }
  } catch {
    return {}
  }
}

async function fetchInstagramData(url: string): Promise<Partial<HookAnalysis>> {
  try {
    // Try oEmbed (public, limited data)
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`
    const res = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (res.ok) {
      const data = await res.json()
      return {
        title: data.title || '',
        caption: data.title || '',
        description: data.title || '',
      }
    }
  } catch {
    // Fall through
  }

  // Fallback: HTML meta tags
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    })
    if (!res.ok) return {}
    const html = await res.text()
    const title = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"/)?.[ 1] || ''
    const description = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/)?.[ 1] || ''
    return { title, description, caption: description || title }
  } catch {
    return {}
  }
}

async function fetchYouTubeData(url: string): Promise<Partial<HookAnalysis>> {
  try {
    // oEmbed (public)
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    const res = await fetch(oembedUrl)
    if (res.ok) {
      const data = await res.json()
      return {
        title: data.title || '',
        caption: data.title || '',
        description: data.title || '',
      }
    }
  } catch {
    // Fall through
  }
  return {}
}

// ─── Main Extractor ─────────────────────────────────────────────────

export async function extractHook(url: string): Promise<HookAnalysis> {
  const platform = detectPlatform(url)

  // Fetch platform-specific data
  let platformData: Partial<HookAnalysis> = {}
  switch (platform) {
    case 'tiktok':
      platformData = await fetchTikTokData(url)
      break
    case 'instagram':
      platformData = await fetchInstagramData(url)
      break
    case 'youtube':
      platformData = await fetchYouTubeData(url)
      break
    default:
      // Try generic HTML meta scrape
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
          redirect: 'follow',
        })
        if (res.ok) {
          const html = await res.text()
          const title = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"/)?.[ 1] ||
            html.match(/<title>([^<]*)<\/title>/)?.[ 1] || ''
          const desc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/)?.[ 1] || ''
          platformData = { title, description: desc, caption: desc || title }
        }
      } catch { /* ignore */ }
  }

  const caption = platformData.caption || platformData.description || platformData.title || ''
  const hookText = extractHookText(caption)
  const hookType = categorizeHook(hookText)
  const hookTemplate = generateHookTemplate(hookText)
  const mood = detectMood(caption)
  const energy = detectEnergy(caption)
  const personaMatch = suggestPersonaMatch(hookType, mood)
  const tags = extractTags(caption)

  const viewCount = platformData.view_count || 0
  const likeCount = platformData.like_count || 0
  const commentCount = platformData.comment_count || 0

  return {
    url,
    platform,
    title: platformData.title || '',
    description: platformData.description || '',
    caption,
    view_count: viewCount,
    like_count: likeCount,
    comment_count: commentCount,
    hook_text: hookText,
    hook_type: hookType,
    hook_template: hookTemplate,
    virality_score: calculateViralityScore(viewCount, likeCount, commentCount, 0),
    tags,
    mood,
    energy,
    persona_match: personaMatch,
    analyzed_at: new Date().toISOString(),
  }
}

function extractTags(caption: string): string[] {
  const hashtags = (caption.match(/#\w+/g) || []).map((h) => h.replace('#', '').toLowerCase())
  // Also extract key topics
  const topics: string[] = []
  if (/market/i.test(caption)) topics.push('marketing')
  if (/business/i.test(caption)) topics.push('business')
  if (/social media/i.test(caption)) topics.push('social-media')
  if (/content/i.test(caption)) topics.push('content-creation')
  if (/brand/i.test(caption)) topics.push('branding')
  if (/sale|revenue|money|income/i.test(caption)) topics.push('sales')
  if (/growth|grow/i.test(caption)) topics.push('growth')
  if (/restaurant|food|chef/i.test(caption)) topics.push('restaurant')
  if (/salon|beauty|hair/i.test(caption)) topics.push('beauty')
  const combined = hashtags.concat(topics)
  const unique: string[] = []
  const seen = new Set<string>()
  for (const t of combined) {
    if (!seen.has(t)) { seen.add(t); unique.push(t) }
  }
  return unique
}
