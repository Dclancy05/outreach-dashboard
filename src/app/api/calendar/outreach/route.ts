import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

  const startDate = new Date(year, month - 1, 1).toISOString()
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString()

  let sent: any[] = []
  let queued: any[] = []
  let assignments: any[] = []

  try {
    const { data } = await supabase
      .from('manual_sends')
      .select('*, leads!inner(name, business_type, instagram_url)')
      .gte('sent_at', startDate)
      .lte('sent_at', endDate)
      .order('sent_at')
    sent = data || []
  } catch { sent = [] }

  try {
    const { data } = await supabase
      .from('send_queue')
      .select('*')
      .gte('scheduled_for', startDate)
      .lte('scheduled_for', endDate)
      .order('scheduled_for')
    queued = data || []
  } catch { queued = [] }

  try {
    const { data } = await supabase
      .from('sequence_assignments')
      .select('*, sequences!inner(*), leads!inner(name, business_type)')
      .eq('status', 'active')
    assignments = data || []
  } catch { assignments = [] }

  const projected = (assignments).flatMap((a: any) => {
    const steps = a.sequences?.steps || []
    const startedAt = new Date(a.started_at || a.created_at)
    return (Array.isArray(steps) ? steps : []).map((step: any, i: number) => {
      const sendDate = new Date(startedAt)
      sendDate.setDate(sendDate.getDate() + (step.day || i * 3))
      return {
        id: `proj-${a.id}-${i}`,
        date: sendDate.toISOString(),
        lead_name: a.leads?.name,
        business_type: a.leads?.business_type,
        platform: step.platform || 'instagram',
        action: step.action || 'dm',
        sequence_name: a.sequences?.sequence_name,
        step_number: i + 1,
        status: sendDate < new Date() ? 'overdue' : 'scheduled',
        message_preview: step.message?.substring(0, 80) || '',
        type: 'projected'
      }
    }).filter((p: any) => {
      const d = new Date(p.date)
      return d.getMonth() + 1 === month && d.getFullYear() === year
    })
  })

  const events = [
    ...sent.map((s: any) => ({
      id: s.id,
      date: s.sent_at,
      lead_name: s.leads?.name || s.lead_name || 'Unknown',
      business_type: s.leads?.business_type || '',
      platform: s.platform || 'instagram',
      action: 'dm',
      status: 'sent',
      message_preview: s.message_text?.substring(0, 80) || '',
      template_id: s.template_id,
      type: 'sent'
    })),
    ...queued.map((q: any) => ({
      id: q.id,
      date: q.scheduled_for || q.created_at,
      lead_name: q.lead_name || 'Unknown',
      platform: q.platform || 'instagram',
      action: q.action_type || 'dm',
      status: q.status,
      message_preview: q.message_text?.substring(0, 80) || '',
      type: 'queued'
    })),
    ...projected
  ]

  return NextResponse.json({ events, month, year })
}
