"use client"
/**
 * Sidebar list of agents for Command Center `agents` mode.
 *
 * Reads from /api/agents (the same endpoint AgentsView uses) and renders a
 * compact, clickable list. Selecting an agent opens its detail page at
 * /agency/agents/[slug] — matching the rest of the page's "click a row, see
 * the file" pattern.
 *
 * The sidebar deliberately stays slim (no nested folders, no editor) — the
 * full Agents/Workflows/Schedules/Runs/Health UX lives in the centre pane
 * via <AgentWorkflowsTabs />.
 */
import * as React from "react"
import Link from "next/link"
import useSWR from "swr"
import { Bot, Loader2, Plus, Search } from "lucide-react"
import { listAgents, type Agent } from "@/lib/api/agents"
import { cn } from "@/lib/utils"

interface Props {
  /** Currently focused agent slug (read from the URL or the AgentsView). */
  selectedSlug?: string | null
  onSelect?: (slug: string) => void
}

export function AgentsSidebar({ selectedSlug, onSelect }: Props) {
  const { data: agents = [], isLoading } = useSWR<Agent[]>(
    "agents-sidebar",
    () => listAgents({ include_archived: false })
  )

  const [query, setQuery] = React.useState("")
  const filtered = React.useMemo(() => {
    if (!query.trim()) return agents
    const q = query.trim().toLowerCase()
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q) ||
        (a.description || "").toLowerCase().includes(q)
    )
  }, [agents, query])

  return (
    <div className="flex flex-col h-full">
      {/* Search + new */}
      <div className="px-3 py-2 border-b border-mem-border flex items-center gap-2 sticky top-0 bg-mem-surface-1 z-10">
        <div className="flex-1 flex items-center gap-1.5 bg-mem-surface-2 border border-mem-border rounded-md px-2 h-7">
          <Search size={11} className="text-mem-text-muted shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter agents…"
            className="flex-1 bg-transparent outline-none border-0 font-mono text-[11px] text-mem-text-primary placeholder:text-mem-text-muted min-w-0"
            aria-label="Filter agents"
          />
        </div>
        <Link
          href="/agency/memory?mode=agents&tab=agents&new=1"
          className="h-7 w-7 grid place-items-center rounded-md text-mem-text-muted hover:text-mem-accent hover:bg-mem-surface-2 transition-colors"
          title="New agent"
          aria-label="New agent"
        >
          <Plus size={12} />
        </Link>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading && (
          <div className="px-4 py-6 text-center text-[11px] text-mem-text-muted flex items-center justify-center gap-1.5">
            <Loader2 size={12} className="animate-spin" />
            Loading agents…
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="px-4 py-6 text-center text-[11px] text-mem-text-muted">
            {agents.length === 0 ? (
              <>
                No agents yet.
                <br />
                Click <span className="text-mem-text-secondary">+</span> to make one.
              </>
            ) : (
              "No matches."
            )}
          </div>
        )}
        {filtered.map((a) => {
          const active = selectedSlug === a.slug
          return (
            <button
              key={a.id}
              onClick={() => onSelect?.(a.slug)}
              className={cn(
                "w-full text-left px-3 py-2 border-b border-mem-border/50 transition-colors",
                active ? "bg-mem-accent/10" : "hover:bg-mem-surface-2"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[14px] shrink-0 leading-none">
                  {a.emoji || <Bot size={12} className="text-mem-text-muted inline-block align-middle" />}
                </span>
                <span
                  className={cn(
                    "text-[12.5px] font-medium truncate",
                    active ? "text-mem-accent" : "text-mem-text-primary"
                  )}
                >
                  {a.name}
                </span>
                {a.is_orchestrator && (
                  <span className="text-[9px] uppercase tracking-[0.04em] font-semibold px-1 py-px rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 shrink-0">
                    orch
                  </span>
                )}
              </div>
              {a.description && (
                <div className="mt-0.5 text-[11px] text-mem-text-muted truncate pl-[22px]">
                  {a.description}
                </div>
              )}
              <div className="mt-1 pl-[22px] flex items-center gap-2 text-[10px] text-mem-text-muted">
                <span className="font-mono">{a.model}</span>
                <span>·</span>
                <span>used {a.use_count}×</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
