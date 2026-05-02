"use client"
/**
 * /agency/agents — was /agency/memory#agent-workflows.
 *
 * Renders the existing 5-subtab AgentWorkflowsTabs (Agents · Workflows ·
 * Schedules · Runs · Health). Header matches /agency/memory styling so the
 * two pages feel like siblings.
 */
import { Bot, Settings as SettingsIcon, TerminalSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AgentWorkflowsTabs } from "@/components/agent-workflows/agent-workflows-tabs"
import { useTerminalsDrawer } from "@/components/terminals/terminals-drawer-provider"
import { InboxBell } from "@/components/inbox/inbox-bell"
import Link from "next/link"

export default function AgencyAgentsPage() {
  const { open: openTerminals } = useTerminalsDrawer()

  return (
    <div className="h-[calc(100vh-3.5rem)] md:h-screen flex flex-col bg-background overflow-hidden -mt-16 md:-mt-6 -mx-4 md:-mx-6 -mb-20 md:-mb-6 pt-16 md:pt-0">
      <InboxBell floating />

      {/* Header — mirrors /agency/memory */}
      <header className="flex items-center justify-between gap-3 px-3 sm:px-6 pt-3 sm:pt-4 pb-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="w-5 h-5 text-mem-accent shrink-0" />
          <h1 className="text-[18px] sm:text-[22px] font-semibold tracking-[-0.01em] text-foreground leading-none truncate">
            Agents
          </h1>
          <span className="hidden md:inline text-[12px] text-muted-foreground">
            — multi-agent system: workflows, schedules, runs, health
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href="/agency/memory"
            className="hidden sm:inline-flex items-center h-8 px-3 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            ← Memory
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={openTerminals}
            className="text-muted-foreground hover:text-mem-accent hover:bg-mem-accent/10 h-8 w-8 p-0"
            title="Open Terminals"
          >
            <TerminalSquare className="w-4 h-4" />
          </Button>
          <InboxBell />
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
            title="Settings"
            asChild
          >
            <Link href="/agency/memory">
              <SettingsIcon className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Tabs — already 5 subtabs (Agents/Workflows/Schedules/Runs/Health) */}
      <div className="flex-1 min-h-0 flex flex-col">
        <AgentWorkflowsTabs />
      </div>
    </div>
  )
}
