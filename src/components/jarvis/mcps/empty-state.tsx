"use client"

// Empty state for the MCPs page — shown when GET /api/mcp/servers returns [].
// Per principle 5.6 ("clickable CTAs that DO something"), the primary CTA opens
// the AddServerDialog so the user can hop straight from "I have nothing" to
// "I'm connecting GitHub" in a single click.

import { Plug, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface McpsEmptyStateProps {
  onAdd: () => void
  /** Optional subtitle override (used by the Activity tab "no calls" state). */
  title?: string
  description?: string
  ctaLabel?: string
}

export function McpsEmptyState({
  onAdd,
  title = "No MCP servers yet",
  description = "Connect your first MCP to give Jarvis superpowers. Start with GitHub — it takes 30 seconds.",
  ctaLabel = "Add your first MCP",
}: McpsEmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-mem-border bg-mem-surface-1/50 px-6 py-16 text-center"
      data-testid="mcps-empty-state"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-mem-accent/10 text-mem-accent">
        <Plug className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="text-[16px] font-semibold text-mem-text-primary">
        {title}
      </h3>
      <p className="mt-1.5 max-w-sm text-[13px] text-mem-text-secondary">
        {description}
      </p>
      <Button
        type="button"
        onClick={onAdd}
        className="mt-5 h-9 bg-mem-accent text-white hover:brightness-110"
        data-testid="mcps-empty-add"
      >
        <Plus className="mr-1.5 h-4 w-4" />
        {ctaLabel}
      </Button>
    </div>
  )
}
