import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Quick GPT-style token estimate: ~4 chars per token. Conservative.
function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

const TYPE_ORDER: Record<string, number> = { user: 1, feedback: 2, project: 3, reference: 4 }
const TYPE_TITLE: Record<string, string> = {
  user: "👤 User",
  feedback: "💬 Feedback (rules — apply these)",
  project: "📋 Project context",
  reference: "🔗 References",
}

function formatMemory(m: {
  emoji: string | null
  title: string
  description: string | null
  body: string | null
  why: string | null
  how_to_apply: string | null
}): string {
  const parts: string[] = []
  parts.push(`### ${m.emoji || "📝"} ${m.title}`)
  if (m.description) parts.push(m.description)
  if (m.body) parts.push(m.body)
  if (m.why) parts.push(`**Why:** ${m.why}`)
  if (m.how_to_apply) parts.push(`**How to apply:** ${m.how_to_apply}`)
  return parts.join("\n\n")
}

async function resolvePersonaChain(personaId: string | null): Promise<string[]> {
  if (!personaId) return []
  const chain: string[] = []
  let current: string | null = personaId
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    const res: { data: { parent_persona_id: string | null } | null } = await supabase.from("memory_personas").select("parent_persona_id").eq("id", current).single()
    current = res.data?.parent_persona_id ?? null
  }
  return chain
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const personaId = sp.get("persona_id")
  const businessId = sp.get("business_id")
  const maxTokens = Math.min(parseInt(sp.get("max_tokens") || "2000", 10), 16000)
  const query = sp.get("q")?.trim()
  const client = sp.get("client") || "unknown"
  const conversationId = sp.get("conversation_id") || null
  const format = (sp.get("format") || "markdown").toLowerCase()

  const personaChain = await resolvePersonaChain(personaId)

  // Fetch persona prompt(s) — base first (deepest ancestor), child last so child wins
  let personaSystemPrompt = ""
  let personaName = ""
  if (personaChain.length > 0) {
    const { data: pers } = await supabase
      .from("memory_personas")
      .select("*")
      .in("id", personaChain)
    const ordered = personaChain
      .slice()
      .reverse()
      .map((id) => pers?.find((p) => p.id === id))
      .filter(Boolean) as Array<{ name: string; system_prompt: string | null }>
    personaSystemPrompt = ordered.map((p) => p.system_prompt || "").filter(Boolean).join("\n\n")
    personaName = (pers?.find((p) => p.id === personaId) as { name?: string } | undefined)?.name || ""
    // bump last_used_at
    await supabase
      .from("memory_personas")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", personaChain)
  }

  // Pull candidate memories: pinned first, then by priority. Filtered by persona/business.
  let q = supabase
    .from("memories")
    .select("*")
    .eq("archived", false)
    .order("pinned", { ascending: false })
    .order("injection_priority", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(500)

  if (businessId) {
    q = q.or(`business_id.eq.${businessId},business_id.is.null`)
  }
  if (personaChain.length > 0) {
    const orParts = personaChain.map((id) => `persona_id.eq.${id}`).concat(["persona_id.is.null"])
    q = q.or(orParts.join(","))
  } else {
    q = q.is("persona_id", null)
  }
  if (query) q = q.textSearch("search_tsv", query, { type: "websearch", config: "english" })

  const { data: memories, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const all = (memories || []) as Array<{
    id: string
    type: string
    title: string
    description: string | null
    body: string | null
    emoji: string | null
    pinned: boolean
    injection_priority: number
    why: string | null
    how_to_apply: string | null
    trigger_keywords: string[] | null
    tags: string[] | null
  }>

  // Trigger-keyword filter: if a memory has trigger_keywords, only inject if query/keywords match
  const queryLower = (query || "").toLowerCase()
  const filtered = all.filter((m) => {
    if (!m.trigger_keywords || m.trigger_keywords.length === 0) return true
    if (!queryLower) return m.pinned // without query, only pinned trigger-keyword memories pass
    return m.trigger_keywords.some((kw) => queryLower.includes(kw.toLowerCase()))
  })

  // Group by type, preserving overall priority order within types
  const byType: Record<string, typeof filtered> = {}
  for (const m of filtered) {
    byType[m.type] = byType[m.type] || []
    byType[m.type].push(m)
  }
  const types = Object.keys(byType).sort((a, b) => (TYPE_ORDER[a] || 99) - (TYPE_ORDER[b] || 99))

  // Render to markdown, respecting token budget
  const sections: string[] = []
  if (personaName) sections.push(`# Persona: ${personaName}`)
  if (personaSystemPrompt) sections.push(personaSystemPrompt)

  const injectedIds: string[] = []
  let tokensUsed = estimateTokens(sections.join("\n\n"))
  for (const t of types) {
    const header = `\n\n## ${TYPE_TITLE[t] || t}`
    const headerTokens = estimateTokens(header)
    if (tokensUsed + headerTokens > maxTokens) break
    sections.push(header)
    tokensUsed += headerTokens
    for (const m of byType[t]) {
      const block = `\n\n${formatMemory(m)}`
      const blockTokens = estimateTokens(block)
      if (tokensUsed + blockTokens > maxTokens) {
        sections.push(`\n\n_…${byType[t].length} more ${t} memories truncated by token budget._`)
        break
      }
      sections.push(block)
      tokensUsed += blockTokens
      injectedIds.push(m.id)
    }
  }

  // log + bump use_count (fire and forget)
  if (injectedIds.length > 0) {
    const rows = injectedIds.map((id) => ({
      memory_id: id,
      persona_id: personaId || null,
      business_id: businessId || null,
      client,
      conversation_id: conversationId,
      token_estimate: tokensUsed,
      query: query || null,
    }))
    supabase.from("memory_injections").insert(rows).then(() => {})
    supabase
      .from("memories")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", injectedIds)
      .then(() => {})
  }

  const markdown = sections.join("")

  if (format === "json") {
    return NextResponse.json({
      persona_id: personaId,
      persona_name: personaName,
      tokens_used: tokensUsed,
      max_tokens: maxTokens,
      memory_ids: injectedIds,
      markdown,
    })
  }
  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Memory-Tokens": String(tokensUsed),
      "X-Memory-Count": String(injectedIds.length),
    },
  })
}
