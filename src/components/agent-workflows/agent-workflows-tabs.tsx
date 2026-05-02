"use client"

/**
 * Agent Workflows — the 5-subtab container that lives inside the
 * "Agent Workflows" top-level tab on /agency/memory. Also used by the new
 * /jarvis/agents page (W3C). It supports two URL-sync modes simultaneously:
 *
 *   - Hash sync (legacy): `#agent-workflows/<sub>` — used by /agency/memory.
 *   - Query sync (jarvis): `?tab=<sub>` — used by /jarvis/agents.
 *
 * Both work side-by-side without trampling each other. On mount, we check the
 * query string FIRST (so /jarvis/agents?tab=runs wins), then fall back to the
 * hash. Updates write whichever sync mode the page mounted with — see
 * `useQuerySync` in the hook below.
 *
 * BUG-008 fix: the inner TabsList now scrolls horizontally on mobile (was
 * `overflow-x: hidden`), so all 5 subtabs (incl. Health) are reachable on
 * 375px wide screens. Triggers carry `flex-shrink-0` so they keep their full
 * width while the strip scrolls.
 */

import { useEffect, useState } from "react"
import { Bot, Workflow, CalendarClock, Activity, HeartPulse } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { AgentsView } from "@/components/agent-workflows/agents/agents-view"
import { WorkflowsView } from "@/components/agent-workflows/workflows/workflows-view"
import { SchedulesView } from "@/components/agent-workflows/schedules/schedules-view"
import { RunsView } from "@/components/agent-workflows/runs/runs-view"
import { HealthView } from "@/components/agent-workflows/health/health-view"

export type AgentSubTab = "agents" | "workflows" | "schedules" | "runs" | "health"
const VALID: AgentSubTab[] = ["agents", "workflows", "schedules", "runs", "health"]

function readSubFromUrl(): AgentSubTab | null {
  if (typeof window === "undefined") return null
  // Query first (jarvis), then hash (legacy /agency/memory).
  const sp = new URLSearchParams(window.location.search)
  const fromQuery = sp.get("tab") as AgentSubTab | null
  if (fromQuery && VALID.includes(fromQuery)) return fromQuery
  const h = window.location.hash.replace(/^#/, "")
  const seg = h.split("/")[1] as AgentSubTab | undefined
  if (seg && VALID.includes(seg)) return seg
  return null
}

export interface AgentWorkflowsTabsProps {
  /**
   * Default sub-tab when neither the query string nor hash specifies one.
   * Defaults to "agents" so existing callers keep their behavior.
   */
  defaultTab?: AgentSubTab
  /**
   * URL sync mode. "hash" (default) writes `#agent-workflows/<sub>` — used by
   * /agency/memory. "query" writes `?tab=<sub>` — used by /jarvis/agents.
   * Reads always check both regardless of mode.
   */
  syncMode?: "hash" | "query"
}

export function AgentWorkflowsTabs({
  defaultTab = "agents",
  syncMode = "hash",
}: AgentWorkflowsTabsProps = {}) {
  const [sub, setSubRaw] = useState<AgentSubTab>(defaultTab)

  useEffect(() => {
    const initial = readSubFromUrl()
    if (initial) setSubRaw(initial)
    const onChange = () => {
      const next = readSubFromUrl()
      if (next) setSubRaw(next)
    }
    window.addEventListener("hashchange", onChange)
    window.addEventListener("popstate", onChange)
    return () => {
      window.removeEventListener("hashchange", onChange)
      window.removeEventListener("popstate", onChange)
    }
  }, [])

  const setSub = (next: AgentSubTab) => {
    setSubRaw(next)
    if (typeof window === "undefined") return
    if (syncMode === "query") {
      const url = new URL(window.location.href)
      url.searchParams.set("tab", next)
      // Preserve the hash if any caller relies on it (cheap insurance).
      window.history.replaceState(null, "", url.toString())
    } else {
      const newUrl = `${window.location.pathname}${window.location.search}#agent-workflows/${next}`
      window.history.replaceState(null, "", newUrl)
    }
  }

  // BUG-008 fix: wrap TabsList in a scroll container so mobile can reach
  // Runs and Health. The arbitrary CSS hides the scrollbar while keeping
  // pointer/keyboard scroll. flex-shrink-0 on each trigger keeps their width.
  const triggerClass = "gap-2 flex-shrink-0"

  return (
    <Tabs value={sub} onValueChange={(v) => setSub(v as AgentSubTab)} className="flex-1 flex flex-col min-h-0">
      <div
        className="mx-4 mt-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <TabsList className="flex w-max">
          <TabsTrigger value="agents" className={triggerClass}>
            <Bot className="w-4 h-4" /> Agents
          </TabsTrigger>
          <TabsTrigger value="workflows" className={triggerClass}>
            <Workflow className="w-4 h-4" /> Workflows
          </TabsTrigger>
          <TabsTrigger value="schedules" className={triggerClass}>
            <CalendarClock className="w-4 h-4" /> Schedules
          </TabsTrigger>
          <TabsTrigger value="runs" className={triggerClass}>
            <Activity className="w-4 h-4" /> Runs
          </TabsTrigger>
          <TabsTrigger value="health" className={triggerClass}>
            <HeartPulse className="w-4 h-4" /> Health
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="agents" className="flex-1 mt-3 min-h-0">
        <div className="px-4 pb-4 h-full">
          <Card className="h-full overflow-hidden p-0"><AgentsView /></Card>
        </div>
      </TabsContent>

      <TabsContent value="workflows" className="flex-1 mt-3 min-h-0">
        <div className="px-4 pb-4 h-full">
          <Card className="h-full overflow-hidden p-0"><WorkflowsView /></Card>
        </div>
      </TabsContent>

      <TabsContent value="schedules" className="flex-1 mt-3 min-h-0">
        <div className="px-4 pb-4 h-full">
          <Card className="h-full overflow-hidden p-0"><SchedulesView /></Card>
        </div>
      </TabsContent>

      <TabsContent value="runs" className="flex-1 mt-3 min-h-0">
        <div className="px-4 pb-4 h-full">
          <Card className="h-full overflow-hidden p-0"><RunsView /></Card>
        </div>
      </TabsContent>

      <TabsContent value="health" className="flex-1 mt-3 min-h-0">
        <div className="px-4 pb-4 h-full">
          <Card className="h-full overflow-hidden p-0"><HealthView /></Card>
        </div>
      </TabsContent>
    </Tabs>
  )
}
