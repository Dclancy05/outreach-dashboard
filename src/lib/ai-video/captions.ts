/**
 * Caption Generation Module
 * Transcribes audio with word-level timestamps and generates ASS subtitle files
 * with animated word-by-word karaoke-style highlighting
 */

import * as fs from 'fs'

/** Word with precise timing */
export interface WordTimestamp {
  word: string
  start: number
  end: number
}

/** Available caption visual styles */
export type CaptionStyle = 'bold_yellow' | 'minimal_white' | 'neon_glow' | 'bounce'

/**
 * Transcribe audio file with word-level timestamps using OpenAI Whisper API
 * Falls back to estimated timing from script if no API key
 * @param audioPath - Path to the audio file (MP3/WAV)
 * @returns Array of words with start/end timestamps
 */
export async function transcribeWithTimestamps(audioPath: string): Promise<WordTimestamp[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.log('[Captions] No OPENAI_API_KEY — falling back to estimated timing')
    return estimateTimingsFromFile(audioPath)
  }

  try {
    const fileBuffer = fs.readFileSync(audioPath)
    const formData = new FormData()
    formData.append('file', new Blob([fileBuffer]), 'audio.mp3')
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'verbose_json')
    formData.append('timestamp_granularities[]', 'word')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Whisper API error (${response.status}): ${errorText}`)
    }

    const result = await response.json()
    const words: WordTimestamp[] = (result.words || []).map(
      (w: { word: string; start: number; end: number }) => ({
        word: w.word.trim(),
        start: w.start,
        end: w.end,
      })
    )

    return words.length > 0 ? words : estimateTimingsFromText(result.text || '', 0)
  } catch (error) {
    console.error('[Captions] Whisper transcription failed:', error)
    return estimateTimingsFromFile(audioPath)
  }
}

/**
 * Estimate word timings from file (fallback when no Whisper API)
 * Assumes ~150 words/min speaking pace
 */
function estimateTimingsFromFile(audioPath: string): WordTimestamp[] {
  // Try to read the script from a sidecar .txt file
  const txtPath = audioPath.replace(/\.[^.]+$/, '.txt')
  let text = ''
  try {
    text = fs.readFileSync(txtPath, 'utf-8')
  } catch {
    text = 'No transcript available'
  }
  return estimateTimingsFromText(text, 0)
}

/**
 * Estimate word timings from text at ~150 words/min
 * @param text - The script text
 * @param startTime - Starting timestamp
 * @returns Estimated word timestamps
 */
export function estimateTimingsFromText(text: string, startTime: number): WordTimestamp[] {
  const words = text.split(/\s+/).filter(Boolean)
  const wordsPerSecond = 150 / 60 // 2.5 words/sec
  const wordDuration = 1 / wordsPerSecond

  return words.map((word, i) => ({
    word,
    start: startTime + i * wordDuration,
    end: startTime + (i + 1) * wordDuration,
  }))
}

/**
 * Generate an ASS (Advanced SubStation Alpha) subtitle file content
 * with word-by-word karaoke-style highlighting
 * @param words - Array of word timestamps
 * @param style - Visual style preset
 * @returns ASS file content as a string
 */
export function generateASS(words: WordTimestamp[], style: CaptionStyle): string {
  const styles = getStyleDefinition(style)
  const events = generateEvents(words, style)

  return `[Script Info]
Title: AI Video Captions
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles.inactive}
${styles.active}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`
}

/** Style definitions for each caption preset */
function getStyleDefinition(style: CaptionStyle): { inactive: string; active: string } {
  switch (style) {
    case 'bold_yellow':
      // TikTok-style: white text, yellow highlight on active word
      return {
        inactive:
          'Style: Inactive,Arial Black,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,200,1',
        active:
          'Style: Active,Arial Black,80,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,200,1',
      }
    case 'minimal_white':
      // Clean minimal: white text with subtle shadow
      return {
        inactive:
          'Style: Inactive,Helvetica Neue,64,&H00FFFFFF,&H000000FF,&H00000000,&H40000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,200,1',
        active:
          'Style: Active,Helvetica Neue,68,&H00FFFFFF,&H000000FF,&H00333333,&H40000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,200,1',
      }
    case 'neon_glow':
      // Neon glow: cyan text with glow effect
      return {
        inactive:
          'Style: Inactive,Impact,72,&H00FFFF00,&H000000FF,&H00FF8800,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,40,40,200,1',
        active:
          'Style: Active,Impact,80,&H0000FFFF,&H000000FF,&H00FF00FF,&H00000000,-1,0,0,0,110,110,0,0,1,5,0,2,40,40,200,1',
      }
    case 'bounce':
      // Bouncy: bold text with scale animation on active word
      return {
        inactive:
          'Style: Inactive,Futura,70,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,200,1',
        active:
          'Style: Active,Futura,85,&H0000AAFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,120,120,0,0,1,5,2,2,40,40,200,1',
      }
  }
}

/** Format seconds to ASS timestamp (H:MM:SS.CC) */
function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const cs = Math.floor((seconds % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

/**
 * Generate ASS dialogue events — shows groups of words (3-5 per line)
 * with the current word highlighted using the Active style
 */
function generateEvents(words: WordTimestamp[], style: CaptionStyle): string {
  const lines: string[] = []
  const groupSize = style === 'minimal_white' ? 4 : 3

  for (let g = 0; g < words.length; g += groupSize) {
    const group = words.slice(g, g + groupSize)
    const groupStart = group[0].start
    const groupEnd = group[group.length - 1].end

    // For each word in the group, show the full group text but highlight current word
    for (let w = 0; w < group.length; w++) {
      const word = group[w]
      const wordStart = formatASSTime(word.start)
      const wordEnd = formatASSTime(word.end)

      // Build the line text with override tags for highlighting
      const textParts = group.map((gw, gi) => {
        if (gi === w) {
          // Active word — use override for the Active style colors
          const overrides = getActiveOverrides(style)
          return `{${overrides}}${gw.word}{\\r}`
        }
        return gw.word
      })

      lines.push(
        `Dialogue: 0,${wordStart},${wordEnd},Inactive,,0,0,0,,${textParts.join(' ')}`
      )
    }

    // Also show the full group text as base layer during gaps between words
    if (group.length > 1) {
      const gapStart = formatASSTime(groupStart)
      const gapEnd = formatASSTime(groupEnd)
      lines.push(
        `Dialogue: -1,${gapStart},${gapEnd},Inactive,,0,0,0,,${group.map((w) => w.word).join(' ')}`
      )
    }
  }

  return lines.join('\n')
}

/** Get ASS override tags for highlighting the active word */
function getActiveOverrides(style: CaptionStyle): string {
  switch (style) {
    case 'bold_yellow':
      return '\\c&H0000FFFF&\\fscx110\\fscy110'
    case 'minimal_white':
      return '\\b1\\bord3'
    case 'neon_glow':
      return '\\c&H0000FFFF&\\bord5\\blur3\\fscx115\\fscy115'
    case 'bounce':
      return '\\c&H0000AAFF&\\fscx130\\fscy130\\t(0,100,\\fscx120\\fscy120)'
  }
}
