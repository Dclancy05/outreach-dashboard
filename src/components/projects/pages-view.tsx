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
  ChevronRight, ExternalLink, Loader2, Sparkles, Search,
  AlertCircle, Bot, Calendar, Globe, Clock,
} from "lucide-react"
import {
  FRIENDLY_PAGES, FRIENDLY_CRONS, NOT_BUILT, SECTION_ORDER,
  type FriendlyPage, type FriendlyCron, type NotBuiltItem,
} from "@/lib/projects/pages-registry"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"

type Selection =
  | { kind: "page"; page: FriendlyPage }
  | { kind: "cron"; cron: FriendlyCron }
  | { kind: "agent"; name: string; path: string }
  | { kind: "not-built"; item: NotBuiltItem }

export function PagesView() {
  const [selected, setSelected] = useState<Selection | null>(null)
  const [filter, setFilter] = useState("")

  const filteredPages = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return FRIENDLY_PAGES
    return FRIENDLY_PAGES.filter(p =>
      p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.route.includes(q),
    )
  }, [filter])

  const pagesBySection = useMemo(() => {
    const m = new Map<string, FriendlyPage[]>()
    for (const p of filteredPages) {
      const arr = m.get(p.section) ?? m.set(p.section, []).get(p.section)!
      arr.push(p)
    }
    return Array.from(m.entries()).sort(([a], [b]) =>
      SECTION_ORDER.indexOf(a as never) - SECTION_ORDER.indexOf(b as never),
    )
  }, [filteredPages])

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

        <div className="flex-1 overflow-auto p-2 space-y-4">
          {/* ── Pages ─────────────────────────────── */}
          <Section icon={<Globe className="h-3.5 w-3.5" />} title="Pages you can visit" count={filteredPages.length}>
            {pagesBySection.map(([section, pages]) => (
              <div key={section} className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-zinc-600 px-2 py-1">{section}</div>
                {pages.map((p) => (
                  <SidebarRow
                    key={p.route}
                    selected={selected?.kind === "page" && selected.page.route === p.route}
                    onClick={() => setSelected({ kind: "page", page: p })}
                    emoji={p.emoji}
                    title={p.title}
                    subtitle={p.route}
                  />
                ))}
              </div>
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
              />
            ))}
          </Section>

          {/* ── AI Agents ───────────────────────────── */}
          <AgentsSection
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
              />
            ))}
          </Section>
        </div>
      </div>

      {/* Right: detail */}
      <div className="overflow-hidden bg-zinc-900/30 border border-zinc-800/60 rounded-lg">
        {selected ? <DetailPane selection={selected} /> : <EmptyState />}
      </div>
    </div>
  )
}

function Section({
  icon, title, count, children,
}: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <div className="flex items-center gap-2 px-2 py-1 text-[11px] uppercase tracking-wider text-zinc-500">
        <span className="text-amber-400/70">{icon}</span>
        <span>{title}</span>
        <span className="text-zinc-700">·</span>
        <span>{count}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </section>
  )
}

function SidebarRow(props: {
  selected: boolean
  onClick: () => void
  emoji: string
  title: string
  subtitle: string
}) {
  return (
    <button
      onClick={props.onClick}
      className={cn(
        "w-full flex items-start gap-2 px-2 py-1.5 rounded text-left transition-colors",
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

function DetailPane({ selection }: { selection: Selection }) {
  if (selection.kind === "page") return <PageDetail page={selection.page} />
  if (selection.kind === "cron") return <CronDetail cron={selection.cron} />
  if (selection.kind === "agent") return <AgentDetail name={selection.name} path={selection.path} />
  return <NotBuiltDetail item={selection.item} />
}

function PageDetail({ page }: { page: FriendlyPage }) {
  const isCurrentPage = typeof window !== "undefined" && window.location.pathname === page.route
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl">{page.emoji}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-100 truncate">{page.title}</div>
            <div className="text-[11px] font-mono text-zinc-500 truncate">{page.route}</div>
          </div>
        </div>
        <Button size="sm" variant="outline" asChild className="gap-1.5 shrink-0">
          <a href={page.route} target="_blank" rel="noreferrer">
            Open in new tab <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
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

function AgentDetail({ name, path }: { name: string; path: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch(`/api/memory-vault/file?path=${encodeURIComponent(path)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = await r.json()
        setContent(j.content || "")
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [path])

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center gap-2">
        <span className="text-2xl">🤖</span>
        <div>
          <div className="text-sm font-semibold text-zinc-100">{prettyAgentName(name)}</div>
          <div className="text-[11px] font-mono text-zinc-500">{path}</div>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {error && <div className="text-rose-300 text-sm">Couldn&apos;t load: {error}</div>}
        {content === null && !error && (
          <div className="flex items-center text-zinc-500 text-sm">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
          </div>
        )}
        {content !== null && (
          <article className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </article>
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
