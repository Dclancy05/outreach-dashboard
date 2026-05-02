"use client"

/**
 * /jarvis/agents/[slug] — single-agent detail (W3C).
 *
 * BUG-001 / BUG-002 fix: this page NEVER calls notFound(). When the slug
 * doesn't resolve to a known agent, we render a themed "Agent not found"
 * card inside the Jarvis chrome (AgentCreateCTA), so the user stays on the
 * dark design system instead of hitting Next.js's default white 404.
 *
 * The "known slugs" list comes from /api/agents — currently the prototype
 * only has these on disk in /Jarvis/agent-skills/:
 *   __summarizer__, echo-test, jarvis-quick-ask, outreach-builder,
 *   outreach-domain, outreach-tester, outreach-triage
 * Anything else (the prototype's mock referenced builder/tester/reviewer/etc.)
 * falls through to the create CTA cleanly instead of crashing.
 */

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import useSWR from "swr"
import { ArrowLeft, Bot, Loader2 } from "lucide-react"
import { AgentDetailShell } from "@/components/jarvis/agents/agent-detail-shell"
import { AgentCreateCTA } from "@/components/jarvis/agents/agent-create-cta"

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

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json() as Promise<{ data: Agent[] }>
  })

export default function JarvisAgentDetailPage() {
  const params = useParams<{ slug: string }>()
  const slug = (params?.slug as string) ?? ""
  const { data, error, isLoading } = useSWR<{ data: Agent[] }>(
    "/api/agents?include_archived=true",
    fetcher
  )

  const agents = data?.data ?? []
  const agent = agents.find((a) => a.slug === slug)

  return (
    <div className="flex flex-col h-full min-h-0 bg-mem-bg">
      {/* Header — slim, mirrors /jarvis/agents */}
      <header className="flex items-center gap-3 px-4 sm:px-6 pt-4 pb-3 border-b border-mem-border shrink-0">
        <Link
          href="/jarvis/agents"
          className="h-8 w-8 grid place-items-center rounded-md text-mem-text-muted hover:text-mem-text-primary hover:bg-mem-surface-2 transition-colors"
          aria-label="Back to agents"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <Bot className="w-5 h-5 text-mem-accent shrink-0" />
        <h1 className="text-[18px] sm:text-[22px] font-semibold tracking-[-0.01em] text-mem-text-primary leading-none truncate">
          {agent?.emoji ? `${agent.emoji} ` : ""}
          {agent?.name || (isLoading ? "Loading…" : slug)}
        </h1>
        {agent?.is_orchestrator && (
          <span className="ml-2 inline-flex items-center h-6 px-2 rounded-full bg-mem-accent/15 border border-mem-accent/30 text-mem-accent text-[10.5px] font-mono">
            orchestrator
          </span>
        )}
      </header>

      {/* Body — three states: loading / not found / found */}
      {isLoading ? (
        <div className="flex-1 grid place-items-center text-[12px] text-mem-text-muted">
          <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
          Loading agent…
        </div>
      ) : error ? (
        // /api/agents itself failed — still themed, not a hard 404.
        <div className="flex-1 grid place-items-center px-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-[14px] font-medium text-red-400">Couldn&apos;t reach the agents API</p>
            <p className="text-[12px] text-mem-text-muted">{(error as Error).message}</p>
            <Link
              href="/jarvis/agents"
              className="inline-flex items-center text-[12px] text-mem-accent hover:underline mt-2"
            >
              Back to all agents
            </Link>
          </div>
        </div>
      ) : agent ? (
        <AgentDetailShell agent={agent} allAgents={agents} />
      ) : (
        // BUG-001/002 fix: themed CTA, NOT notFound() / white 404.
        <AgentCreateCTA slug={slug} />
      )}
    </div>
  )
}
