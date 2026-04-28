"use client"
/**
 * Project Tree → Pages mode. Non-technical view of the app:
 *
 *  - 📱 Pages you can visit (with iframe preview on click)
 *  - ⏰ Background jobs (the 8 daily crons in vercel.json)
 *  - 🤖 AI agents (.md files from Memory Vault)
 *  - 🚧 Not built yet (SYSTEM.md §24 priorities)
 *
 * Curated, not auto-discovered, on purpose — Dylan asked for "well-organized,
 * not a billion files."
 */
import { useEffect, useMemo, useState } from "react"
import {
  ChevronRight, ChevronDown, ExternalLink, Loader2, Sparkles, Search,
  AlertCircle, Bot, Calendar, Globe, Clock, FolderOpen, Folder, Trash, Trash2, FileCode2,
} from "lucide-react"
import {
  FRIENDLY_CRONS, NOT_BUILT, CLEANUP_CANDIDATES,
  type FriendlyCron, type NotBuiltItem, type CleanupCandidate,
} from "@/lib/projects/pages-registry"
import { DeleteSourceDialog } from "./delete-source-dialog"

interface AllPage {
  route: string
  title: string
  description: string
  emoji: string
  section: string
  curated: boolean
  source_path: string
}
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import { SessionExpiredCard } from "./session-expired"

type Selection =
  | { kind: "page"; page: AllPage }
  | { kind: "cron"; cron: FriendlyCron }
  | { kind: "agent"; name: string; path: string }
  | { kind: "not-built"; item: NotBuiltItem }
  | { kind: "cleanup"; item: CleanupCandidate }

interface PagesViewProps {
  /** Switch to the Files view and select the given source file. */
  onOpenInTree?: (sourcePath: string) => void
  /** When set, auto-select the page with this route once the page list loads.
   *  Used by Files-mode "Open in Pages" cross-nav. */
  initialSelectRoute?: string | null
  /** Called once after auto-select fires, so the host can clear its pending state. */
  onAutoSelected?: () => void
}

export function PagesView({ onOpenInTree, initialSelectRoute, onAutoSelected }: PagesViewProps = {}) {
  const [selected, setSelected] = useState<Selection | null>(null)
  const [filter, setFilter] = useState("")
  const [agentRefresh, setAgentRefresh] = useState(0)
  const [deleteOpen, setDeleteOpen] = useState<{ page: AllPage } | null>(null)
  const [allPages, setAllPages] = useState<AllPage[] | null>(null)
  const [pageRefresh, setPageRefresh] = useState(0)

  // When the host asks us to auto-select a page (Files → Pages cross-nav),
  // wait for the all-pages list to load, then find + select the matching page.
  useEffect(() => {
    if (!initialSelectRoute || !allPages) return
    const match = allPages.find((p) => p.route === initialSelectRoute)
    if (match) {
      setSelected({ kind: "page", page: match })
      onAutoSelected?.()
    }
  }, [initialSelectRoute, allPages, onAutoSelected])

  // Pull the comprehensive page list from GitHub on mount + after a delete PR.
  useEffect(() => {
    let cancelled = false
    fetch("/api/projects/all-pages", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = await r.json()
        if (!cancelled) setAllPages((j.pages as AllPage[]) || [])
      })
      .catch(() => { if (!cancelled) setAllPages([]) })
    return () => { cancelled = true }
  }, [pageRefresh])

  const filteredPages = useMemo(() => {
    const source = allPages ?? []
    const q = filter.trim().toLowerCase()
    const list = !q
      ? [...source]
      : source.filter(p =>
          p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.route.includes(q),
        )
    return list.sort((a, b) => a.title.localeCompare(b.title))
  }, [filter, allPages])

  return (
    <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-3 h-full">
      {/* Left: index */}
      <div className="overflow-hidden flex flex-col bg-zinc-900/30 border border-zinc-800/60 rounded-lg">
        <div className="px-3 py-2 border-b border-zinc-800/60 shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter pages, jobs, agents…"
              className="h-7 pl-7 text-xs bg-zinc-950/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          <ProjectFolder name="agency-hq" emoji="🏢" defaultOpen>
            {/* ── Pages — flat alphabetical, no invented taxonomy ─── */}
            <Section icon={<Globe className="h-3.5 w-3.5" />} title="Pages" count={filteredPages.length}>
              {filteredPages.map((p) => (
                <SidebarRow
                  key={p.route}
                  selected={selected?.kind === "page" && selected.page.route === p.route}
                  onClick={() => setSelected({ kind: "page", page: p })}
                  emoji={p.emoji}
                  title={p.title}
                  subtitle={p.route}
                  indent={2}
                />
              ))}
            </Section>

            {/* ── Background jobs ─────────────────────── */}
            <Section icon={<Clock className="h-3.5 w-3.5" />} title="Background jobs" count={FRIENDLY_CRONS.length}>
              {FRIENDLY_CRONS.map((c) => (
                <SidebarRow
                  key={c.path}
                  selected={selected?.kind === "cron" && selected.cron.path === c.path}
                  onClick={() => setSelected({ kind: "cron", cron: c })}
                  emoji={c.emoji}
                  title={c.title}
                  subtitle={c.scheduleHuman}
                  indent={2}
                />
              ))}
            </Section>

            {/* ── AI Agents ───────────────────────────── */}
            <AgentsSection
              key={agentRefresh}
              selected={selected?.kind === "agent" ? selected.path : null}
              onSelect={(name, path) => setSelected({ kind: "agent", name, path })}
            />

            {/* ── Not built yet ───────────────────────── */}
            <Section icon={<AlertCircle className="h-3.5 w-3.5" />} title="Not built yet" count={NOT_BUILT.length}>
              {NOT_BUILT.map((item, i) => (
                <SidebarRow
                  key={i}
                  selected={selected?.kind === "not-built" && selected.item.title === item.title}
                  onClick={() => setSelected({ kind: "not-built", item })}
                  emoji={item.priority === "P1" ? "🔴" : item.priority === "P2" ? "🟡" : "🟢"}
                  title={item.title}
                  subtitle={`Priority ${item.priority}`}
                  indent={2}
                />
              ))}
            </Section>

            {/* ── Cleanup candidates — files that look old/unused ─── */}
            <Section icon={<Trash className="h-3.5 w-3.5" />} title="Review for cleanup" count={CLEANUP_CANDIDATES.length}>
              {CLEANUP_CANDIDATES.map((c, i) => (
                <SidebarRow
                  key={i}
                  selected={selected?.kind === "cleanup" && selected.item.path === c.path}
                  onClick={() => setSelected({ kind: "cleanup", item: c })}
                  emoji={c.certainty === "high" ? "🗑️" : c.certainty === "medium" ? "❓" : "🤔"}
                  title={c.path.split("/").pop() || c.path}
                  subtitle={c.certainty === "high" ? "likely safe to delete" : c.certainty === "medium" ? "needs a quick check" : "worth reviewing"}
                  indent={2}
                />
              ))}
            </Section>
          </ProjectFolder>
        </div>
      </div>

      {/* Right: detail */}
      <div className="overflow-hidden bg-zinc-900/30 border border-zinc-800/60 rounded-lg">
        {selected
          ? <DetailPane
              selection={selected}
              onAgentDeleted={() => { setSelected(null); setAgentRefresh((n) => n + 1) }}
              onAskDeletePage={(page) => setDeleteOpen({ page })}
              onOpenInTree={onOpenInTree}
            />
          : <EmptyState />}
      </div>

      {deleteOpen && (
        <DeleteSourceDialog
          sourcePath={deleteOpen.page.source_path}
          displayName={deleteOpen.page.title}
          routeContext={deleteOpen.page.route}
          onClose={() => setDeleteOpen(null)}
          onDeleted={() => {
            setDeleteOpen(null)
            setSelected(null)
            setPageRefresh((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}

function Section({
  icon, title, count, children,
}: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="space-y-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 pl-3 pr-2 py-1 text-[11px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ChevronRight className={`h-3 w-3 text-zinc-600 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="text-amber-400/70">{icon}</span>
        <span>{title}</span>
        <span className="text-zinc-700">·</span>
        <span>{count}</span>
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </section>
  )
}

/**
 * The top-level project folder. Designed to look like a Memory Tree row —
 * collapsible, with an emoji + name. Future projects will sit beside this
 * (each with their own ProjectFolder), inside the same scrollable list.
 */
function ProjectFolder({
  name, emoji, defaultOpen, children,
}: { name: string; emoji: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? true)
  return (
    <div className="space-y-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/60 transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
        <span className="text-base leading-none">{emoji}</span>
        {open ? <FolderOpen className="h-3.5 w-3.5 text-amber-400/70" /> : <Folder className="h-3.5 w-3.5 text-amber-400/70" />}
        <span className="text-sm font-medium text-zinc-100 font-mono">{name}</span>
      </button>
      {open && <div className="ml-4 space-y-3">{children}</div>}
    </div>
  )
}

function SidebarRow(props: {
  selected: boolean
  onClick: () => void
  emoji: string
  title: string
  subtitle: string
  indent?: number
}) {
  return (
    <button
      onClick={props.onClick}
      style={{ paddingLeft: 8 + (props.indent ?? 0) * 12 }}
      className={cn(
        "w-full flex items-start gap-2 pr-2 py-1.5 rounded text-left transition-colors",
        props.selected ? "bg-amber-500/15 text-amber-100" : "hover:bg-zinc-800/60 text-zinc-200",
      )}
    >
      <span className="text-base leading-none mt-0.5 shrink-0">{props.emoji}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-medium truncate">{props.title}</span>
        <span className="block text-[10px] text-zinc-500 truncate font-mono">{props.subtitle}</span>
      </span>
      <ChevronRight className="h-3 w-3 text-zinc-600 shrink-0 mt-1" />
    </button>
  )
}

function AgentsSection({ selected, onSelect }: { selected: string | null; onSelect: (name: string, path: string) => void }) {
  const [agents, setAgents] = useState<{ name: string; path: string }[] | null>(null)
  useEffect(() => {
    fetch("/api/memory-vault/tree", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { tree: [] })
      .then((d) => {
        const node = findVaultNode(d.tree, "/Jarvis/agent-skills")
        const found = (node?.children || [])
          .filter((c: { kind: string; name: string }) => c.kind === "file" && c.name.endsWith(".md"))
          .map((c: { name: string; path: string }) => ({ name: c.name.replace(/\.md$/, ""), path: c.path }))
        setAgents(found)
      })
      .catch(() => setAgents([]))
  }, [])

  return (
    <Section icon={<Bot className="h-3.5 w-3.5" />} title="AI agents" count={agents?.length ?? 0}>
      {agents === null && <div className="px-2 py-1 text-[11px] text-zinc-600 italic">loading…</div>}
      {agents?.length === 0 && <div className="px-2 py-1 text-[11px] text-zinc-600 italic">none configured yet</div>}
      {agents?.map((a) => (
        <SidebarRow
          key={a.path}
          selected={selected === a.path}
          onClick={() => onSelect(a.name, a.path)}
          emoji="🤖"
          title={prettyAgentName(a.name)}
          subtitle="Claude subagent"
          indent={2}
        />
      ))}
    </Section>
  )
}

interface VaultNode { name: string; path: string; kind: "file" | "folder"; children?: VaultNode[] }
function findVaultNode(tree: VaultNode[], target: string): VaultNode | null {
  for (const n of tree) {
    if (n.path === target) return n
    if (n.children) {
      const found = findVaultNode(n.children, target)
      if (found) return found
    }
  }
  return null
}

function prettyAgentName(slug: string): string {
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function DetailPane({ selection, onAgentDeleted, onAskDeletePage, onOpenInTree }: { selection: Selection; onAgentDeleted: () => void; onAskDeletePage: (page: AllPage) => void; onOpenInTree?: (sourcePath: string) => void }) {
  if (selection.kind === "page") return <PageDetail page={selection.page} onAskDelete={() => onAskDeletePage(selection.page)} onOpenInTree={onOpenInTree} />
  if (selection.kind === "cron") return <CronDetail cron={selection.cron} />
  if (selection.kind === "agent") return <AgentDetail name={selection.name} path={selection.path} onDeleted={onAgentDeleted} />
  if (selection.kind === "cleanup") return <CleanupDetail item={selection.item} onOpenInTree={onOpenInTree} />
  return <NotBuiltDetail item={selection.item} />
}

function CleanupDetail({ item, onOpenInTree }: { item: CleanupCandidate; onOpenInTree?: (sourcePath: string) => void }) {
  const tone =
    item.certainty === "high" ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
    : item.certainty === "medium" ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
    : "border-zinc-700 bg-zinc-900/40 text-zinc-300"
  const certaintyLabel = item.certainty === "high" ? "Likely safe to delete" : item.certainty === "medium" ? "Probably old, but check first" : "Worth reviewing"
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center gap-2 flex-wrap">
        <span className="text-2xl">{item.certainty === "high" ? "🗑️" : item.certainty === "medium" ? "❓" : "🤔"}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-zinc-100 truncate font-mono">{item.path}</div>
          <span className={cn("inline-flex items-center px-2 py-0.5 rounded border text-[10px] mt-0.5", tone)}>
            {certaintyLabel}
          </span>
        </div>
      </div>
      <div className="p-6 space-y-4 text-sm">
        <Field label="Why I think it's old" value={item.reason} />
        <Field label="What to do" value={item.recommendation} />
        {onOpenInTree && (
          <div className="pt-2">
            <Button size="sm" variant="outline" onClick={() => onOpenInTree(item.path)} className="gap-1.5">
              <FileCode2 className="h-3.5 w-3.5" /> Open in Files view
            </Button>
          </div>
        )}
        <div className="pt-4 border-t border-zinc-800/60 text-xs text-zinc-500">
          You can also delete it from the Files view — same cascade dialog appears there.
        </div>
      </div>
    </div>
  )
}

function PageDetail({ page, onAskDelete, onOpenInTree }: { page: AllPage; onAskDelete: () => void; onOpenInTree?: (sourcePath: string) => void }) {
  const isCurrentPage = typeof window !== "undefined" && window.location.pathname === page.route
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl">{page.emoji}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-100 truncate flex items-center gap-2">
              {page.title}
              {!page.curated && <Badge variant="outline" className="text-[9px] border-zinc-700 text-zinc-500">auto-discovered</Badge>}
            </div>
            <div className="text-[11px] font-mono text-zinc-500 truncate">{page.route}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="outline" asChild className="gap-1.5">
            <a href={page.route} target="_blank" rel="noreferrer">
              Open in new tab <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
          {page.source_path && onOpenInTree && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpenInTree(page.source_path)}
              className="gap-1.5 text-zinc-400 hover:text-amber-300"
              title="See the real source file behind this page"
            >
              <FileCode2 className="h-3.5 w-3.5" /> View source
            </Button>
          )}
          {page.source_path && (
            <Button size="sm" variant="ghost" onClick={onAskDelete} className="gap-1.5 text-zinc-500 hover:text-rose-400" title="Delete this page (opens a PR)">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          )}
        </div>
      </div>
      <div className="px-4 py-2 text-xs text-zinc-300 border-b border-zinc-800/60 shrink-0">{page.description}</div>
      {isCurrentPage ? (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-sm gap-2 p-6 text-center">
          <Sparkles className="h-6 w-6 text-amber-400" />
          <div className="font-medium text-zinc-300">You&apos;re already on this page.</div>
          <div className="text-xs">Click <strong>Open in new tab</strong> above to see it side-by-side.</div>
        </div>
      ) : (
        <iframe
          src={page.route}
          className="flex-1 w-full border-0 bg-zinc-950"
          title={page.title}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />
      )}
    </div>
  )
}

function CronDetail({ cron }: { cron: FriendlyCron }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center gap-2">
        <span className="text-2xl">{cron.emoji}</span>
        <div>
          <div className="text-sm font-semibold text-zinc-100">{cron.title}</div>
          <div className="text-[11px] font-mono text-zinc-500">{cron.path}</div>
        </div>
      </div>
      <div className="p-6 space-y-4 text-sm">
        <Field label="What it does" value={cron.description} />
        <Field label="When it runs" value={cron.scheduleHuman} />
        <Field label="Cron schedule" value={cron.schedule} mono />
        <div className="pt-4 border-t border-zinc-800/60">
          <p className="text-xs text-zinc-500">
            This runs automatically on Vercel — you don&apos;t have to do anything. If it fails, you&apos;ll get an alert.
          </p>
        </div>
      </div>
    </div>
  )
}

function AgentDetail({ name, path, onDeleted }: { name: string; path: string; onDeleted: () => void }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setError(null); setErrorStatus(null); setContent(null)
    fetch(`/api/memory-vault/file?path=${encodeURIComponent(path)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          setErrorStatus(r.status)
          throw new Error(`HTTP ${r.status}`)
        }
        const j = await r.json()
        setContent(j.content || "")
        setDraft(j.content || "")
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [path])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/memory-vault/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: draft }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setContent(draft)
      setEditing(false)
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setSaving(false) }
  }

  async function del() {
    try {
      const res = await fetch(`/api/memory-vault/file?path=${encodeURIComponent(path)}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onDeleted()
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center gap-2">
        <span className="text-2xl">🤖</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-zinc-100 truncate">{prettyAgentName(name)}</div>
          <div className="text-[11px] font-mono text-zinc-500 truncate">{path}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {editing ? (
            <>
              <Button size="sm" onClick={save} disabled={saving} className="h-7 px-2 text-xs">
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(content || "") }} className="h-7 px-2 text-xs">Cancel</Button>
            </>
          ) : confirmDelete ? (
            <>
              <Button size="sm" variant="destructive" onClick={del} className="h-7 px-2 text-xs">Delete</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} className="h-7 px-2 text-xs">Cancel</Button>
            </>
          ) : content !== null && (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="h-7 px-2 text-xs">Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} className="h-7 px-2 text-zinc-500 hover:text-rose-400">🗑️</Button>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {errorStatus === 401 && <SessionExpiredCard what="this agent" />}
        {error && errorStatus !== 401 && <div className="text-rose-300 text-sm">Couldn&apos;t load: {error}</div>}
        {content === null && !error && (
          <div className="flex items-center text-zinc-500 text-sm">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
          </div>
        )}
        {content !== null && !editing && (
          <article className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </article>
        )}
        {content !== null && editing && (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full h-full min-h-[400px] bg-zinc-950 border border-zinc-800 rounded p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500/50"
          />
        )}
      </div>
    </div>
  )
}

function NotBuiltDetail({ item }: { item: NotBuiltItem }) {
  const tone =
    item.priority === "P1" ? "text-rose-300 border-rose-500/30 bg-rose-500/10"
    : item.priority === "P2" ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
    : "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center gap-2 flex-wrap">
        <span className="text-2xl">🚧</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-zinc-100">{item.title}</div>
          <Badge className={cn("text-[10px] mt-0.5", tone)} variant="outline">Priority {item.priority}</Badge>
        </div>
      </div>
      <div className="p-6 space-y-4 text-sm">
        <Field label="What it would do" value={item.description} />
        <Field label="Why it matters" value={item.why} />
        <div className="pt-4 border-t border-zinc-800/60 text-xs text-zinc-500">
          Until this is built, the system works around it manually — but it&apos;s on the roadmap.
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">{label}</div>
      <div className={cn("text-zinc-200", mono && "font-mono text-xs")}>{value}</div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm p-6 text-center">
      <Calendar className="h-8 w-8 mb-3 text-zinc-700" />
      <div>Pick a page, job, or agent on the left to see what it does.</div>
      <div className="text-xs text-zinc-600 mt-2 max-w-md">
        Frontend pages open in a live preview. Backend jobs and agents show plain-language descriptions.
      </div>
    </div>
  )
}
