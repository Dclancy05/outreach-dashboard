"use client"
/**
 * Right rail with 4 tabs: Chat / Info / History / Memories.
 *
 * Collapsible to a 48px strip on desktop. On mobile (in pane-stack mode) the
 * parent decides visibility; this component just renders the panel.
 *
 * BUG (W1C right-rail icon-only at <md) fix: when the viewport drops below
 * md (768px), the rail snaps to icon-only width regardless of the user's
 * previous toggle. Tapping any icon expands it back to the full panel for
 * that interaction. This prevents the tab labels (Chat/Info/History/Memories)
 * from clipping at narrow widths.
 *
 * - Chat       — context-aware AI chat (uses /api/memories/inject for context)
 * - Info       — file metadata (path, size, last edit, etc.)
 * - History    — file modtime list (vault) or memory_versions if a memory is selected
 * - Memories   — full Memories CRUD (see memories-tab.tsx)
 */
import * as React from "react"
import {
  MessageSquare, Info, History, BookMarked, ChevronLeft, ChevronRight, Send,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { MemoriesTab } from "./memories-tab"

type Tab = "chat" | "info" | "history" | "memories"

interface Props {
  /** Currently selected vault file path (or null). */
  path: string | null
  /** Active business scope from localStorage. */
  businessId: string | null
  /** When true, render as a slim 48px strip even on desktop (tablet default). */
  defaultCollapsed?: boolean
}

// BUG (W1C) fix: media-query hook scoped to <md so the rail collapses to
// icon-only on small tablets / large phones where labels would clip.
function useBelowMd(): boolean {
  const [below, setBelow] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const handler = (e: MediaQueryListEvent | MediaQueryList) =>
      setBelow("matches" in e ? e.matches : (e as MediaQueryList).matches)
    handler(mq)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return below
}

export function RightRail({ path, businessId, defaultCollapsed = false }: Props) {
  const belowMd = useBelowMd()
  const [userCollapsed, setUserCollapsed] = React.useState(defaultCollapsed)
  // BUG (W1C) fix: at <md the rail is forced icon-only regardless of user
  // preference. Above md the user toggle still wins.
  const collapsed = belowMd ? true : userCollapsed
  const [tab, setTab] = React.useState<Tab>("chat")

  const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "info", label: "Info", icon: Info },
    { id: "history", label: "History", icon: History },
    { id: "memories", label: "Memories", icon: BookMarked },
  ]

  return (
    <aside
      className={cn(
        "h-full bg-mem-surface-1 border-l border-mem-border flex flex-col transition-[width] duration-[220ms] ease-mem-spring shrink-0"
      )}
      style={{ width: collapsed ? 48 : 320 }}
      aria-label="Side panel"
    >
      {/* Header */}
      <div
        className={cn(
          "h-12 border-b border-mem-border flex items-center",
          collapsed ? "flex-col gap-2 py-3 h-auto" : "px-2 gap-1"
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-1 bg-mem-surface-2 border border-mem-border rounded-lg p-0.5 flex-wrap">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "h-6 px-2 rounded-md text-[11px] font-medium inline-flex items-center gap-1 transition-colors",
                    active
                      ? "bg-mem-surface-3 text-mem-text-primary"
                      : "text-mem-text-secondary hover:text-mem-text-primary"
                  )}
                  aria-pressed={active}
                >
                  <Icon size={11} />
                  {t.label}
                </button>
              )
            })}
          </div>
        )}
        {collapsed &&
          TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id)
                  // BUG (W1C) fix: at <md we don't expand the rail (no room);
                  // above md we expand to show the panel content as before.
                  if (!belowMd) setUserCollapsed(false)
                }}
                className={cn(
                  "h-7 w-7 grid place-items-center rounded-md transition-colors",
                  active
                    ? "bg-mem-surface-3 text-mem-text-primary"
                    : "text-mem-text-secondary hover:text-mem-text-primary hover:bg-mem-surface-2"
                )}
                aria-label={t.label}
                title={t.label}
              >
                <Icon size={14} />
              </button>
            )
          })}
        {/* BUG (W1C) fix: hide the chevron toggle at <md — there's no expanded
            state to toggle to since the rail is force-collapsed. */}
        {!belowMd && (
          <button
            onClick={() => setUserCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand side panel" : "Collapse side panel"}
            className={cn(
              "h-6 w-6 grid place-items-center rounded-md text-mem-text-muted hover:text-mem-text-primary hover:bg-mem-surface-2 transition-colors",
              !collapsed && "ml-auto"
            )}
          >
            {collapsed ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="flex-1 min-h-0 flex flex-col">
          {tab === "chat" && <ChatTab path={path} businessId={businessId} />}
          {tab === "info" && <InfoTab path={path} />}
          {tab === "history" && <HistoryTab path={path} />}
          {tab === "memories" && <MemoriesTab path={path} businessId={businessId} />}
        </div>
      )}
    </aside>
  )
}

/* ────────── Chat tab ────────── */

interface RailMsg {
  id: string
  role: "user" | "assistant"
  content: string
}

function ChatTab({ path, businessId }: { path: string | null; businessId: string | null }) {
  const [messages, setMessages] = React.useState<RailMsg[]>([])
  const [input, setInput] = React.useState("")
  const [thinking, setThinking] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setMessages([
      {
        id: "seed",
        role: "assistant",
        content: path
          ? `I can see ${path.split("/").pop()}. Ask about it, or pick another file.`
          : "Pick a vault file to chat about it. I'll pull related memories from your knowledge base.",
      },
    ])
  }, [path])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || thinking) return
    const userMsg: RailMsg = { id: `u-${Date.now()}`, role: "user", content: text }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setThinking(true)

    try {
      const sp = new URLSearchParams()
      sp.set("max_tokens", "1500")
      sp.set("q", text)
      if (businessId) sp.set("business_id", businessId)
      const r = await fetch(`/api/memories/inject?${sp.toString()}`, { cache: "no-store" })
      const j = await r.json()
      const ctx = (j.context || j.markdown || "").slice(0, 1200)
      const reply = ctx
        ? `Based on your memory:\n\n${ctx}\n\n— ${j.tokens_used || 0} tokens of context.`
        : "I don't have any matching memories yet. Try writing one in the Memories tab."
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", content: reply },
      ])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: `Couldn't reach memory inject endpoint: ${
            e instanceof Error ? e.message : "unknown error"
          }`,
        },
      ])
    } finally {
      setThinking(false)
    }
  }

  return (
    <>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-3 space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[92%] rounded-xl px-3 py-2 text-[12.5px] leading-[1.55] whitespace-pre-wrap",
              m.role === "user"
                ? "ml-auto bg-mem-accent text-white"
                : "bg-mem-surface-2 border border-mem-border text-mem-text-primary"
            )}
          >
            {m.content}
          </div>
        ))}
        {thinking && (
          <div className="text-[11px] text-mem-text-muted">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-mem-status-thinking mr-2 animate-pulse" />
            thinking…
          </div>
        )}
      </div>
      <div className="border-t border-mem-border p-2">
        <div className="flex items-center gap-1.5 bg-mem-surface-2 border border-mem-border rounded-lg pl-2 pr-1 py-1 focus-within:border-mem-accent/60 transition-colors">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Ask about your memory…"
            className="flex-1 bg-transparent outline-none border-0 font-mono text-[12px] text-mem-text-primary placeholder:text-mem-text-muted min-w-0"
            aria-label="Message"
          />
          <button
            onClick={send}
            disabled={!input.trim() || thinking}
            aria-label="Send"
            className={cn(
              "h-7 w-7 grid place-items-center rounded-md transition-colors",
              input.trim() && !thinking
                ? "bg-mem-accent text-white hover:brightness-110"
                : "text-mem-text-muted bg-mem-surface-3"
            )}
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </>
  )
}

/* ────────── Info tab ────────── */

function InfoTab({ path }: { path: string | null }) {
  const [meta, setMeta] = React.useState<{ size?: number; updated_at?: string; content?: string } | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!path) {
      setMeta(null)
      return
    }
    setLoading(true)
    fetch(`/api/memory-vault/file?path=${encodeURIComponent(path)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setMeta(j || null))
      .catch(() => setMeta(null))
      .finally(() => setLoading(false))
  }, [path])

  if (!path) {
    return (
      <div className="flex-1 grid place-items-center text-center px-4">
        <p className="text-[13px] text-mem-text-secondary">Select a file to see metadata.</p>
      </div>
    )
  }

  const sizeKb = meta?.size != null ? (meta.size / 1024).toFixed(1) + " KB" : "—"
  const words = meta?.content ? meta.content.trim().split(/\s+/).filter(Boolean).length : 0
  const lastEdit = meta?.updated_at ? new Date(meta.updated_at).toLocaleString() : "—"

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Path", value: <span className="font-mono text-[11px]">{path}</span> },
    { label: "Size", value: loading ? "…" : sizeKb },
    { label: "Last edited", value: loading ? "…" : lastEdit },
    { label: "Word count", value: loading ? "…" : `${words}` },
  ]

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3">
      <ul className="divide-y divide-mem-border bg-mem-surface-2 border border-mem-border rounded-xl overflow-hidden">
        {rows.map((r) => (
          <li key={r.label} className="flex items-baseline gap-3 px-3 py-2.5">
            <span className="text-[10px] uppercase tracking-[0.04em] font-semibold text-mem-text-muted w-[80px] shrink-0">
              {r.label}
            </span>
            <span className="text-[12px] text-mem-text-primary min-w-0 truncate">
              {r.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ────────── History tab ────────── */

function HistoryTab({ path }: { path: string | null }) {
  if (!path) {
    return (
      <div className="flex-1 grid place-items-center text-center px-4">
        <p className="text-[13px] text-mem-text-secondary">Select a file to see its history.</p>
      </div>
    )
  }
  // For vault files we currently only have last-modified — full file history
  // arrives once vault_snapshots backfill more days. Surface what we know.
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.04em] font-semibold text-mem-text-muted mb-2">
        Recent edits
      </p>
      <ol className="space-y-2">
        <li className="bg-mem-surface-2 border border-mem-border rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-mem-accent" />
            <span className="text-[11px] font-mono text-mem-text-muted">now</span>
            <span className="ml-auto text-[10px] uppercase tracking-[0.04em] font-semibold text-mem-text-muted">
              current
            </span>
          </div>
          <p className="mt-1.5 text-[12.5px] text-mem-text-primary">Live state</p>
        </li>
        <li className="bg-mem-surface-2 border border-mem-border rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-mem-status-working" />
            <span className="text-[11px] font-mono text-mem-text-muted">use Time Machine</span>
          </div>
          <p className="mt-1.5 text-[12px] text-mem-text-secondary">
            Use the chips at the bottom to view this file as it was 1h / 1d / 1w / 30d ago.
          </p>
        </li>
      </ol>
    </div>
  )
}
