/**
 * POST /api/content/trends/scan
 * Triggers a trend scan across TikTok and Instagram.
 * Saves results to Supabase content_trends and content_hooks tables.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scanTrends, type TrendItem } from '@/lib/scrapers/trend-scanner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST() {
  try {
    const result = await scanTrends()
    const allItems = [...result.tiktok, ...result.instagram]

    let trendsSaved = 0
    let hooksSaved = 0
    const errors: string[] = [...result.errors]

    // Save to content_trends table
    for (const item of allItems) {
      try {
        const { error } = await supabase.from('content_trends').insert({
          platform: item.platform,
          format_type: item.video_format || 'reel',
          hook_type: item.hook_type || 'unknown',
          description: item.caption?.slice(0, 2000) || '',
          source_url: item.url || '',
          views: item.view_count || 0,
          engagement_rate: item.view_count > 0
            ? ((item.like_count + item.comment_count + item.share_count) / item.view_count * 100)
            : 0,
          virality_score: item.virality_score || 50,
          trending_sound: item.sound_name || '',
          status: 'new',
          metadata: {
            hashtags: item.hashtags,
            like_count: item.like_count,
            comment_count: item.comment_count,
            share_count: item.share_count,
            hook_text: item.hook_text,
            hook_template: item.hook_template,
            scraped_at: item.scraped_at,
            original_id: item.id,
          },
        })
        if (!error) trendsSaved++
        else if (!error.message.includes('duplicate')) errors.push(`Trend save: ${error.message}`)
      } catch (e) {
        errors.push(`Trend insert error: ${e instanceof Error ? e.message : 'unknown'}`)
      }
    }

    // Save hooks to content_hooks table
    const hookItems = allItems.filter((item: TrendItem) => item.hook_text && item.hook_type !== 'unknown')
    for (const item of hookItems) {
      try {
        const { error } = await supabase.from('content_hooks').insert({
          text: item.hook_text?.slice(0, 500) || '',
          category: item.hook_type || 'unknown',
          source_url: item.url || '',
          template: item.hook_template?.slice(0, 500) || '',
          performance_rating: Math.min(10, Math.round(item.virality_score / 10)),
          platform: item.platform,
          metadata: {
            view_count: item.view_count,
            like_count: item.like_count,
            sound_name: item.sound_name,
            original_id: item.id,
          },
        })
        if (!error) hooksSaved++
        else if (!error.message.includes('duplicate')) errors.push(`Hook save: ${error.message}`)
      } catch (e) {
        errors.push(`Hook insert error: ${e instanceof Error ? e.message : 'unknown'}`)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        trends_found: result.total,
        trends_saved: trendsSaved,
        hooks_saved: hooksSaved,
        by_platform: {
          tiktok: result.tiktok.length,
          instagram: result.instagram.length,
        },
        errors: errors.slice(0, 10),
        scanned_at: result.scanned_at,
      },
    })
  } catch (err) {
    console.error('[TrendScan] Fatal error:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
