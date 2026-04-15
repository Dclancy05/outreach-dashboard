/**
 * POST /api/content/batch
 * Triggers a batch content generation job.
 * Returns batch ID immediately — generation runs async.
 * 
 * GET /api/content/batch
 * Lists all batch jobs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { BatchGenerator, type BatchConfig } from '@/lib/content/batch-generator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min max for serverless

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const limit = parseInt(searchParams.get('limit') || '20')

    const { data, error } = await supabase
      .from('content_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<BatchConfig>

    // Validate
    if (!body.posts_per_persona || body.posts_per_persona < 1) {
      return NextResponse.json({ error: 'posts_per_persona must be >= 1' }, { status: 400 })
    }
    if (body.posts_per_persona > 100) {
      return NextResponse.json({ error: 'Max 100 posts per persona per batch' }, { status: 400 })
    }

    const config: BatchConfig = {
      persona_ids: body.persona_ids || [],
      posts_per_persona: body.posts_per_persona,
      date_start: body.date_start || new Date().toISOString().split('T')[0],
      date_end: body.date_end || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      video_ratio: body.video_ratio ?? 75,
      platforms: body.platforms || ['ig'],
    }

    const generator = new BatchGenerator()

    // Run async — fire and forget
    const batchPromise = generator.generate(config)

    // Wait briefly to get the batch ID (it's created immediately)
    const batchId = await batchPromise

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      config,
      message: 'Batch generation complete. Check /api/content/batch/status for results.',
    })
  } catch (error: any) {
    console.error('[BatchGenerate] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
