/**
 * API Route: POST /api/content/generate
 * Triggers AI video generation for a content piece
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { VideoOrchestrator, type VideoJob } from '@/lib/ai-video/orchestrator'
import { scriptToScenes } from '@/lib/ai-video/script-to-scenes'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { contentPieceId, script, personaId, mood, scenes, voiceId } = body

    // Validate input
    if (!contentPieceId && !script) {
      return NextResponse.json(
        { success: false, error: 'Provide either contentPieceId or script' },
        { status: 400 }
      )
    }

    let job: VideoJob

    if (contentPieceId && !script) {
      // Load from existing content piece
      const { data: piece, error } = await supabase
        .from('content_pieces')
        .select('*')
        .eq('id', contentPieceId)
        .single()

      if (error || !piece) {
        return NextResponse.json(
          { success: false, error: 'Content piece not found' },
          { status: 404 }
        )
      }

      const pieceScript = piece.script || piece.body || piece.content || ''
      if (!pieceScript) {
        return NextResponse.json(
          { success: false, error: 'Content piece has no script text' },
          { status: 400 }
        )
      }

      job = {
        contentPieceId,
        script: pieceScript,
        personaId: piece.persona_id || personaId || '',
        voiceId: piece.voice_id || voiceId,
        mood: piece.mood || mood || 'upbeat',
        scenes: piece.scenes || scriptToScenes(pieceScript),
      }
    } else {
      // Inline job
      if (!script) {
        return NextResponse.json(
          { success: false, error: 'Script text is required' },
          { status: 400 }
        )
      }

      const pieceId = contentPieceId || `gen_${Date.now()}`

      // Create content_pieces record if it doesn't exist
      if (!contentPieceId) {
        await supabase.from('content_pieces').upsert({
          id: pieceId,
          script,
          persona_id: personaId || '',
          mood: mood || 'upbeat',
          generation_status: 'generating',
          created_at: new Date().toISOString(),
        })
      }

      job = {
        contentPieceId: pieceId,
        script,
        personaId: personaId || '',
        voiceId,
        mood: mood || 'upbeat',
        scenes: scenes || scriptToScenes(script),
      }
    }

    // Mark as generating
    await supabase
      .from('content_pieces')
      .update({ generation_status: 'generating', updated_at: new Date().toISOString() })
      .eq('id', job.contentPieceId)

    // Start generation (fire-and-forget for long-running process)
    const orchestrator = new VideoOrchestrator()

    // Run in background — don't await
    orchestrator.produceVideo(job).catch((err) => {
      console.error('[generate] Pipeline error:', err)
      supabase
        .from('content_pieces')
        .update({
          generation_status: 'error',
          error_message: err instanceof Error ? err.message : String(err),
        })
        .eq('id', job.contentPieceId)
    })

    return NextResponse.json({
      success: true,
      contentPieceId: job.contentPieceId,
      status: 'generating',
      sceneCount: job.scenes.length,
      message: 'Video generation started. Poll /api/content/generate/status for progress.',
    })
  } catch (error) {
    console.error('[generate] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
