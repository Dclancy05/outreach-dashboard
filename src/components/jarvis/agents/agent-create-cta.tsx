"use client"

/**
 * AgentCreateCTA — themed "Agent not found" card shown when /jarvis/agents/[slug]
 * resolves a slug that doesn't exist in /api/agents.
 *
 * BUG-001 / BUG-002 fix: previously the [slug] route called notFound() which
 * triggered Next.js's default white 404 page (broken theme). This component
 * renders inside the Jarvis chrome instead, so the user stays in the dark
 * design system and gets a clear next action.
 *
 * The "Create" button is a stub for now — the create flow lives behind the
 * "+ New agent" button on the parent /jarvis/agents page. We point users back
 * there rather than building a duplicate inline create form.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, Bot, Sparkles, FileQuestion } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AgentCreateCTAProps {
  /** The slug the user navigated to (which doesn't exist on disk). */
  slug: string
  className?: string
}

/** Capitalize each dash-segment for a friendly display name. */
function prettifySlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ")
}

export function AgentCreateCTA({ slug, className }: AgentCreateCTAProps) {
  const niceName = prettifySlug(slug) || "agent"

  return (
    <div
      className={cn(
        "flex-1 min-h-0 grid place-items-center bg-mem-bg p-6 sm:p-10",
        className
      )}
      data-testid="agent-create-cta"
    >
      <div className="w-full max-w-md text-center space-y-5">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-mem-surface-2 border border-mem-border grid place-items-center text-mem-text-muted">
          <FileQuestion className="w-6 h-6" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-[18px] font-semibold text-mem-text-primary tracking-[-0.01em]">
            Agent not found
          </h2>
          <p className="text-[13px] text-mem-text-secondary leading-relaxed">
            We couldn&apos;t find an agent named{" "}
            <code className="px-1.5 py-0.5 rounded bg-mem-surface-2 border border-mem-border text-mem-text-primary text-[11.5px] font-mono">
              {slug}
            </code>
            . You can create one with that slug, or head back to the agents list.
          </p>
        </div>

        {/* Create card */}
        <div className="rounded-xl border border-mem-border bg-mem-surface-1 p-4 text-left">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-mem-accent/10 border border-mem-accent/20 grid place-items-center text-mem-accent shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-mem-text-primary">
                Create &ldquo;{niceName}&rdquo;
              </p>
              <p className="text-[11.5px] text-mem-text-muted mt-0.5">
                Slug: <span className="font-mono">{slug}</span>
              </p>
            </div>
          </div>
          <Button
            disabled
            className="mt-3 w-full h-9 bg-mem-surface-2 text-mem-text-muted hover:bg-mem-surface-2 hover:text-mem-text-muted cursor-not-allowed border border-mem-border"
            title="The create-agent flow lives on the agents list page"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Coming soon
          </Button>
          <p className="text-[10.5px] text-mem-text-muted mt-2 text-center">
            For now, use the &ldquo;+ New agent&rdquo; button on the agents list.
          </p>
        </div>

        <Button asChild variant="ghost" size="sm" className="text-mem-text-secondary hover:text-mem-text-primary">
          <Link href="/jarvis/agents">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Back to all agents
          </Link>
        </Button>
      </div>
    </div>
  )
}
