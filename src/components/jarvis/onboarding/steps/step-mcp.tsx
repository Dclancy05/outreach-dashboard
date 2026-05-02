"use client"

// Step 3 — Connect first MCP.
// Mini preview of /jarvis/mcps with a featured "Install GitHub" CTA. We
// don't actually start the OAuth flow inside the modal (that would close
// it on redirect). Instead we open the start endpoint in a new tab so the
// user keeps their place in the wizard.
//
// The "Connect later" button just advances to the next step.

import { useState } from "react"
import { Github, ArrowUpRight, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface StepMcpProps {
  onNext: () => void
}

interface CatalogPreview {
  id: string
  name: string
  description: string
  status: "available" | "soon"
}

const PREVIEW_CATALOG: ReadonlyArray<CatalogPreview> = [
  {
    id: "github",
    name: "GitHub",
    description: "Read & write issues, PRs, and repo files.",
    status: "available",
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Query your project DB, manage tables.",
    status: "soon",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Post messages, read channels.",
    status: "soon",
  },
]

export function StepMcp({ onNext }: StepMcpProps): JSX.Element {
  const [opening, setOpening] = useState<boolean>(false)

  function handleConnect(): void {
    setOpening(true)
    try {
      window.open("/api/mcp/oauth/github/start", "_blank", "noopener,noreferrer")
    } catch {
      /* ignore */
    }
    // Re-enable button shortly so user can retry if popup was blocked.
    window.setTimeout(() => setOpening(false), 1200)
  }

  return (
    <div className="flex flex-col">
      <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
        Connect your first MCP
      </h2>
      <p className="mt-2 max-w-lg text-sm text-mem-text-muted">
        MCPs are the tools your AI can use. Start with GitHub — read and write
        issues, PRs, and repo files in one click.
      </p>

      {/* Featured GitHub card */}
      <div className="mt-6 rounded-xl border border-mem-border bg-gradient-to-br from-mem-surface-2 to-mem-surface-3 p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-mem-bg">
            <Github className="h-6 w-6 text-mem-text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-mem-text-primary">
                GitHub
              </h3>
              <span className="rounded-full bg-mem-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-mem-accent">
                Recommended
              </span>
            </div>
            <p className="mt-1 text-xs text-mem-text-muted">
              OAuth-based. Read & write issues, PRs, and repo contents. Takes
              about 20 seconds.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                size="sm"
                onClick={handleConnect}
                disabled={opening}
                className="bg-mem-accent text-white hover:bg-mem-accent/90"
              >
                <Github className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {opening ? "Opening…" : "Install GitHub"}
                <ExternalLink className="ml-1.5 h-3 w-3" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onNext}
                className="text-mem-text-muted"
              >
                Connect later
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tiny catalog preview — read-only teaser */}
      <div className="mt-5 rounded-xl border border-mem-border bg-mem-surface-2 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-mem-text-muted">
            More MCPs
          </span>
          <a
            href="/jarvis/mcps"
            className="inline-flex items-center gap-1 text-xs text-mem-accent hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-mem-accent"
          >
            Browse all
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {PREVIEW_CATALOG.map((c) => (
            <li
              key={c.id}
              className={cn(
                "rounded-lg border border-mem-border bg-mem-bg px-3 py-2 text-left",
                c.status === "soon" ? "opacity-60" : "",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-mem-text-primary">
                  {c.name}
                </span>
                {c.status === "soon" ? (
                  <span className="text-[9px] uppercase tracking-wider text-mem-text-muted">
                    Soon
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-mem-text-muted">
                {c.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
