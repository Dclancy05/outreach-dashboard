"use client"

/**
 * Agent Workflows — the 5-subtab container that lives inside the
 * "Agent Workflows" top-level tab on /agency/memory.
 *
 * Subtab state syncs to the URL hash as `#agent-workflows/<sub>`. The parent
 * page handles the top-level routing; this component owns the second segment.
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

function readSubFromHash(): AgentSubTab {
  if (typeof window === "undefined") return "agents"
  const h = window.location.hash.replace(/^#/, "")
  const seg = h.split("/")[1] as AgentSubTab | undefined
  return seg && VALID.includes(seg) ? seg : "agents"
}

export function AgentWorkflowsTabs() {
  const [sub, setSubRaw] = useState<AgentSubTab>("agents")

  useEffect(() => {
    setSubRaw(readSubFromHash())
    const onHash = () => setSubRaw(readSubFromHash())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const setSub = (next: AgentSubTab) => {
    setSubRaw(next)
    if (typeof window !== "undefined") {
      const newUrl = `${window.location.pathname}${window.location.search}#agent-workflows/${next}`
      window.history.replaceState(null, "", newUrl)
    }
  }

  return (
    <Tabs value={sub} onValueChange={(v) => setSub(v as AgentSubTab)} className="flex-1 flex flex-col min-h-0">
      <TabsList className="mx-4 mt-2 self-start">
        <TabsTrigger value="agents" className="gap-2">
          <Bot className="w-4 h-4" /> Agents
        </TabsTrigger>
        <TabsTrigger value="workflows" className="gap-2">
          <Workflow className="w-4 h-4" /> Workflows
        </TabsTrigger>
        <TabsTrigger value="schedules" className="gap-2">
          <CalendarClock className="w-4 h-4" /> Schedules
        </TabsTrigger>
        <TabsTrigger value="runs" className="gap-2">
          <Activity className="w-4 h-4" /> Runs
        </TabsTrigger>
        <TabsTrigger value="health" className="gap-2">
          <HeartPulse className="w-4 h-4" /> Health
        </TabsTrigger>
      </TabsList>

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
