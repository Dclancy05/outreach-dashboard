"use client"

// Static catalog of installable MCPs — shown in the AddServerDialog step 1.
//
// In v1 only GitHub is wireable end-to-end (OAuth flow). Vercel and Sentry are
// stubbed as "Coming soon" so the user can see what's planned without us
// shipping half-built integrations (principle 7: enterprise-quality everything).
//
// The catalog lives client-side because the entries are short, never change at
// runtime, and the page already re-renders on persona/cookie changes. If/when
// B1's /api/mcp/catalog endpoint lands we can swap to a SWR fetch.

import * as React from "react"
import { Check, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

export interface CatalogItem {
  slug: string
  name: string
  emoji: string
  /** Provider tag — kept loosely typed (string) to allow UI-only entries that
   * don't yet exist as real McpProvider values. */
  provider: string
  description: string
  /** When false, render the Coming-soon lock state. */
  available: boolean
  /** Optional hint shown under the description. */
  setupHint?: string
}

export const MCP_CATALOG: CatalogItem[] = [
  {
    slug: "github",
    name: "GitHub",
    emoji: "🐙",
    provider: "github",
    description: "Read repos, open PRs, file issues — let Jarvis ship code.",
    available: true,
    setupHint: "Connects via GitHub OAuth · 30 seconds",
  },
  {
    slug: "vercel",
    name: "Vercel",
    emoji: "▲",
    provider: "vercel",
    description: "Deploy previews, env vars, prod logs — all from chat.",
    available: false,
  },
  {
    slug: "sentry",
    name: "Sentry",
    emoji: "🛡️",
    provider: "sentry",
    description: "Pull error events + assign Jarvis to triage them.",
    available: false,
  },
]

interface McpCatalogProps {
  /** Slugs of servers the user already has installed (greyed out + checkmark). */
  installedSlugs?: string[]
  selectedSlug: string | null
  onSelect: (slug: string) => void
  className?: string
}

export function McpCatalog({
  installedSlugs = [],
  selectedSlug,
  onSelect,
  className,
}: McpCatalogProps) {
  return (
    <ul
      className={cn("space-y-2", className)}
      role="listbox"
      aria-label="MCP catalog"
      data-testid="mcp-catalog"
    >
      {MCP_CATALOG.map((item) => {
        const installed = installedSlugs.includes(item.slug)
        const selected = selectedSlug === item.slug
        const disabled = !item.available || installed
        return (
          <li key={item.slug}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              aria-disabled={disabled}
              disabled={disabled}
              onClick={() => onSelect(item.slug)}
              data-testid={`mcp-catalog-item-${item.slug}`}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mem-accent",
                selected && !disabled
                  ? "border-mem-accent bg-mem-accent/10"
                  : "border-mem-border bg-mem-surface-1 hover:border-mem-border-strong hover:bg-mem-surface-2",
                disabled && "cursor-not-allowed opacity-60 hover:bg-mem-surface-1"
              )}
            >
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mem-surface-2 text-lg"
              >
                {item.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-mem-text-primary">
                    {item.name}
                  </span>
                  {installed && (
                    <Badge variant="success" className="h-4 gap-1 px-1.5 text-[10px]">
                      <Check className="h-2.5 w-2.5" />
                      Installed
                    </Badge>
                  )}
                  {!item.available && !installed && (
                    <Badge
                      variant="outline"
                      className="h-4 gap-1 border-mem-border px-1.5 text-[10px] text-mem-text-muted"
                    >
                      <Lock className="h-2.5 w-2.5" />
                      Coming soon
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] text-mem-text-secondary">
                  {item.description}
                </p>
                {item.setupHint && item.available && (
                  <p className="mt-1 font-mono text-[10px] text-mem-text-muted">
                    {item.setupHint}
                  </p>
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
