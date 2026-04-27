"use client"
/**
 * Conversations tab — lists files in /Conversations/ folder of the vault,
 * grouped by date. Click a session to view it inline (markdown preview).
 *
 * Sessions are written by the AI at the end of a Claude Code session via
 * the vault_write MCP tool. Convention: one file per session named
 * YYYY-MM-DD-HHMM-<slug>.md or YYYY-MM-DD-<slug>.md.
 */
import { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import { Loader2, MessageSquare, Calendar } from "lucide-react"
import { Card } from "@/components/ui/card"
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
  updated_at?: string
  date: string         // YYYY-MM-DD parsed from name or mtime
  title: string        // human-readable title from name
}

function parseDate(name: string, fallback?: string): string {
  // Match YYYY-MM-DD prefix
  const m = name.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m) return m[1]
  if (fallback) return fallback.slice(0, 10)
  return "Unknown"
}

function humanTitle(name: string): string {
  return name
    .replace(/\.md$/i, "")
    .replace(/^\d{4}-\d{2}-\d{2}[-T]?\d{0,4}-?/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "(untitled)"
}

function dayLabel(iso: string): string {
  if (iso === "Unknown") return "Unknown"
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date(); yest.setDate(today.getDate() - 1)
  if (iso === today.toISOString().slice(0, 10)) return "Today"
  if (iso === yest.toISOString().slice(0, 10)) return "Yesterday"
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: today.getFullYear() === d.getFullYear() ? undefined : "numeric" })
}

export function ConversationsView() {
  const [sessions, setSessions] = useState<SessionFile[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [content, setContent] = useState<string>("")
  const [contentLoading, setContentLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/memory-vault/tree", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setErrorStatus(res.status)
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then((data: { tree: TreeNode[] }) => {
        if (cancelled) return
        const conv = data.tree.find((n) => n.path === "/Conversations" && n.kind === "folder")
        const files: SessionFile[] = (conv?.children || [])
          .filter((c) => c.kind === "file")
          .map((c) => ({
            name: c.name,
            path: c.path,
            updated_at: c.updated_at,
            date: parseDate(c.name, c.updated_at),
            title: humanTitle(c.name),
          }))
          .sort((a, b) => b.path.localeCompare(a.path))
        setSessions(files)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

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
          When the AI ends a session it can write a summary to <code className="text-zinc-400 bg-zinc-800/50 px-1 rounded">/Conversations/</code>.
          Drop your own notes in there too — anything that lands in that folder shows up here, grouped by date.
        </div>
      </div>
    )
  }

  // Group by date
  const groups: Record<string, SessionFile[]> = {}
  for (const s of sessions) {
    if (!groups[s.date]) groups[s.date] = []
    groups[s.date].push(s)
  }
  const dateKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a))

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] h-full">
      {/* List */}
      <div className="overflow-y-auto border-r border-zinc-800/60 text-sm">
        {dateKeys.map((date) => (
          <div key={date}>
            <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800/60 flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> {dayLabel(date)}
            </div>
            {groups[date].map((s) => (
              <button
                key={s.path}
                onClick={() => setSelectedPath(s.path)}
                className={cn(
                  "block w-full text-left px-3 py-2 hover:bg-zinc-800/50 transition-colors",
                  selectedPath === s.path && "bg-amber-500/10"
                )}
              >
                <div className={cn("font-medium truncate", selectedPath === s.path ? "text-amber-100" : "text-zinc-200")}>
                  {s.title}
                </div>
                <div className="text-[10px] text-zinc-500 truncate">{s.name}</div>
              </button>
            ))}
          </div>
        ))}
      </div>
      {/* Reader */}
      <div className="overflow-y-auto p-6">
        {!selectedPath ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm text-center">
            <MessageSquare className="w-8 h-8 mb-3 text-zinc-700" />
            <div>Pick a session from the list to read it.</div>
          </div>
        ) : contentLoading ? (
          <div className="flex items-center text-sm text-zinc-500"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…</div>
        ) : (
          <article className="prose prose-invert max-w-none text-sm">
            <ReactMarkdown>{content || "_(empty)_"}</ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  )
}
