"use client"
/**
 * /agency/agents/[slug] — single-agent detail.
 *
 * Fetches the agent by slug from /api/agents, then renders:
 *   - Left rail: agent profile (avatar, name, status, description)
 *   - Main: skill .md system prompt editor (vault file edit)
 *   - Footer chips: link back to /agency/agents
 */
import * as React from "react"
import Link from "next/link"
import { notFound, useParams } from "next/navigation"
import useSWR from "swr"
import { ArrowLeft, Bot, MessageSquare, FileText, Loader2 } from "lucide-react"
import { FileEditor } from "@/components/memory-tree/file-editor"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { InboxBell } from "@/components/inbox/inbox-bell"

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
}

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

export default function AgentDetailPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug
  const { data, error, isLoading } = useSWR<{ data: Agent[] }>("/api/agents", fetcher)
  const agent = data?.data?.find((a) => a.slug === slug)

  if (!isLoading && !agent && !error) {
    notFound()
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] md:h-screen flex flex-col bg-background overflow-hidden -mt-16 md:-mt-6 -mx-4 md:-mx-6 -mb-20 md:-mb-6 pt-16 md:pt-0">
      <InboxBell floating />

      {/* Header */}
      <header className="flex items-center gap-3 px-3 sm:px-6 pt-3 sm:pt-4 pb-3 border-b border-border shrink-0">
        <Link
          href="/agency/agents"
          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Back to agents"
        >
          <ArrowLeft size={14} />
        </Link>
        <Bot className="w-5 h-5 text-mem-accent shrink-0" />
        <h1 className="text-[18px] sm:text-[22px] font-semibold tracking-[-0.01em] text-foreground leading-none truncate">
          {agent?.emoji ? `${agent.emoji} ` : ""}
          {agent?.name || (isLoading ? "Loading…" : slug || "Agent")}
        </h1>
        {agent?.is_orchestrator && (
          <span className="ml-2 inline-flex items-center h-6 px-2 rounded-full bg-mem-accent/15 border border-mem-accent/30 text-mem-accent text-[11px] font-mono">
            orchestrator
          </span>
        )}
        <div className="ml-auto" />
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[300px_1fr]">
        {/* Profile rail */}
        <aside className="border-b lg:border-b-0 lg:border-r border-border bg-mem-surface-1 p-4 overflow-y-auto">
          {isLoading ? (
            <div className="text-[12px] text-mem-text-muted">
              <Loader2 size={12} className="inline animate-spin mr-1.5" />
              Loading agent…
            </div>
          ) : agent ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-mem-surface-2 border border-mem-border grid place-items-center text-[22px]">
                  {agent.emoji || "🤖"}
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-mem-text-primary truncate">
                    {agent.name}
                  </p>
                  <p className="text-[11px] font-mono text-mem-text-muted truncate">{agent.slug}</p>
                </div>
              </div>
              {agent.description && (
                <p className="text-[12.5px] text-mem-text-secondary leading-[1.55]">
                  {agent.description}
                </p>
              )}
              <ul className="bg-mem-surface-2 border border-mem-border rounded-lg divide-y divide-mem-border/40 text-[12px]">
                <li className="px-3 py-2 flex items-center justify-between">
                  <span className="text-mem-text-muted">Model</span>
                  <span className="text-mem-text-primary font-mono text-[11px]">
                    {agent.model || "default"}
                  </span>
                </li>
                <li className="px-3 py-2 flex items-center justify-between">
                  <span className="text-mem-text-muted">Use count</span>
                  <span className="text-mem-text-primary font-mono text-[11px]">
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
              <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <Link href={`/agency/agents`}>
                    <FileText className="w-3.5 h-3.5 mr-1.5" />
                    Open logs
                  </Link>
                </Button>
                <Button asChild size="sm" className="flex-1 bg-mem-accent text-white hover:brightness-110">
                  <Link href={`/agency/agents`}>
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                    Send task
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-[12px] text-mem-text-muted">Agent not found.</div>
          )}
        </aside>

        {/* Skill editor (vault .md) */}
        <main className={cn("flex-1 min-h-0 bg-mem-bg")}>
          {agent?.file_path ? (
            <FileEditor key={agent.file_path} path={`/${agent.file_path}`} defaultTab="preview" />
          ) : (
            <div className="h-full grid place-items-center text-[12px] text-mem-text-muted px-6 text-center">
              {isLoading ? "Loading…" : "This agent doesn't have a skill file yet."}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
