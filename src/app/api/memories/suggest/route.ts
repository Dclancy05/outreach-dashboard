import { NextRequest, NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

const SYSTEM = `You extract durable memory candidates from a chat transcript.

Return STRICT JSON: { "candidates": [ { "type": "user"|"feedback"|"project"|"reference", "title": string, "description": string, "body": string, "emoji": string, "why": string, "how_to_apply": string, "tags": string[] } ] }

Rules:
- "user" = facts about the user (role, expertise, preferences)
- "feedback" = behavioral rules ("don't do X", "always do Y") — the most valuable type
- "project" = current goals, deadlines, decisions
- "reference" = pointers to where info lives (URLs, tickets, repos)
- Skip ephemeral details (current task progress, conversational fluff)
- Skip things that would be obvious from reading the codebase
- Each candidate should be re-readable next session and still useful
- Max 5 candidates. Quality > quantity.
- emoji: a single relevant emoji. tags: 1-3 short lowercase tags.
- For "feedback": fill "why" with the rationale and "how_to_apply" with when it kicks in.`

async function suggestWithAnthropic(transcript: string, apiKey: string) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: `Transcript:\n\n${transcript}\n\nReturn JSON only.` }],
    }),
  })
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`)
  const data = await r.json()
  const text = data.content?.[0]?.text || ""
  return JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim())
}

async function suggestWithOpenAI(transcript: string, apiKey: string) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Transcript:\n\n${transcript}\n\nReturn JSON only.` },
      ],
    }),
  })
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`)
  const data = await r.json()
  return JSON.parse(data.choices?.[0]?.message?.content || '{"candidates":[]}')
}

// Heuristic fallback: pull "user said X" sentences that look like rules
function heuristicSuggest(transcript: string) {
  const candidates: Array<{ type: string; title: string; description: string; body: string; emoji: string; why: string | null; how_to_apply: string | null; tags: string[] }> = []
  const lines = transcript.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    if (/^(don'?t|never|always|stop|please|prefer|avoid)\b/i.test(line)) {
      candidates.push({
        type: "feedback",
        title: line.slice(0, 60).replace(/[.!?]+$/, ""),
        description: line.slice(0, 120),
        body: line,
        emoji: "💬",
        why: null,
        how_to_apply: null,
        tags: ["heuristic"],
      })
    } else if (/^i (am|'m|work as|build|run)\b/i.test(line) && line.length < 200) {
      candidates.push({
        type: "user",
        title: line.slice(0, 60),
        description: line.slice(0, 120),
        body: line,
        emoji: "👤",
        why: null,
        how_to_apply: null,
        tags: ["heuristic"],
      })
    }
    if (candidates.length >= 5) break
  }
  return { candidates }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const transcript = String(body.transcript || "").slice(0, 30000)
  if (!transcript) return NextResponse.json({ error: "transcript required" }, { status: 400 })

  const ANTHROPIC_KEY = (await getSecret("ANTHROPIC_API_KEY")) || ""
  const OPENAI_KEY = (await getSecret("OPENAI_API_KEY")) || ""

  try {
    let result
    if (ANTHROPIC_KEY) result = await suggestWithAnthropic(transcript, ANTHROPIC_KEY)
    else if (OPENAI_KEY) result = await suggestWithOpenAI(transcript, OPENAI_KEY)
    else result = heuristicSuggest(transcript)
    return NextResponse.json({ ...result, source: ANTHROPIC_KEY ? "anthropic" : OPENAI_KEY ? "openai" : "heuristic" })
  } catch (e) {
    // graceful fallback
    const fallback = heuristicSuggest(transcript)
    return NextResponse.json({ ...fallback, source: "heuristic", error: e instanceof Error ? e.message : "AI failed" })
  }
}
