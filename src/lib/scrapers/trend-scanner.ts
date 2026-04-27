/**
 * Trend Scanner - Scrapes viral content from TikTok and Instagram
 * 
 * Setup:
 * - APIFY_API_TOKEN: Required for Instagram scraping (already in .env.local)
 * - OPENAI_API_KEY: Optional - enables AI-powered hook categorization
 *   Without it, falls back to keyword-based categorization
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface TrendItem {
  id: string
  platform: 'tiktok' | 'instagram' | 'youtube'
  url: string
  caption: string
  hashtags: string[]
  sound_name: string | null
  view_count: number
  like_count: number
  comment_count: number
  share_count: number
  hook_text: string
  hook_type: HookType
  hook_template: string
  virality_score: number
  video_format: string | null
  scraped_at: string
}

export type HookType =
  | 'curiosity_gap'
  | 'bold_claim'
  | 'pattern_interrupt'
  | 'social_proof'
  | 'fear_of_missing_out'
  | 'how_to'
  | 'controversy'
  | 'storytelling'
  | 'listicle'
  | 'question'
  | 'unknown'

export interface ScanResult {
  tiktok: TrendItem[]
  instagram: TrendItem[]
  total: number
  scanned_at: string
  errors: string[]
}

// ─── Hook Categorization (keyword fallback) ─────────────────────────

const HOOK_PATTERNS: { type: HookType; patterns: RegExp[] }[] = [
  {
    type: 'curiosity_gap',
    patterns: [
      /you won't believe/i, /nobody talks about/i, /the secret/i,
      /what they don't tell you/i, /here's what happened/i, /wait for it/i,
      /i can't believe/i, /the truth about/i, /you're not going to believe/i,
    ],
  },
  {
    type: 'bold_claim',
    patterns: [
      /this is the \w+ way/i, /stop doing/i, /you're doing .+ wrong/i,
      /the only .+ you need/i, /guaranteed/i, /this changed everything/i,
      /\d+x (?:faster|better|more)/i, /best .+ ever/i,
    ],
  },
  {
    type: 'pattern_interrupt',
    patterns: [
      /pov:/i, /wait/i, /hold on/i, /plot twist/i, /not what you think/i,
      /but here's the thing/i, /unpopular opinion/i,
    ],
  },
  {
    type: 'social_proof',
    patterns: [
      /\d+ (?:people|clients|customers)/i, /my client/i, /we helped/i,
      /case study/i, /results/i, /before and after/i, /transformation/i,
    ],
  },
  {
    type: 'fear_of_missing_out',
    patterns: [
      /before it's too late/i, /don't miss/i, /limited/i, /last chance/i,
      /trending/i, /everyone is/i, /you need to see this/i,
    ],
  },
  {
    type: 'how_to',
    patterns: [
      /how to/i, /step by step/i, /tutorial/i, /guide/i, /learn how/i,
      /here's how/i, /\d+ steps/i, /the process/i,
    ],
  },
  {
    type: 'controversy',
    patterns: [
      /hot take/i, /controversial/i, /i don't care what/i, /fight me/i,
      /agree or disagree/i, /overrated/i, /let's talk about/i,
    ],
  },
  {
    type: 'storytelling',
    patterns: [
      /storytime/i, /story time/i, /let me tell you/i, /so this happened/i,
      /i was today years old/i, /when i/i, /the day i/i,
    ],
  },
  {
    type: 'listicle',
    patterns: [
      /\d+ (?:things|tips|ways|reasons|mistakes|hacks)/i, /top \d+/i,
      /list of/i, /here are \d+/i,
    ],
  },
  {
    type: 'question',
    patterns: [
      /^(?:do you|did you|have you|are you|is it|what if|why do|how do)/i,
      /\?$/, /wondering/i,
    ],
  },
]

function categorizeHook(text: string): HookType {
  for (const { type, patterns } of HOOK_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return type
    }
  }
  return 'unknown'
}

function extractHookText(caption: string): string {
  // First line or first sentence
  const firstLine = caption.split('\n')[0].trim()
  const firstSentence = firstLine.split(/[.!?]/)[0].trim()
  return firstSentence || firstLine || caption.slice(0, 100)
}

function generateHookTemplate(hookText: string): string {
  // Replace specific nouns/numbers with [BLANKS]
  let template = hookText
  // Replace numbers
  template = template.replace(/\$[\d,]+/g, '[AMOUNT]')
  template = template.replace(/\b\d{2,}\b/g, '[NUMBER]')
  // Replace quoted phrases
  template = template.replace(/"[^"]+"/g, '"[PHRASE]"')
  // Replace specific business types
  template = template.replace(/\b(restaurant|salon|gym|spa|clinic|agency|shop|store|cafe|bar)\b/gi, '[BUSINESS_TYPE]')
  // Replace specific platforms
  template = template.replace(/\b(Instagram|TikTok|Facebook|LinkedIn|YouTube)\b/gi, '[PLATFORM]')
  // Replace time periods
  template = template.replace(/\b(\d+\s*(?:days?|weeks?|months?|years?|hours?))\b/gi, '[TIME_PERIOD]')
  return template
}

function calculateViralityScore(views: number, likes: number, comments: number, shares: number): number {
  if (views === 0) return 0
  const engagementRate = ((likes + comments * 2 + shares * 3) / views) * 100
  // Score 0-100 based on engagement rate and absolute numbers
  let score = 0
  // Engagement rate component (0-50)
  if (engagementRate > 10) score += 50
  else if (engagementRate > 5) score += 40
  else if (engagementRate > 2) score += 30
  else if (engagementRate > 1) score += 20
  else score += Math.min(engagementRate * 10, 15)
  // View count component (0-30)
  if (views > 10_000_000) score += 30
  else if (views > 1_000_000) score += 25
  else if (views > 100_000) score += 20
  else if (views > 10_000) score += 15
  else if (views > 1_000) score += 10
  else score += 5
  // Shares bonus (0-20)
  if (shares > 10_000) score += 20
  else if (shares > 1_000) score += 15
  else if (shares > 100) score += 10
  else if (shares > 10) score += 5
  return Math.min(Math.round(score), 100)
}

// ─── TikTok Creative Center Scraper ─────────────────────────────────

async function scrapeTikTokTrends(): Promise<TrendItem[]> {
  const items: TrendItem[] = []
  try {
    // TikTok Creative Center API endpoint for trending content
    // This is the public API that powers the Creative Center website
    const url = 'https://ads.tiktok.com/creative_radar_api/v1/popular_trend/list?page=1&limit=50&period=7&country_code=US&sort_by=popular'
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/pc/en',
      },
    })

    if (!res.ok) {
      // Fallback: try scraping the HTML page
      return await scrapeTikTokHTML()
    }

    const data = await res.json()
    const videos = data?.data?.videos || data?.data?.materials || []

    for (const video of videos) {
      const caption = video.title || video.caption || video.desc || ''
      const hookText = extractHookText(caption)
      const hashtags = (video.hashtags || []).map((h: { name?: string } | string) =>
        typeof h === 'string' ? h : h.name || ''
      )

      items.push({
        id: `tiktok_${video.id || video.item_id || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        platform: 'tiktok',
        url: video.video_link || video.url || `https://www.tiktok.com/@${video.author_name || 'unknown'}/video/${video.id || ''}`,
        caption,
        hashtags,
        sound_name: video.music_title || video.sound_name || null,
        view_count: Number(video.vv_cnt || video.play_count || video.views || 0),
        like_count: Number(video.like_cnt || video.digg_count || video.likes || 0),
        comment_count: Number(video.comment_cnt || video.comment_count || 0),
        share_count: Number(video.share_cnt || video.share_count || 0),
        hook_text: hookText,
        hook_type: categorizeHook(hookText),
        hook_template: generateHookTemplate(hookText),
        virality_score: calculateViralityScore(
          Number(video.vv_cnt || video.play_count || 0),
          Number(video.like_cnt || video.digg_count || 0),
          Number(video.comment_cnt || video.comment_count || 0),
          Number(video.share_cnt || video.share_count || 0),
        ),
        video_format: video.video_duration ? `${video.video_duration}s` : null,
        scraped_at: new Date().toISOString(),
      })
    }
  } catch (err) {
    console.error('[TrendScanner] TikTok API error, trying HTML fallback:', err)
    return await scrapeTikTokHTML()
  }
  return items
}

async function scrapeTikTokHTML(): Promise<TrendItem[]> {
  // Fallback HTML scraper — limited but works without API
  const items: TrendItem[] = []
  try {
    const res = await fetch(
      'https://ads.tiktok.com/business/creativecenter/inspiration/popular/pc/en',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
      }
    )
    if (!res.ok) return items
    const html = await res.text()

    // Extract JSON data embedded in the page (Next.js / SSR data)
    const scriptMatch = html.match(/<script[^>]*>window\.__INITIAL_STATE__\s*=\s*({.+?})<\/script>/)
      || html.match(/"props":\s*({.+?})\s*,\s*"page"/)

    if (scriptMatch) {
      try {
        const data = JSON.parse(scriptMatch[1])
        // Navigate the data structure to find video items
        const videos = data?.popularTrend?.videos || data?.videos || []
        for (const v of videos.slice(0, 30)) {
          const caption = v.title || v.desc || ''
          const hookText = extractHookText(caption)
          items.push({
            id: `tiktok_html_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            platform: 'tiktok',
            url: v.url || '',
            caption,
            hashtags: (v.hashtags || []).map((h: string | { name: string }) => typeof h === 'string' ? h : h.name),
            sound_name: v.music || null,
            view_count: Number(v.views || 0),
            like_count: Number(v.likes || 0),
            comment_count: Number(v.comments || 0),
            share_count: Number(v.shares || 0),
            hook_text: hookText,
            hook_type: categorizeHook(hookText),
            hook_template: generateHookTemplate(hookText),
            virality_score: calculateViralityScore(
              Number(v.views || 0), Number(v.likes || 0),
              Number(v.comments || 0), Number(v.shares || 0),
            ),
            video_format: null,
            scraped_at: new Date().toISOString(),
          })
        }
      } catch {
        // JSON parse failed — page structure changed
      }
    }
  } catch (err) {
    console.error('[TrendScanner] TikTok HTML scrape failed:', err)
  }
  return items
}

// ─── Instagram Reels Scraper (via Apify) ────────────────────────────

const TARGET_HASHTAGS = [
  'marketing',
  'smallbusiness',
  'entrepreneurlife',
  'businesstips',
  'socialmediamarketing',
  'restaurantowner',
  'salonowner',
]

async function scrapeInstagramTrends(apifyToken: string): Promise<TrendItem[]> {
  const items: TrendItem[] = []

  // Use Apify's Instagram Hashtag Scraper
  // Actor: apify/instagram-hashtag-scraper or apify/instagram-scraper
  const actorId = 'apify~instagram-hashtag-scraper'
  const apiUrl = `https://api.apify.com/v2/acts/${actorId}/runs`

  try {
    // Start the actor run
    const runRes = await fetch(`${apiUrl}?token=${apifyToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hashtags: TARGET_HASHTAGS,
        resultsLimit: 10, // per hashtag
        resultsType: 'posts',
        searchType: 'hashtag',
      }),
    })

    if (!runRes.ok) {
      // Try alternative actor
      return await scrapeInstagramAlternative(apifyToken)
    }

    const runData = await runRes.json()
    const runId = runData?.data?.id

    if (!runId) {
      console.error('[TrendScanner] No Apify run ID returned')
      return items
    }

    // Poll for completion (max 5 minutes)
    const maxWait = 300_000
    const pollInterval = 10_000
    let elapsed = 0
    let status = 'RUNNING'

    while (status === 'RUNNING' && elapsed < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval))
      elapsed += pollInterval

      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`
      )
      const statusData = await statusRes.json()
      status = statusData?.data?.status || 'FAILED'
    }

    if (status !== 'SUCCEEDED') {
      console.error(`[TrendScanner] Apify run ${runId} ended with status: ${status}`)
      return items
    }

    // Fetch results from the dataset
    const datasetId = runData?.data?.defaultDatasetId
    if (!datasetId) return items

    const resultsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&limit=100`
    )
    const results = await resultsRes.json()

    for (const post of Array.isArray(results) ? results : []) {
      const caption = post.caption || post.text || ''
      const hookText = extractHookText(caption)
      const hashtags = (caption.match(/#\w+/g) || []).map((h: string) => h.replace('#', ''))

      items.push({
        id: `ig_${post.id || post.shortCode || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        platform: 'instagram',
        url: post.url || (post.shortCode ? `https://www.instagram.com/reel/${post.shortCode}/` : ''),
        caption,
        hashtags,
        sound_name: post.musicInfo?.title || post.audioName || null,
        view_count: Number(post.videoViewCount || post.viewCount || post.playCount || 0),
        like_count: Number(post.likesCount || post.likeCount || 0),
        comment_count: Number(post.commentsCount || post.commentCount || 0),
        share_count: 0, // Instagram doesn't expose share count publicly
        hook_text: hookText,
        hook_type: categorizeHook(hookText),
        hook_template: generateHookTemplate(hookText),
        virality_score: calculateViralityScore(
          Number(post.videoViewCount || post.viewCount || 0),
          Number(post.likesCount || post.likeCount || 0),
          Number(post.commentsCount || post.commentCount || 0),
          0,
        ),
        video_format: post.type === 'Video' || post.isVideo ? 'reel' : 'image',
        scraped_at: new Date().toISOString(),
      })
    }
  } catch (err) {
    console.error('[TrendScanner] Instagram Apify scrape failed:', err)
  }

  return items
}

async function scrapeInstagramAlternative(apifyToken: string): Promise<TrendItem[]> {
  // Alternative: use apify/instagram-scraper with hashtag search
  const items: TrendItem[] = []
  const actorId = 'apify~instagram-scraper'
  const apiUrl = `https://api.apify.com/v2/acts/${actorId}/runs`

  try {
    const runRes = await fetch(`${apiUrl}?token=${apifyToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        search: TARGET_HASHTAGS.join(' '),
        searchType: 'hashtag',
        resultsLimit: 50,
        searchLimit: 3,
      }),
    })

    if (!runRes.ok) return items

    const runData = await runRes.json()
    const runId = runData?.data?.id
    if (!runId) return items

    // Poll for completion
    let elapsed = 0
    let status = 'RUNNING'
    while (status === 'RUNNING' && elapsed < 300_000) {
      await new Promise((r) => setTimeout(r, 10_000))
      elapsed += 10_000
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`)
      const statusData = await statusRes.json()
      status = statusData?.data?.status || 'FAILED'
    }

    if (status !== 'SUCCEEDED') return items

    const datasetId = runData?.data?.defaultDatasetId
    if (!datasetId) return items

    const resultsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&limit=100`
    )
    const results = await resultsRes.json()

    for (const post of Array.isArray(results) ? results : []) {
      const caption = post.caption || ''
      const hookText = extractHookText(caption)
      items.push({
        id: `ig_alt_${post.id || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        platform: 'instagram',
        url: post.url || '',
        caption,
        hashtags: (caption.match(/#\w+/g) || []).map((h: string) => h.replace('#', '')),
        sound_name: post.musicInfo?.title || null,
        view_count: Number(post.videoViewCount || 0),
        like_count: Number(post.likesCount || 0),
        comment_count: Number(post.commentsCount || 0),
        share_count: 0,
        hook_text: hookText,
        hook_type: categorizeHook(hookText),
        hook_template: generateHookTemplate(hookText),
        virality_score: calculateViralityScore(
          Number(post.videoViewCount || 0),
          Number(post.likesCount || 0),
          Number(post.commentsCount || 0),
          0,
        ),
        video_format: post.type === 'Video' ? 'reel' : 'image',
        scraped_at: new Date().toISOString(),
      })
    }
  } catch (err) {
    console.error('[TrendScanner] Instagram alternative scrape failed:', err)
  }
  return items
}

// ─── Main Scanner ───────────────────────────────────────────────────

export async function scanTrends(): Promise<ScanResult> {
  const errors: string[] = []
  const { getSecret } = await import('@/lib/secrets')
  const apifyToken =
    (await getSecret('APIFY_TOKEN')) ||
    (await getSecret('APIFY_API_TOKEN')) ||
    ''

  // Run scrapers in parallel
  const [tiktokItems, instagramItems] = await Promise.allSettled([
    scrapeTikTokTrends(),
    apifyToken ? scrapeInstagramTrends(apifyToken) : Promise.resolve([]),
  ])

  const tiktok = tiktokItems.status === 'fulfilled' ? tiktokItems.value : []
  const instagram = instagramItems.status === 'fulfilled' ? instagramItems.value : []

  if (tiktokItems.status === 'rejected') {
    errors.push(`TikTok scrape failed: ${tiktokItems.reason}`)
  }
  if (instagramItems.status === 'rejected') {
    errors.push(`Instagram scrape failed: ${instagramItems.reason}`)
  }
  if (!apifyToken) {
    errors.push('APIFY_API_TOKEN not set — Instagram scraping skipped')
  }

  return {
    tiktok,
    instagram,
    total: tiktok.length + instagram.length,
    scanned_at: new Date().toISOString(),
    errors,
  }
}

// Re-export utilities for use by other modules
export {
  categorizeHook,
  extractHookText,
  generateHookTemplate,
  calculateViralityScore,
}
