/**
 * API Route: GET /api/content/generate/status
 * Check the current status and progress of video generation
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** Map generation_status to a progress percentage */
const STATUS_PROGRESS: Record<string, number> = {
  pending: 0,
  generating: 5,
  generating_voiceover: 15,
  generating_music: 30,
  generating_clips: 50,
  generating_captions: 75,
  assembling: 90,
  complete: 100,
  error: -1,
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const contentPieceId = searchParams.get('contentPieceId')

    if (!contentPieceId) {
      return NextResponse.json(
        { success: false, error: 'contentPieceId query parameter is required' },
        { status: 400 }
      )
    }

    const { data: piece, error } = await supabase
      .from('content_pieces')
      .select('id, generation_status, video_url, voiceover_url, music_url, captions_path, error_message, updated_at')
      .eq('id', contentPieceId)
      .single()

    if (error || !piece) {
      return NextResponse.json(
        { success: false, error: 'Content piece not found' },
        { status: 404 }
      )
    }

    const status = piece.generation_status || 'unknown'
    const progress = STATUS_PROGRESS[status] ?? 0

    return NextResponse.json({
      success: true,
      contentPieceId: piece.id,
      status,
      progress,
      isComplete: status === 'complete',
      isError: status === 'error',
      videoUrl: piece.video_url || null,
      voiceoverUrl: piece.voiceover_url || null,
      musicUrl: piece.music_url || null,
      captionsPath: piece.captions_path || null,
      errorMessage: piece.error_message || null,
      updatedAt: piece.updated_at,
    })
  } catch (error) {
    console.error('[generate/status] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
