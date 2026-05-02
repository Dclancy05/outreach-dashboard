"use client"

/**
 * AgentsPage — client component for /jarvis/agents.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  Title row:  Agents  [count]                       [+ New agent] │
 *   │──────────────────────────────────────────────────────────────────│
 *   │  Subtab strip (with BUG-008 mobile horizontal scroll fix)        │
 *   │  Agents · Workflows · Schedules · Runs · Health                   │
 *   │──────────────────────────────────────────────────────────────────│
 *   │  Active subtab body (existing AgentWorkflowsTabs internals)      │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * The big change vs /agency/agents: this page lives inside the Jarvis chrome
 * (W3A's layout). It uses the `?tab=` query mode of AgentWorkflowsTabs so URL
 * sharing works without conflicting with the legacy `#agent-workflows/<sub>`
 * hash sync.
 */

import * as React from "react"
import useSWR from "swr"
import { Bot, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AgentWorkflowsTabs } from "@/components/agent-workflows/agent-workflows-tabs"

interface Agent {
  id: string
  slug: string
  name: string
  archived: boolean
}

interface AgentsResponse {
  data: Agent[]
}

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

export function AgentsPage() {
  const { data } = useSWR<AgentsResponse>("/api/agents", fetcher)
  const count = data?.data?.filter((a) => !a.archived).length ?? null

  return (
    <div className="flex flex-col h-full min-h-0 bg-mem-bg">
      {/* Title row */}
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Bot className="w-5 h-5 text-mem-accent shrink-0" />
          <h1 className="text-[22px] sm:text-[28px] font-semibold tracking-[-0.01em] text-mem-text-primary leading-none">
            Agents
          </h1>
          {count !== null && (
            <span
              className="inline-flex items-center h-6 px-2 rounded-full bg-mem-surface-2 border border-mem-border text-mem-text-muted text-[11px] font-mono"
              aria-label={`${count} active agents`}
            >
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-8 bg-mem-accent text-white hover:brightness-110 text-[12px]"
            onClick={() => {
              // For now, defer to the existing Agents subtab create flow:
              // it has the full create modal. We just route the user there.
              if (typeof window !== "undefined") {
                const url = new URL(window.location.href)
                url.searchParams.set("tab", "agents")
                window.history.pushState(null, "", url.toString())
                // Nudge listeners (AgentWorkflowsTabs) to re-read the URL.
                window.dispatchEvent(new PopStateEvent("popstate"))
              }
            }}
            data-testid="jarvis-new-agent"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New agent
          </Button>
        </div>
      </header>

      {/* 5-subtab body — query-sync mode so /jarvis/agents?tab=runs works. */}
      <div className="flex-1 min-h-0 flex flex-col">
        <AgentWorkflowsTabs defaultTab="agents" syncMode="query" />
      </div>
    </div>
  )
}
