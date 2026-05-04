"use client"

/**
 * CommandPalette — global Cmd+K palette for the dashboard.
 *
 * Scope: anything outside `/jarvis` (which has its own dedicated cmdk). Phase 4
 * #2 of the terminals overhaul: the user can spawn / focus / kill / rename a
 * terminal, fuzzy-search agents, jump to a memory file, and trigger common
 * actions — all without taking their hands off the keyboard.
 *
 * Implementation:
 *   - Built on the `cmdk` library (React Aria-grade keyboard handling).
 *   - Mounted once at the dashboard layout root (see `<DashboardLayout>`).
 *   - Listens for ⌘K / Ctrl-K. RememberPalette has been demoted to ⌘⇧K so
 *     this palette owns the unmodified shortcut.
 *   - Lazily fetches sessions, agents, and a small slice of memory files when
 *     the palette opens. Re-fetches each open — cheap (~3 small JSON calls).
 *   - Every action is a verb. No "more info" dead-ends.
 */
import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { Command } from "cmdk"
import {
  Bot,
  FileText,
  Loader2,
  Plus,
  Search,
  Square,
  Sparkles,
  TerminalSquare,
  Pencil,
  ArrowRight,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface SessionLite {
  id: string
  title: string
  branch?: string | null
  nickname?: string | null
  color?: string | null
}
interface AgentLite {
  slug: string
  name: string
  description?: string | null
}
interface MemoryFileLite {
  path: string
  type?: string | null
}

export function CommandPalette() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [sessions, setSessions] = React.useState<SessionLite[]>([])
  const [agents, setAgents] = React.useState<AgentLite[]>([])
  const [files, setFiles] = React.useState<MemoryFileLite[]>([])
  /** /jarvis owns its own ⌘K — never compete. */
  const isJarvis = (pathname || "").startsWith("/jarvis")

  // Open / close on ⌘K. Skip on /jarvis. Skip when typing inside an input
  // unless the editable target is the palette itself (we re-trigger from there).
  React.useEffect(() => {
    if (isJarvis) return
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key.toLowerCase() !== "k") return
      // ⌘⇧K is RememberPalette territory; leave it alone.
      if (e.shiftKey) return
      // If focus is inside an editable element that ISN'T our palette, the
      // user is mid-typing — only intercept when the palette itself owns focus
      // (so "open palette" still works) or when focus is on body/buttons.
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) {
        if (!ae.closest("[data-cmdk-root]")) return
      }
      e.preventDefault()
      setOpen((v) => !v)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isJarvis])

  // Load data on open. Three parallel calls — cheap, all already cache-friendly.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setQuery("")
    setLoading(true)
    void (async () => {
      try {
        const [sRes, aRes, fRes] = await Promise.all([
          fetch("/api/terminals", { cache: "no-store" }).catch(() => null),
          fetch("/api/agents", { cache: "no-store" }).catch(() => null),
          fetch("/api/memories?limit=50", { cache: "no-store" }).catch(() => null),
        ])
        if (cancelled) return
        if (sRes?.ok) {
          const body = await sRes.json().catch(() => ({}))
          setSessions((body.sessions || []) as SessionLite[])
        }
        if (aRes?.ok) {
          const body = await aRes.json().catch(() => ({}))
          setAgents((body.data || body.agents || []) as AgentLite[])
        }
        if (fRes?.ok) {
          const body = await fRes.json().catch(() => ({}))
          // Memory list shape: { memories: [{ id, title, type, ... }] }. We
          // surface titles as "files" so the palette feels coherent.
          const mems = (body.memories || body.data || []) as Array<{ title?: string; path?: string; type?: string }>
          setFiles(mems.slice(0, 50).map((m) => ({
            path: m.path || m.title || "(untitled)",
            type: m.type || null,
          })))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open])

  const close = React.useCallback(() => {
    setOpen(false)
    setQuery("")
  }, [])

  const goto = React.useCallback((href: string) => {
    close()
    router.push(href)
  }, [close, router])

  const spawnTerminal = React.useCallback(async () => {
    close()
    try {
      const res = await fetch("/api/terminals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      toast.success("Terminal started")
      router.push("/agency/memory?mode=terminals")
    } catch (e) {
      toast.error("Couldn't start terminal", { description: (e as Error).message })
    }
  }, [close, router])

  const focusTerminal = React.useCallback((id: string) => {
    close()
    router.push(`/agency/memory?mode=terminals&focus=${encodeURIComponent(id)}`)
  }, [close, router])

  const renameTerminal = React.useCallback(async (id: string, current: string) => {
    close()
    const next = window.prompt("New name", current)?.trim()
    if (!next || next === current) return
    const res = await fetch(`/api/terminals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    })
    if (!res.ok) {
      toast.error("Rename failed")
      return
    }
    toast.success("Terminal renamed")
  }, [close])

  const stopTerminal = React.useCallback(async (id: string, title: string) => {
    close()
    if (!window.confirm(`Stop "${title}"? The branch is preserved.`)) return
    const res = await fetch(`/api/terminals/${id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Stop failed")
      return
    }
    toast.success("Terminal stopped")
  }, [close])

  if (isJarvis) return null

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command Palette"
      overlayClassName="fixed inset-0 z-[110] bg-black/60 backdrop-blur-[3px] data-[state=closed]:animate-out data-[state=open]:animate-in"
      contentClassName="fixed left-1/2 top-[12vh] z-[111] -translate-x-1/2 w-[min(640px,calc(100vw-2rem))] rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl overflow-hidden"
    >
      {/* The header doubles as the search input. */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
        <Search className="w-4 h-4 text-zinc-400 shrink-0" />
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Type a command — terminal, agent, memory file…"
          className="flex-1 bg-transparent border-0 outline-none text-sm text-zinc-100 placeholder:text-zinc-500"
        />
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />}
        <kbd className="hidden sm:inline text-[10px] font-mono text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700">esc</kbd>
      </div>

      <Command.List className="max-h-[60vh] overflow-y-auto p-1">
        <Command.Empty className="px-3 py-6 text-center text-xs text-zinc-500">
          No matches.
        </Command.Empty>

        {/* Quick actions — always visible, top of list. */}
        <Command.Group heading="Actions" className="px-1 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
          <Item icon={Plus} label="New terminal" hint="Spawn a Claude session on the VPS" onSelect={spawnTerminal} keywords={["spawn", "create", "open"]} />
          <Item icon={TerminalSquare} label="Open Terminals workspace" onSelect={() => goto("/agency/memory?mode=terminals")} keywords={["go", "open"]} />
          <Item icon={Bot} label="Open Agents workspace" onSelect={() => goto("/agency/memory?mode=agents")} keywords={["go", "open"]} />
          <Item icon={FileText} label="Open Memory" onSelect={() => goto("/agency/memory?mode=knowledge")} keywords={["go", "vault"]} />
          <Item
            icon={Sparkles}
            label="Quick remember"
            hint="Save a note → ⌘⇧K shortcut"
            onSelect={() => {
              close()
              try { window.dispatchEvent(new CustomEvent("jarvis:open-remember-palette")) } catch { /* */ }
            }}
            keywords={["note", "save"]}
          />
        </Command.Group>

        {/* Live terminals */}
        {sessions.length > 0 && (
          <Command.Group heading="Terminals" className="px-1 pt-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-500">
            {sessions.map((s) => {
              const label = s.nickname ? `${s.nickname} — ${s.title}` : s.title
              return (
                <React.Fragment key={s.id}>
                  <Item
                    icon={ArrowRight}
                    label={`Focus: ${label}`}
                    hint={s.branch || undefined}
                    onSelect={() => focusTerminal(s.id)}
                    keywords={[s.title, s.branch || "", s.nickname || "", "focus"]}
                  />
                  <Item
                    icon={Pencil}
                    label={`Rename: ${label}`}
                    onSelect={() => renameTerminal(s.id, s.title)}
                    keywords={[s.title, "rename"]}
                  />
                  <Item
                    icon={Square}
                    label={`Stop: ${label}`}
                    onSelect={() => stopTerminal(s.id, s.title)}
                    danger
                    keywords={[s.title, "stop", "kill"]}
                  />
                </React.Fragment>
              )
            })}
          </Command.Group>
        )}

        {/* Agents */}
        {agents.length > 0 && (
          <Command.Group heading="Agents" className="px-1 pt-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-500">
            {agents.slice(0, 30).map((a) => (
              <Item
                key={a.slug}
                icon={Bot}
                label={a.name}
                hint={a.description || a.slug}
                onSelect={() => goto(`/agency/agents/${a.slug}`)}
                keywords={[a.name, a.slug, a.description || ""]}
              />
            ))}
          </Command.Group>
        )}

        {/* Memory files */}
        {files.length > 0 && (
          <Command.Group heading="Memory" className="px-1 pt-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-500">
            {files.slice(0, 30).map((f) => (
              <Item
                key={f.path}
                icon={FileText}
                label={f.path}
                hint={f.type || undefined}
                onSelect={() => goto(`/agency/memory?mode=knowledge&file=${encodeURIComponent(f.path)}`)}
                keywords={[f.path, f.type || ""]}
              />
            ))}
          </Command.Group>
        )}
      </Command.List>

      <div className="flex items-center justify-between gap-2 border-t border-zinc-800 px-3 py-1.5 text-[10px] text-zinc-500 bg-zinc-900/50">
        <span>↑↓ navigate · ↵ select · esc close</span>
        <span className="font-mono">⌘K</span>
      </div>
    </Command.Dialog>
  )
}

function Item({
  icon: Icon,
  label,
  hint,
  onSelect,
  danger,
  keywords,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  hint?: string
  onSelect: () => void
  danger?: boolean
  keywords?: string[]
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      // cmdk fuzzy-matches against value + keywords; folding label into both
      // means partial typing still hits the right row.
      value={[label, ...(keywords || [])].join(" ")}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm",
        "data-[selected=true]:bg-cyan-500/10 data-[selected=true]:text-cyan-100",
        danger ? "text-red-300" : "text-zinc-200",
      )}
    >
      <Icon className={cn("w-3.5 h-3.5 shrink-0", danger ? "text-red-400" : "text-zinc-400")} />
      <span className="truncate">{label}</span>
      {hint && (
        <span className="ml-auto text-[10px] text-zinc-500 truncate max-w-[40%]">{hint}</span>
      )}
    </Command.Item>
  )
}
