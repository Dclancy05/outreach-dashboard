"use client"
/**
 * Conversations tab — lists files in /Conversations/ folder of the vault,
 * grouped by date. Click a session to view it inline (markdown preview).
 *
 * UI niceties:
 * - File labels are human-readable: "9:07 PM" + "442 KB" instead of raw filenames
 * - Date groups in browser local TZ ("Today" / "Yesterday")
 * - Manual Refresh button + live SSE updates
 * - Pretty transcript rendering: user/assistant bubbles, dimmed tool blocks
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import ReactMarkdown from "react-markdown"
import { Loader2, MessageSquare, Calendar, RefreshCw, User, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface TreeNode {
  name: string
  path: string
  kind: "file" | "folder"
  size?: number
  updated_at?: string
  children?: TreeNode[]
}

interface SessionFile {
  name: string
  path: string
  size: number
  updated_at: string
  date: string         // YYYY-MM-DD in BROWSER local TZ
  mtime: Date
}

// ─── Date helpers (browser-local TZ) ─────────────────────────────

function localDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function dayLabel(iso: string): string {
  if (iso === "Unknown") return "Unknown"
  const today = new Date()
  const yest = new Date(); yest.setDate(today.getDate() - 1)
  if (iso === localDateString(today)) return "Today"
  if (iso === localDateString(yest)) return "Yesterday"
  const [y, m, day] = iso.split("-").map(Number)
  const d = new Date(y, (m ?? 1) - 1, day ?? 1, 12, 0, 0)
  return d.toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    year: today.getFullYear() === d.getFullYear() ? undefined : "numeric",
  })
}

function timeLabel(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Rough message count estimate from file size — avoids fetching every file.
function estimateMessages(bytes: number): number {
  return Math.max(1, Math.round(bytes / 520))
}

// ─── Component ───────────────────────────────────────────────────

export function ConversationsView() {
  const [sessions, setSessions] = useState<SessionFile[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [content, setContent] = useState<string>("")
  const [contentLoading, setContentLoading] = useState(false)

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch("/api/memory-vault/tree", { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErrorStatus(res.status)
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { tree: TreeNode[] }
      const conv = data.tree.find((n) => n.path === "/Conversations" && n.kind === "folder")
      const files: SessionFile[] = (conv?.children || [])
        .filter((c) => c.kind === "file")
        .map((c) => {
          const mtime = c.updated_at ? new Date(c.updated_at) : new Date(0)
          return {
            name: c.name,
            path: c.path,
            size: c.size ?? 0,
            updated_at: c.updated_at ?? "",
            date: localDateString(mtime),
            mtime,
          }
        })
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
      setSessions(files)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchList() }, [fetchList])

  // Live updates via SSE — tab now refreshes automatically when the AI
  // VPS writes a new transcript or appends to one
  useEffect(() => {
    let es: EventSource | null = null
    let backoff = 1000
    let cancelled = false
    function connect() {
      if (cancelled) return
      es = new EventSource("/api/memory-vault/events")
      es.onmessage = () => fetchList()
      es.onerror = () => {
        es?.close()
        if (!cancelled) {
          setTimeout(connect, backoff)
          backoff = Math.min(backoff * 2, 30_000)
        }
      }
      es.onopen = () => { backoff = 1000 }
    }
    connect()
    return () => { cancelled = true; es?.close() }
  }, [fetchList])

  // Fetch full content of selected file
  useEffect(() => {
    if (!selectedPath) return
    let cancelled = false
    setContentLoading(true)
    fetch(`/api/memory-vault/file?path=${encodeURIComponent(selectedPath)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setContent(data.content || "") })
      .finally(() => { if (!cancelled) setContentLoading(false) })
    return () => { cancelled = true }
  }, [selectedPath])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-zinc-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading conversations…
      </div>
    )
  }

  if (errorStatus === 503) {
    return (
      <div className="p-6 text-sm text-zinc-400">
        Memory Vault isn&apos;t connected — see the Memory Tree tab for setup steps.
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-sm">
        <div className="text-red-400 font-medium mb-1">Couldn&apos;t load conversations</div>
        <div className="text-xs text-zinc-400 break-all">{error}</div>
      </div>
    )
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 px-6 text-center">
        <MessageSquare className="w-8 h-8 mb-3 text-zinc-600" />
        <div className="text-sm font-medium text-zinc-300">No conversations logged yet</div>
        <div className="text-xs mt-2 max-w-md">
          The AI auto-saves a markdown transcript here at the end of every Claude session.
          You can also drop your own notes in the <code className="text-zinc-400 bg-zinc-800/50 px-1 rounded">/Conversations</code> folder via the file editor.
        </div>
      </div>
    )
  }

  // Group by local-TZ date
  const groups: Record<string, SessionFile[]> = {}
  for (const s of sessions) {
    if (!groups[s.date]) groups[s.date] = []
    groups[s.date].push(s)
  }
  const dateKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a))

  return (
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] h-full">
      {/* List */}
      <div className="overflow-y-auto border-r border-zinc-800/60 text-sm">
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 sticky top-0 z-20 bg-zinc-900/95 backdrop-blur">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""}
          </span>
          <Button
            variant="ghost" size="sm"
            className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-200"
            onClick={() => fetchList()}
            title="Refresh list"
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
        {dateKeys.map((date) => (
          <div key={date}>
            <div className="sticky top-[33px] z-10 bg-zinc-900/95 backdrop-blur px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800/60 flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> {dayLabel(date)}
            </div>
            {groups[date].map((s) => {
              const time = timeLabel(s.mtime)
              const size = fileSizeLabel(s.size)
              const msgs = estimateMessages(s.size)
              return (
                <button
                  key={s.path}
                  onClick={() => setSelectedPath(s.path)}
                  className={cn(
                    "block w-full text-left px-3 py-2 hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30",
                    selectedPath === s.path && "bg-amber-500/10"
                  )}
                >
                  <div className={cn("font-medium tabular-nums", selectedPath === s.path ? "text-amber-100" : "text-zinc-200")}>
                    {time}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    {size} · ~{msgs.toLocaleString()} message{msgs !== 1 ? "s" : ""}
                  </div>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {/* Reader */}
      <div className="overflow-y-auto">
        {!selectedPath ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm text-center">
            <MessageSquare className="w-8 h-8 mb-3 text-zinc-700" />
            <div>Pick a session from the list to read it.</div>
          </div>
        ) : contentLoading ? (
          <div className="p-6 flex items-center text-sm text-zinc-500"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…</div>
        ) : (
          <TranscriptReader content={content} />
        )}
      </div>
    </div>
  )
}

// ─── TranscriptReader — pretty rendering of session transcripts ──

/**
 * Splits a transcript into a metadata header + alternating role messages
 * and renders each in a styled bubble. Falls back to plain markdown for
 * non-transcript files.
 */
function TranscriptReader({ content }: { content: string }) {
  const parsed = useMemo(() => parseTranscript(content), [content])

  if (!parsed.isTranscript) {
    // Not a transcript — just render plain markdown
    return (
      <article className="prose prose-invert max-w-3xl mx-auto px-6 py-6 text-[13px] leading-relaxed">
        <ReactMarkdown>{content || "_(empty)_"}</ReactMarkdown>
      </article>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-b border-zinc-800/60 mb-4">
        <h2 className="text-base font-semibold text-zinc-100 leading-tight">{parsed.title}</h2>
        <div className="text-[11px] text-zinc-500 mt-0.5">{parsed.subtitle}</div>
      </div>

      {parsed.summary && (
        <div className="mb-5 p-3 rounded-md bg-amber-500/5 border border-amber-500/20 text-[13px] leading-relaxed text-amber-100/90">
          <div className="text-[10px] uppercase tracking-wider text-amber-400/80 mb-1">Summary</div>
          <ReactMarkdownNoMargin source={parsed.summary} />
        </div>
      )}

      <div className="space-y-3">
        {parsed.messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} time={m.time} body={m.body} />
        ))}
      </div>
    </div>
  )
}

function MessageBubble({ role, time, body }: { role: "user" | "assistant"; time: string; body: string }) {
  const isUser = role === "user"
  return (
    <div className={cn(
      "rounded-lg border text-[13px] leading-relaxed",
      isUser
        ? "bg-blue-500/5 border-blue-500/20"
        : "bg-zinc-800/30 border-zinc-700/40"
    )}>
      <div className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-[11px] border-b",
        isUser ? "text-blue-300 border-blue-500/15" : "text-zinc-400 border-zinc-700/40"
      )}>
        {isUser ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
        <span className="font-medium">{isUser ? "You" : "Claude"}</span>
        {time && <span className="text-zinc-500 tabular-nums ml-auto">{time}</span>}
      </div>
      <div className="px-3 py-2.5">
        <ReactMarkdownNoMargin source={body} />
      </div>
    </div>
  )
}

function ReactMarkdownNoMargin({ source }: { source: string }) {
  return (
    <article className={cn(
      "prose prose-invert prose-sm max-w-none",
      "prose-p:my-1.5 prose-pre:my-2 prose-pre:bg-zinc-950/60 prose-pre:text-[11px] prose-pre:leading-snug prose-pre:p-2 prose-pre:rounded",
      "prose-code:text-[12px] prose-code:bg-zinc-800/60 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none",
      "prose-headings:my-2 prose-headings:text-zinc-200",
      "prose-li:my-0.5 prose-ul:my-1.5 prose-ol:my-1.5",
      "prose-blockquote:border-l-zinc-700 prose-blockquote:text-zinc-400",
      "prose-hr:my-3 prose-hr:border-zinc-800/40"
    )}>
      <ReactMarkdown>{source || "_(empty)_"}</ReactMarkdown>
    </article>
  )
}

// ─── Transcript parser ───────────────────────────────────────────

interface ParsedTranscript {
  isTranscript: boolean
  title: string
  subtitle: string
  summary: string | null
  messages: Array<{ role: "user" | "assistant"; time: string; body: string }>
}

function parseTranscript(text: string): ParsedTranscript {
  // Quick check: does it look like one of our generated transcripts?
  const looksLikeTranscript = /^# Session\s+/m.test(text) && /^### (?:👤 User|🤖 Assistant)/m.test(text)
  if (!looksLikeTranscript) {
    return { isTranscript: false, title: "", subtitle: "", summary: null, messages: [] }
  }

  // Title: first H1
  const titleMatch = text.match(/^# (.+)$/m)
  const title = titleMatch ? titleMatch[1].trim() : "Session"

  // Subtitle: collect the metadata bullets (- **X:** Y) into a single line
  const meta: string[] = []
  for (const line of text.split("\n").slice(0, 12)) {
    const m = line.match(/^- \*\*([^:]+):\*\*\s+(.+)$/)
    if (m) meta.push(`${m[1]}: ${m[2]}`)
  }
  const subtitle = meta.slice(0, 4).join(" · ")

  // Summary: ## Summary block
  const sumMatch = text.match(/##\s+Summary\s*\n+([\s\S]*?)(?=\n---|\n##\s+Transcript|\n###\s+|$)/)
  const summaryRaw = sumMatch ? sumMatch[1].trim() : ""
  const summary = summaryRaw && !summaryRaw.startsWith("_Open this file") ? summaryRaw : null

  // Messages: split on `### 👤 User _(time)_` or `### 🤖 Assistant _(time)_`
  const messages: ParsedTranscript["messages"] = []
  // Find the "## Transcript" anchor; everything after it is messages
  const anchor = text.indexOf("## Transcript")
  const body = anchor >= 0 ? text.slice(anchor + "## Transcript".length) : text
  const re = /###\s+(👤 User|🤖 Assistant)\s+(?:_\(([^)]+)\)_)?\s*\n+([\s\S]*?)(?=\n---\n+###\s+(?:👤 User|🤖 Assistant)|\n*$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const role: "user" | "assistant" = m[1].includes("User") ? "user" : "assistant"
    const time = (m[2] || "").trim()
    let blockBody = (m[3] || "").trim()
    // strip any trailing --- separator
    blockBody = blockBody.replace(/\n+---\s*$/, "").trim()
    if (blockBody) messages.push({ role, time, body: blockBody })
  }

  return { isTranscript: true, title, subtitle, summary, messages }
}
