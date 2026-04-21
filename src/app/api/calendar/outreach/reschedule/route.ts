import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * PATCH /api/calendar/outreach/reschedule
 * Body: { event_id: string, new_date: string (ISO), event_type?: 'queued' | 'sent' | 'projected' }
 *
 * Reschedules a calendar event by updating the underlying row's scheduled time.
 * Only `send_queue` rows (event_type = 'queued') are reschedulable. Sent rows
 * cannot be un-sent; projected rows are derived from sequence assignments and
 * don't have a direct scheduled_for field.
 */
export async function PATCH(req: Request) {
  let body: { event_id?: string; new_date?: string; event_type?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { event_id, new_date, event_type } = body

  if (!event_id || !new_date) {
    return NextResponse.json(
      { error: 'event_id and new_date are required' },
      { status: 400 }
    )
  }

  // Validate date
  const parsed = new Date(new_date)
  if (isNaN(parsed.getTime())) {
    return NextResponse.json({ error: 'Invalid new_date' }, { status: 400 })
  }

  // Disallow scheduling into the past (compare at day granularity)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(parsed)
  target.setHours(0, 0, 0, 0)
  if (target.getTime() < today.getTime()) {
    return NextResponse.json(
      { error: 'Cannot reschedule to past' },
      { status: 400 }
    )
  }

  // Only queued sends can be rescheduled via send_queue.scheduled_for
  if (event_type && event_type !== 'queued') {
    return NextResponse.json(
      { error: `Events of type '${event_type}' cannot be rescheduled` },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('send_queue')
    .update({ scheduled_for: parsed.toISOString() })
    .eq('id', event_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Database update failed' },
      { status: 500 }
    )
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Event not found or not reschedulable' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    success: true,
    event_id,
    new_date: parsed.toISOString(),
    row: data,
  })
}
