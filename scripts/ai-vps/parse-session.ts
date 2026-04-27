#!/usr/bin/env bun
/**
 * parse-session.ts — turn a Claude Code session JSONL into a clean
 * markdown transcript with credential redaction.
 *
 * Usage:
 *   bun /root/services/parse-session.ts <session_id|jsonl_path> [output_path]
 *
 * Defaults:
 *   - If <session_id> is just a UUID, looks for /root/.claude/projects/-root/<id>.jsonl
 *   - Output: /root/memory-vault/Conversations/<YYYY-MM-DD>-<short_id>-transcript.md
 *
 * Redacts patterns that look like credentials so transcripts can live
 * safely in the vault + Supabase mirror without re-exposing tokens.
 */
import { promises as fs } from "node:fs"
import * as path from "node:path"

const CLAUDE_PROJECTS = "/root/.claude/projects/-root"
const CONV_DIR = "/root/memory-vault/Conversations"

// ─── Credential redaction ────────────────────────────────────────
// Patterns of things that look like secrets we should never persist.
const REDACT_PATTERNS: Array<[RegExp, string]> = [
  [/ghp_[A-Za-z0-9]{36}/g,                     "[REDACTED:github-pat]"],
  [/sk-ant-[A-Za-z0-9_\-]{20,}/g,              "[REDACTED:anthropic-key]"],
  [/sk-proj-[A-Za-z0-9_\-]{20,}/g,             "[REDACTED:openai-proj-key]"],
  [/sk-[A-Za-z0-9]{40,}/g,                     "[REDACTED:openai-key]"],
  [/sb_secret_[A-Za-z0-9_\-]+/g,               "[REDACTED:supabase-secret]"],
  [/sb_publishable_[A-Za-z0-9_\-]+/g,          "[REDACTED:supabase-publishable]"],
  [/eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}/g, "[REDACTED:jwt]"],
  // bcrypt hash, often 60 chars
  [/\$2[ayb]\$\d{2}\$[A-Za-z0-9./]{53}/g,      "[REDACTED:bcrypt]"],
  // 64-char hex tokens (e.g., the MEMORY_VAULT_TOKEN format) — only if standalone (preceded by space, =, ", or start)
  [/(?<=^|[\s="'`])[a-f0-9]{64}(?=$|[\s"'`,;])/g, "[REDACTED:hex64-token]"],
]

function redact(text: string): string {
  let out = text
  for (const [pattern, replacement] of REDACT_PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

// ─── Resolve input path ──────────────────────────────────────────
function resolveJsonlPath(arg: string): string {
  if (arg.endsWith(".jsonl") && arg.includes("/")) return arg
  // Treat as session id
  return path.join(CLAUDE_PROJECTS, `${arg}.jsonl`)
}

function shortId(sessionId: string): string {
  return sessionId.slice(0, 8)
}

// ─── Content rendering ───────────────────────────────────────────

interface ContentBlock {
  type: string
  text?: string
  name?: string
  input?: unknown
  content?: unknown
  tool_use_id?: string
  is_error?: boolean
}

function renderContent(content: string | ContentBlock[] | undefined): string {
  if (!content) return ""
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return JSON.stringify(content)

  const parts: string[] = []
  for (const block of content) {
    switch (block.type) {
      case "text":
        if (block.text) parts.push(block.text)
        break
      case "tool_use": {
        const inputStr = JSON.stringify(block.input ?? {}, null, 2)
        parts.push("```tool: " + (block.name ?? "?") + "\n" + truncate(inputStr, 800) + "\n```")
        break
      }
      case "tool_result": {
        let body = ""
        if (typeof block.content === "string") body = block.content
        else if (Array.isArray(block.content)) {
          body = block.content
            .map((c: ContentBlock) => (c.type === "text" ? c.text : JSON.stringify(c)))
            .join("\n")
        } else if (block.content) {
          body = JSON.stringify(block.content)
        }
        const prefix = block.is_error ? "tool result (ERROR)" : "tool result"
        parts.push("```" + prefix + "\n" + truncate(body, 1200) + "\n```")
        break
      }
      case "thinking":
        if (block.text) parts.push("> _(thinking)_ " + truncate(block.text, 400))
        break
      default:
        parts.push(`_(unhandled block: ${block.type})_`)
    }
  }
  return parts.join("\n\n")
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n) + ` … _(${s.length - n} more chars)_`
}

// ─── Main ────────────────────────────────────────────────────────

interface JsonlEvent {
  type: string
  timestamp?: string
  sessionId?: string
  message?: {
    role?: string
    content?: string | ContentBlock[]
  }
}

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error("usage: parse-session.ts <session_id|jsonl_path> [output_path]")
    process.exit(1)
  }
  const explicitOut = process.argv[3]

  const jsonlPath = resolveJsonlPath(arg)
  const raw = await fs.readFile(jsonlPath, "utf8")
  const lines = raw.split("\n").filter((l) => l.trim().length > 0)

  let sessionId = ""
  let firstUserMsg = ""
  let firstTs = ""
  let lastTs = ""
  const messages: { role: string; ts: string; body: string }[] = []

  for (const line of lines) {
    let ev: JsonlEvent
    try { ev = JSON.parse(line) } catch { continue }
    if (!ev) continue

    if (ev.sessionId && !sessionId) sessionId = ev.sessionId

    if (ev.type === "user" || ev.type === "assistant") {
      const ts = ev.timestamp ?? ""
      if (!firstTs) firstTs = ts
      if (ts) lastTs = ts
      const body = renderContent(ev.message?.content)
      if (!body.trim()) continue
      const role = ev.message?.role ?? ev.type
      messages.push({ role, ts, body })

      if (ev.type === "user" && !firstUserMsg) {
        firstUserMsg = truncate(body.split("\n")[0] ?? "", 100)
      }
    }
  }

  if (!sessionId) sessionId = path.basename(jsonlPath, ".jsonl")
  const sid = shortId(sessionId)

  // Date prefix in the filename uses the user's timezone (America/New_York
  // per CLAUDE.md), so a session that started at 9pm ET on April 26 doesn't
  // get filed under April 27 just because UTC has rolled over.
  const tsForFile = firstTs ? new Date(firstTs) : new Date()
  const dateForFile = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(tsForFile)
  const outPath = explicitOut || path.join(CONV_DIR, `${dateForFile}-${sid}-transcript.md`)

  await fs.mkdir(path.dirname(outPath), { recursive: true })

  const durationMs = (firstTs && lastTs) ? new Date(lastTs).getTime() - new Date(firstTs).getTime() : 0
  const durationMin = Math.round(durationMs / 60000)

  const header = [
    `# Session ${sid} — ${dateForFile}`,
    "",
    `- **Session ID:** \`${sessionId}\``,
    `- **Started:** ${firstTs || "?"}`,
    `- **Last activity:** ${lastTs || "?"}`,
    `- **Duration:** ~${durationMin} min`,
    `- **Messages:** ${messages.length}`,
    `- **First user prompt:** ${firstUserMsg || "_(none)_"}`,
    "",
    "## Summary",
    "",
    `_Open this file at the start of the next session and write a 1-2 sentence summary here so future sessions can scan past activity quickly._`,
    "",
    "---",
    "",
    "## Transcript",
    "",
  ].join("\n")

  const body = messages.map((m) => {
    const tsShort = m.ts ? m.ts.slice(11, 19) : ""
    const roleLabel = m.role === "assistant" ? "🤖 Assistant" : "👤 User"
    return `### ${roleLabel} ${tsShort ? `_(${tsShort})_` : ""}\n\n${m.body}`
  }).join("\n\n---\n\n")

  const finalDoc = redact(header + body + "\n")
  await fs.writeFile(outPath, finalDoc, "utf8")

  console.error(`[parse-session] wrote ${outPath} (${finalDoc.length} bytes, ${messages.length} messages)`)
}

main().catch((err) => {
  console.error("[parse-session] failed:", err)
  process.exit(1)
})
