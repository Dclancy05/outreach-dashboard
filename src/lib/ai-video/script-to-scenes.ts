/**
 * Script-to-Scenes Converter
 * Takes a raw script and intelligently breaks it into visual scenes
 * with prompts for AI video generation
 */

export interface SceneDescription {
  text: string
  visualPrompt: string
  durationSeconds: number
}

/** Visual keyword mappings for generating scene prompts */
const VISUAL_KEYWORDS: Record<string, string> = {
  // Business/finance
  revenue: 'graph going up on a screen, modern office',
  profit: 'stack of money, financial charts trending upward',
  growth: 'plant growing timelapse, upward arrow graphics',
  customers: 'busy store with happy customers browsing',
  clients: 'professional meeting in a modern conference room',
  sales: 'cash register ringing, product display showcase',
  money: 'coins and bills, financial success imagery',
  invest: 'stock market charts, portfolio dashboard',
  startup: 'modern coworking space, laptop and coffee',
  business: 'professional office environment, city skyline',
  brand: 'logo design on screen, brand identity collage',
  marketing: 'social media feeds scrolling, ad campaign visuals',
  strategy: 'chess pieces on board, whiteboard with diagrams',

  // Technology
  software: 'code on screen, sleek laptop in modern workspace',
  app: 'smartphone showing app interface, finger tapping screen',
  website: 'browser showing beautiful website, responsive design',
  ai: 'futuristic neural network visualization, glowing circuits',
  digital: 'digital transformation, data flowing through screens',
  automation: 'robotic process, conveyor belt, seamless workflow',
  data: 'data visualization dashboard, charts and graphs',
  cloud: 'server room with blue lights, cloud computing icons',

  // People/lifestyle
  team: 'diverse team collaborating around table, teamwork',
  success: 'person celebrating on mountain top, confetti',
  struggle: 'person working late, overcoming obstacles',
  learn: 'person reading book, classroom setting, lightbulb moment',
  health: 'person exercising outdoors, healthy food preparation',
  travel: 'airplane taking off, beautiful travel destination',
  family: 'happy family together, warm home environment',
  community: 'group of people gathering, community event',

  // Action words
  transform: 'butterfly emerging from cocoon, before/after split screen',
  build: 'construction timelapse, hands assembling something',
  create: 'artist painting, creative workspace with supplies',
  launch: 'rocket launching, product reveal with dramatic lighting',
  discover: 'explorer with magnifying glass, treasure chest opening',
  solve: 'puzzle pieces coming together, lightbulb illuminating',
  connect: 'hands shaking, network nodes connecting',
  achieve: 'trophy being raised, crossing finish line',

  // Emotions
  happy: 'smiling faces, bright sunny environment',
  excited: 'crowd cheering, fireworks, celebration',
  calm: 'peaceful lake at sunset, meditation scene',
  urgent: 'clock ticking, fast-paced city movement',
  confident: 'person speaking on stage, power pose',

  // Defaults for common sentence patterns
  question: 'person thinking, question mark graphics',
  problem: 'frustrated person at desk, red warning signs',
  solution: 'lightbulb moment, green checkmark, smooth workflow',
  result: 'before and after comparison, impressive transformation',
  story: 'open book, cinematic storytelling montage',
}

/**
 * Split a raw script into scenes with visual prompts
 * @param script - The full narration script
 * @returns Array of scene descriptions with visual prompts and durations
 */
export function scriptToScenes(script: string): SceneDescription[] {
  const sentences = splitIntoSentences(script)
  const scenes: SceneDescription[] = []

  // Group short sentences together (target 10-20 words per scene)
  let currentGroup: string[] = []
  let currentWordCount = 0
  const TARGET_WORDS = 15
  const MIN_WORDS = 8
  const MAX_WORDS = 30

  for (const sentence of sentences) {
    const wordCount = sentence.split(/\s+/).length

    if (currentWordCount + wordCount > MAX_WORDS && currentGroup.length > 0) {
      // Flush current group
      const text = currentGroup.join(' ')
      scenes.push({
        text,
        visualPrompt: generateVisualPrompt(text),
        durationSeconds: estimateDuration(text),
      })
      currentGroup = [sentence]
      currentWordCount = wordCount
    } else {
      currentGroup.push(sentence)
      currentWordCount += wordCount

      if (currentWordCount >= TARGET_WORDS) {
        const text = currentGroup.join(' ')
        scenes.push({
          text,
          visualPrompt: generateVisualPrompt(text),
          durationSeconds: estimateDuration(text),
        })
        currentGroup = []
        currentWordCount = 0
      }
    }
  }

  // Flush remaining
  if (currentGroup.length > 0) {
    const text = currentGroup.join(' ')
    if (text.split(/\s+/).length >= 3) {
      scenes.push({
        text,
        visualPrompt: generateVisualPrompt(text),
        durationSeconds: estimateDuration(text),
      })
    } else if (scenes.length > 0) {
      // Append tiny remainder to last scene
      scenes[scenes.length - 1].text += ' ' + text
      scenes[scenes.length - 1].durationSeconds = estimateDuration(scenes[scenes.length - 1].text)
    }
  }

  // Ensure minimum of 2 scenes
  if (scenes.length === 1 && scenes[0].text.split(/\s+/).length > MIN_WORDS * 2) {
    const words = scenes[0].text.split(/\s+/)
    const mid = Math.floor(words.length / 2)
    const firstHalf = words.slice(0, mid).join(' ')
    const secondHalf = words.slice(mid).join(' ')
    return [
      { text: firstHalf, visualPrompt: generateVisualPrompt(firstHalf), durationSeconds: estimateDuration(firstHalf) },
      { text: secondHalf, visualPrompt: generateVisualPrompt(secondHalf), durationSeconds: estimateDuration(secondHalf) },
    ]
  }

  return scenes
}

/**
 * Split text into sentences using punctuation boundaries
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space or end
  const raw = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return raw
}

/**
 * Generate a visual prompt for a scene based on keyword analysis
 * @param text - The narration text for this scene
 * @returns A descriptive prompt for AI video generation
 */
function generateVisualPrompt(text: string): string {
  const lower = text.toLowerCase()
  const matches: string[] = []

  // Check for keyword matches
  for (const [keyword, visual] of Object.entries(VISUAL_KEYWORDS)) {
    if (lower.includes(keyword)) {
      matches.push(visual)
    }
  }

  // Check for question patterns
  if (lower.includes('?') || lower.startsWith('how') || lower.startsWith('what') || lower.startsWith('why')) {
    matches.push(VISUAL_KEYWORDS.question)
  }

  // Use top 1-2 matches, or default
  if (matches.length === 0) {
    // Generic B-roll based on sentence position/content
    if (lower.includes('first') || lower.includes('begin') || lower.includes('start')) {
      return 'Cinematic opening shot, sunrise over city skyline, dramatic lighting, 4K quality'
    }
    if (lower.includes('final') || lower.includes('conclusion') || lower.includes('end')) {
      return 'Inspiring closing shot, sunset with silhouette, uplifting atmosphere, cinematic'
    }
    return 'Professional B-roll footage, modern aesthetic, soft lighting, cinematic quality, 9:16 vertical'
  }

  const uniqueMatches = Array.from(new Set(matches)).slice(0, 2)
  return `${uniqueMatches.join(', ')}, cinematic quality, 9:16 vertical format, professional lighting`
}

/**
 * Estimate scene duration based on word count (~150 words/min speaking pace)
 * @param text - Scene narration text
 * @returns Estimated duration in seconds
 */
function estimateDuration(text: string): number {
  const wordCount = text.split(/\s+/).filter(Boolean).length
  const wordsPerSecond = 150 / 60 // 2.5 words/sec
  const duration = wordCount / wordsPerSecond
  // Clamp between 3 and 30 seconds
  return Math.max(3, Math.min(30, Math.round(duration * 10) / 10))
}
