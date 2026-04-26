import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ALLOWED_TYPES = ["user", "feedback", "project", "reference"] as const
type MemoryType = (typeof ALLOWED_TYPES)[number]

interface MemoryInput {
  business_id?: string | null
  persona_id?: string | null
  type?: string
  title?: string
  description?: string | null
  body?: string
  emoji?: string
  tags?: string[]
  pinned?: boolean
  injection_priority?: number
  why?: string | null
  how_to_apply?: string | null
  trigger_keywords?: string[]
}

interface PersonaInput {
  id?: string
  business_id?: string | null
  name?: string
  emoji?: string
  description?: string | null
  system_prompt?: string
  tone_terse?: number
  tone_formal?: number
  emoji_mode?: string
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const memories: MemoryInput[] = Array.isArray(body.memories) ? body.memories : []
  const personas: PersonaInput[] = Array.isArray(body.personas) ? body.personas : []

  let imported = 0
  const personaIdMap: Record<string, string> = {}

  if (personas.length > 0) {
    const rows = personas.map((p) => ({
      business_id: p.business_id || null,
      name: (p.name || "Imported persona").slice(0, 100),
      emoji: p.emoji || "🤖",
      description: p.description || null,
      system_prompt: p.system_prompt || "",
      tone_terse: typeof p.tone_terse === "number" ? p.tone_terse : 50,
      tone_formal: typeof p.tone_formal === "number" ? p.tone_formal : 50,
      emoji_mode: ["off", "auto", "on"].includes(String(p.emoji_mode)) ? p.emoji_mode : "auto",
    }))
    const { data: created, error } = await supabase.from("memory_personas").insert(rows).select("id")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    created?.forEach((c, i) => {
      const orig = personas[i].id
      if (orig) personaIdMap[orig] = c.id
    })
    imported += created?.length || 0
  }

  if (memories.length > 0) {
    const rows = memories.map((m) => ({
      business_id: m.business_id || null,
      persona_id: m.persona_id ? (personaIdMap[m.persona_id] || m.persona_id) : null,
      type: ALLOWED_TYPES.includes(m.type as MemoryType) ? m.type : "user",
      title: (m.title || "Imported").slice(0, 200),
      description: m.description || null,
      body: m.body || "",
      emoji: m.emoji || "📝",
      tags: Array.isArray(m.tags) ? m.tags : [],
      pinned: !!m.pinned,
      injection_priority: typeof m.injection_priority === "number" ? m.injection_priority : 50,
      why: m.why || null,
      how_to_apply: m.how_to_apply || null,
      trigger_keywords: Array.isArray(m.trigger_keywords) ? m.trigger_keywords : [],
      source: "import",
    }))
    const { data: created, error } = await supabase.from("memories").insert(rows).select("id")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    imported += created?.length || 0
  }

  return NextResponse.json({ imported })
}
