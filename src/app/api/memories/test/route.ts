import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ""
const OPENAI_KEY = process.env.OPENAI_API_KEY || ""

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { persona_id, message } = body
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 })

  // Build the injection block
  const sp = new URLSearchParams()
  if (persona_id) sp.set("persona_id", persona_id)
  sp.set("max_tokens", "3000")
  sp.set("client", "test-sandbox")
  const protocol = req.nextUrl.protocol
  const host = req.nextUrl.host
  const r = await fetch(`${protocol}//${host}/api/memories/inject?${sp.toString()}`, { cache: "no-store" })
  const memoryBlock = await r.text()

  // Build the system prompt
  const { data: persona } = persona_id
    ? await supabase.from("memory_personas").select("*").eq("id", persona_id).single()
    : { data: null }

  const sys = [
    persona?.system_prompt || "You are a helpful assistant.",
    "",
    "## Memory pack",
    memoryBlock || "_(no memories)_",
  ].join("\n")

  // Call AI (Anthropic preferred, OpenAI fallback, mock if neither)
  try {
    if (ANTHROPIC_KEY) {
      const ar = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 800,
          system: sys,
          messages: [{ role: "user", content: message }],
        }),
      })
      const data = await ar.json()
      const reply = data.content?.[0]?.text || JSON.stringify(data)
      return NextResponse.json({ reply, model: "claude-haiku-4-5", memory_block: memoryBlock })
    }
    if (OPENAI_KEY) {
      const or = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: message },
          ],
        }),
      })
      const data = await or.json()
      const reply = data.choices?.[0]?.message?.content || JSON.stringify(data)
      return NextResponse.json({ reply, model: "gpt-4o-mini", memory_block: memoryBlock })
    }
    return NextResponse.json({
      reply: `**(No AI key configured — showing what would be injected)**\n\n${memoryBlock || "_(empty memory pack)_"}`,
      model: "mock",
      memory_block: memoryBlock,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI call failed", memory_block: memoryBlock }, { status: 500 })
  }
}
