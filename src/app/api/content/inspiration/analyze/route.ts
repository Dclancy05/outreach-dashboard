/**
 * POST /api/content/inspiration/analyze
 * Analyzes a single inspiration URL (IG Reel, TikTok, YouTube Short).
 * Returns hook analysis, persona match, tags, mood/energy.
 * 
 * Body: { url: "https://..." }
 */

import { NextRequest, NextResponse } from 'next/server'
import { extractHook } from '@/lib/scrapers/hook-extractor'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url } = body as { url?: string }

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid "url" in request body' },
        { status: 400 }
      )
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    const analysis = await extractHook(url)

    return NextResponse.json({
      success: true,
      data: analysis,
    })
  } catch (err) {
    console.error('[InspirationAnalyze] Error:', err)
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to analyze URL',
      },
      { status: 500 }
    )
  }
}
