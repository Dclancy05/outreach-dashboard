"use client"

/**
 * AgentDetailShell — 2-pane layout for /jarvis/agents/[slug].
 *
 *   ┌─────────────────────┬───────────────────────────────────────────┐
 *   │  Left rail (320px)  │  Main canvas                              │
 *   │  - avatar           │  ┌── frontmatter pills ─────────────────┐ │
 *   │  - name + slug      │  └──────────────────────────────────────┘ │
 *   │  - status pill      │  ┌── Edit / Preview swap ───────────────┐ │
 *   │  - capabilities     │  │                                      │ │
 *   │  - model line       │  │      <AgentMdEditor />               │ │
 *   │  - parent link      │  │                                      │ │
 *   │  - last 3 events    │  └──────────────────────────────────────┘ │
 *   └─────────────────────┴───────────────────────────────────────────┘
 *
 * Frontmatter pills + editor are wired together through the `parsed` state:
 * editor parses the file on load, hands the result to this shell, which
 * re-renders the pills. (BUG-014, BUG-015 are both fixed by the children.)
 */

import * as React from "react"
import Link from "next/link"
import useSWR from "swr"
import { ArrowLeft, MessageSquare, FileText, Activity } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  AgentFrontmatterStrip,
  parseAgentMd,
  type AgentFrontmatter,
  type ParsedAgentMd,
} from "./agent-frontmatter-strip"
import { AgentMdEditor } from "./agent-md-editor"

interface Agent {
  id: string
  slug: string
  name: string
  emoji: string | null
  description: string | null
  file_path: string | null
  archived: boolean
  model?: string | null
  is_orchestrator?: boolean | null
  use_count?: number | null
  parent_agent_id?: string | null
  persona_id?: string | null
  tools?: string[] | null
}

interface RunRow {
  id: string
  workflow_id: string
  status: string
  started_at: string | null
  finished_at: string | null
  workflow_name?: string
  workflow_emoji?: string | null
}

interface AgentDetailShellProps {
  agent: Agent
  /** All agents from /api/agents — used to resolve parent_agent_id → name/slug. */
  allAgents: Agent[]
  className?: string
}

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

/** Initials from a name, e.g. "Outreach Tester" → "OT". */
function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("") || "?"
  )
}

/** Map a frontmatter color string → an inline accent color. Stays inside
 * Tailwind's color palette so it always looks intentional. */
function colorToHex(color: string | undefined): string {
  if (!color) return "#7C5CFF" // mem-accent
  const lower = color.toLowerCase()
  const map: Record<string, string> = {
    cyan: "#22D3EE",
    blue: "#60A5FA",
    indigo: "#818CF8",
    purple: "#A78BFA",
    violet: "#7C5CFF",
    pink: "#F472B6",
    red: "#F87171",
    orange: "#FB923C",
    amber: "#FBBF24",
    yellow: "#FACC15",
    green: "#4ADE80",
    emerald: "#34D399",
    teal: "#2DD4BF",
    gray: "#9CA3AF",
    grey: "#9CA3AF",
  }
  return map[lower] || "#7C5CFF"
}

export function AgentDetailShell({ agent, allAgents, className }: AgentDetailShellProps) {
  const [parsed, setParsed] = React.useState<ParsedAgentMd | null>(null)

  // Pull the most recent runs to surface a brief activity stub. /api/runs
  // doesn't filter by agent today (it's workflow-keyed), so we just show the
  // last 3 system-wide runs as a "recent activity" fallback. Once a run row
  // can be filtered by agent we'll plumb agent_id through.
  const { data: runsData } = useSWR<{ data: RunRow[] }>("/api/runs?limit=3", fetcher, {
    refreshInterval: 30_000,
  })
  const runs = runsData?.data ?? []

  const frontmatter: AgentFrontmatter = parsed?.frontmatter ?? {
    model: agent.model || undefined,
    tools: agent.tools || undefined,
    is_orchestrator: agent.is_orchestrator || undefined,
  }

  const accent = colorToHex(typeof frontmatter.color === "string" ? frontmatter.color : undefined)
  const parent = agent.parent_agent_id
    ? allAgents.find((a) => a.id === agent.parent_agent_id)
    : null
  const tools = (frontmatter.tools && frontmatter.tools.length > 0
    ? frontmatter.tools
    : agent.tools || [])

  return (
    <div
      className={cn(
        "flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px_1fr] bg-mem-bg",
        className
      )}
    >
      {/* Left rail */}
      <aside className="border-b lg:border-b-0 lg:border-r border-mem-border bg-mem-surface-1 p-5 overflow-y-auto">
        <Link
          href="/jarvis/agents"
          className="inline-flex items-center gap-1.5 text-[11.5px] text-mem-text-muted hover:text-mem-text-primary transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All agents
        </Link>

        <div className="flex items-center gap-3">
          <div
            className="h-14 w-14 rounded-2xl border border-mem-border grid place-items-center text-[18px] font-semibold shrink-0"
            style={{ background: `${accent}1A`, color: accent, borderColor: `${accent}40` }}
            aria-hidden
          >
            {agent.emoji ? (
              <span className="text-[22px]">{agent.emoji}</span>
            ) : (
              <span>{initials(agent.name)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-mem-text-primary truncate leading-tight">
              {agent.name}
            </p>
            <p className="text-[11px] font-mono text-mem-text-muted truncate mt-0.5">
              {agent.slug}
            </p>
          </div>
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          <span
            className={cn(
              "inline-flex items-center h-6 px-2 rounded-full text-[10.5px] font-mono",
              agent.archived
                ? "bg-mem-surface-2 border border-mem-border text-mem-text-muted"
                : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
            )}
          >
            {agent.archived ? "archived" : "active"}
          </span>
          {agent.is_orchestrator && (
            <span className="inline-flex items-center h-6 px-2 rounded-full bg-mem-accent/15 border border-mem-accent/30 text-mem-accent text-[10.5px] font-mono">
              orchestrator
            </span>
          )}
        </div>

        {agent.description && (
          <p className="text-[12.5px] text-mem-text-secondary leading-[1.55] mt-4">
            {agent.description}
          </p>
        )}

        {/* Capabilities chips */}
        {tools.length > 0 && (
          <div className="mt-5">
            <p className="text-[10.5px] uppercase tracking-wider text-mem-text-muted font-medium mb-2">
              Capabilities
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tools.map((tool) => (
                <span
                  key={tool}
                  className="inline-flex items-center h-6 px-2 rounded-md bg-mem-surface-2 border border-mem-border text-mem-text-secondary text-[10.5px] font-mono"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Metadata list */}
        <ul className="mt-5 bg-mem-surface-2 border border-mem-border rounded-lg divide-y divide-mem-border/50 text-[11.5px]">
          <li className="px-3 py-2 flex items-center justify-between">
            <span className="text-mem-text-muted">Model</span>
            <span className="text-mem-text-primary font-mono text-[10.5px]">
              {(typeof frontmatter.model === "string" && frontmatter.model) ||
                agent.model ||
                "default"}
            </span>
          </li>
          {parent && (
            <li className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-mem-text-muted shrink-0">Parent</span>
              <Link
                href={`/jarvis/agents/${parent.slug}`}
                className="text-mem-accent hover:underline truncate text-[10.5px] font-mono"
              >
                {parent.slug}
              </Link>
            </li>
          )}
          <li className="px-3 py-2 flex items-center justify-between">
            <span className="text-mem-text-muted">Use count</span>
            <span className="text-mem-text-primary font-mono text-[10.5px]">
              {agent.use_count ?? 0}
            </span>
          </li>
          {agent.file_path && (
            <li className="px-3 py-2 flex items-start justify-between gap-2">
              <span className="text-mem-text-muted shrink-0">File</span>
              <span className="text-mem-text-primary font-mono text-[10px] text-right break-all">
                {agent.file_path}
              </span>
            </li>
          )}
        </ul>

        {/* Activity stub */}
        <div className="mt-5">
          <p className="text-[10.5px] uppercase tracking-wider text-mem-text-muted font-medium mb-2 flex items-center gap-1.5">
            <Activity className="w-3 h-3" /> Recent activity
          </p>
          {runs.length === 0 ? (
            <p className="text-[11.5px] text-mem-text-muted italic">
              No recent runs to show.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {runs.map((run) => (
                <li
                  key={run.id}
                  className="flex items-center gap-2 text-[11px] px-2 py-1.5 rounded-md bg-mem-surface-2 border border-mem-border"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      run.status === "completed" && "bg-emerald-400",
                      run.status === "failed" && "bg-red-400",
                      run.status === "running" && "bg-blue-400",
                      run.status === "queued" && "bg-amber-400",
                      !["completed", "failed", "running", "queued"].includes(run.status) && "bg-mem-text-muted"
                    )}
                  />
                  <span className="truncate text-mem-text-primary">
                    {run.workflow_emoji ? `${run.workflow_emoji} ` : ""}
                    {run.workflow_name || "workflow"}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-mem-text-muted shrink-0">
                    {run.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-5">
          <Button asChild size="sm" variant="outline" className="flex-1 h-8 text-[11.5px]">
            <Link href={`/jarvis/agents?tab=runs`}>
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Logs
            </Link>
          </Button>
          <Button asChild size="sm" className="flex-1 h-8 text-[11.5px] bg-mem-accent text-white hover:brightness-110">
            <Link href={`/jarvis/agents?tab=workflows`}>
              <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
              Send task
            </Link>
          </Button>
        </div>
      </aside>

      {/* Main canvas: frontmatter strip + editor */}
      <main className="flex flex-col min-h-0">
        <AgentFrontmatterStrip fm={frontmatter} />
        {agent.file_path ? (
          <AgentMdEditor
            key={agent.file_path}
            filePath={agent.file_path}
            initialMode="preview"
            onParsed={setParsed}
          />
        ) : (
          <div className="flex-1 grid place-items-center text-[12px] text-mem-text-muted px-6 text-center">
            This agent doesn&apos;t have a skill file yet.
          </div>
        )}
      </main>
    </div>
  )
}
