import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface FlaggedIssue {
  kind: "duplicate" | "stale" | "contradiction" | "vague" | "no_use"
  memory_id: string
  message: string
  related_id?: string
}

function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter((t) => t.length > 2))
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

export async function POST(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("business_id")
  let q = supabase.from("memories").select("*").eq("archived", false)
  if (businessId && businessId !== "all") q = q.or(`business_id.eq.${businessId},business_id.is.null`)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const memories = data || []
  const issues: FlaggedIssue[] = []

  // 1. Near-duplicates (jaccard > 0.6 on title+body)
  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const a = memories[i], b = memories[j]
      if (a.type !== b.type) continue
      const sim = jaccardSimilarity(`${a.title} ${a.body}`, `${b.title} ${b.body}`)
      if (sim > 0.6) {
        issues.push({
          kind: "duplicate",
          memory_id: b.id,
          related_id: a.id,
          message: `Near-duplicate of "${a.title}" (${Math.round(sim * 100)}% overlap)`,
        })
      }
    }
  }

  // 2. Stale: no use in 60d, low priority
  const staleCut = Date.now() - 60 * 86400 * 1000
  for (const m of memories) {
    if (m.last_used_at && new Date(m.last_used_at).getTime() < staleCut && !m.pinned) {
      issues.push({ kind: "stale", memory_id: m.id, message: `Not injected in 60+ days — consider archiving` })
    }
    if (m.use_count === 0 && Date.parse(m.created_at) < Date.now() - 30 * 86400 * 1000 && !m.pinned) {
      issues.push({ kind: "no_use", memory_id: m.id, message: `Created 30+ days ago, never injected` })
    }
    if (m.body && m.body.length < 30) {
      issues.push({ kind: "vague", memory_id: m.id, message: `Very short body (<30 chars) — may be too vague` })
    }
  }

  // 3. Mark scan timestamp
  await supabase.from("memory_settings").update({ health_scan_at: new Date().toISOString() }).eq("business_id", "__global__")

  return NextResponse.json({
    issues_found: issues.length,
    issues,
    scanned: memories.length,
  })
}
