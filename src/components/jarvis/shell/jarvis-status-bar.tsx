"use client"

// 24px-tall bottom status bar — the "premium tell" of the Jarvis shell.
// Six segments, each clickable, separated by `·` in zinc-500 11px Geist Mono.
//   ● claude-opus-4-7  ·  Dylan  ·  1840/4000 tok  ·  MCP ✓  ·  2 runs    v0.4.1
//
// Reads model from localStorage.jarvis.model (default "claude-opus-4-7"),
// persona + tokens + version from contexts. MCP and active-runs counts are
// fetched lazily; failures degrade silently to ✗ / 0.

import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import {
  usePersona,
  useTokenBudget,
  useJarvisVersion,
} from "@/components/jarvis/shell/jarvis-shell-providers"
import { cn } from "@/lib/utils"

const MODEL_KEY = "jarvis.model"
const DEFAULT_MODEL = "claude-opus-4-7"

interface MetricsState {
  mcpOk: boolean | null // null = unknown / loading
  activeRuns: number
}

export function JarvisStatusBar() {
  const { persona } = usePersona()
  const { used, total } = useTokenBudget()
  const { version, sha } = useJarvisVersion()
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const [metrics, setMetrics] = useState<MetricsState>({
    mcpOk: null,
    activeRuns: 0,
  })

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MODEL_KEY)
      if (stored) setModel(stored)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadMcp() {
      try {
        const res = await fetch("/api/mcp/servers", { cache: "no-store" })
        if (!res.ok) throw new Error(`mcp ${res.status}`)
        const data = (await res.json()) as { servers?: unknown[] }
        if (!cancelled) {
          setMetrics((m) => ({
            ...m,
            mcpOk: Array.isArray(data.servers) && data.servers.length > 0,
          }))
        }
      } catch {
        if (!cancelled) setMetrics((m) => ({ ...m, mcpOk: false }))
      }
    }

    async function loadRuns() {
      try {
        const res = await fetch("/api/runs?status=running&limit=50", {
          cache: "no-store",
        })
        if (!res.ok) throw new Error(`runs ${res.status}`)
        const data = (await res.json()) as { runs?: unknown[] }
        if (!cancelled) {
          setMetrics((m) => ({
            ...m,
            activeRuns: Array.isArray(data.runs) ? data.runs.length : 0,
          }))
        }
      } catch {
        if (!cancelled) setMetrics((m) => ({ ...m, activeRuns: 0 }))
      }
    }

    void loadMcp()
    void loadRuns()
    return () => {
      cancelled = true
    }
  }, [])

  const personaLabel = persona?.name ?? "No persona"
  const tokensLabel = `${formatTokens(used)}/${formatTokens(total)} tok`
  const mcpLabel =
    metrics.mcpOk === null ? "MCP …" : metrics.mcpOk ? "MCP ✓" : "MCP ✗"
  const runsLabel = `${metrics.activeRuns} run${metrics.activeRuns === 1 ? "" : "s"}`

  return (
    <footer
      role="contentinfo"
      aria-label="Jarvis status"
      className="sticky bottom-0 z-30 flex h-6 items-center gap-0 border-t border-mem-border bg-mem-surface-1/90 px-3 backdrop-blur-sm"
    >
      <div className="flex flex-1 min-w-0 items-center gap-0 overflow-x-auto whitespace-nowrap">
        <StatusSegment
          href="/jarvis/settings#model"
          ariaLabel={`Model ${model}. Click to change.`}
          first
        >
          <span
            aria-hidden
            className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-mem-status-working"
          />
          {model}
        </StatusSegment>
        <Separator />
        <StatusSegment
          href="#persona"
          ariaLabel={`Persona ${personaLabel}. Click to switch.`}
          onClick={(e) => {
            // Persona popover lives on the sidebar. Scroll-anchor for now;
            // W4A may bind a real popover toggle here.
            e.preventDefault()
          }}
        >
          {personaLabel}
        </StatusSegment>
        <Separator />
        <StatusSegment
          href="/jarvis/settings#budget"
          ariaLabel={`Token budget ${used} of ${total}. Click for details.`}
        >
          {tokensLabel}
        </StatusSegment>
        <Separator />
        <StatusSegment
          href="/jarvis/mcps"
          ariaLabel={`MCP status ${mcpLabel}. Click to open MCPs.`}
        >
          <span
            className={cn(
              metrics.mcpOk === false && "text-mem-status-stuck",
              metrics.mcpOk === true && "text-mem-status-working"
            )}
          >
            {mcpLabel}
          </span>
        </StatusSegment>
        <Separator />
        <StatusSegment
          href="/jarvis/agents?tab=runs"
          ariaLabel={`${runsLabel} active. Click to see runs.`}
        >
          {runsLabel}
        </StatusSegment>
      </div>

      {/* Right-aligned: version pill */}
      <Link
        href="/jarvis/settings#about"
        aria-label={`Version ${version}, build ${sha}`}
        className="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] text-zinc-500 transition-colors hover:text-mem-text-primary"
      >
        v{version}
        <ChevronRight className="h-3 w-3 opacity-60" />
      </Link>
    </footer>
  )
}

/* -------------------------------------------------------------------------- */

interface StatusSegmentProps {
  href: string
  ariaLabel: string
  children: React.ReactNode
  first?: boolean
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
}

function StatusSegment({
  href,
  ariaLabel,
  children,
  first,
  onClick,
}: StatusSegmentProps) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "inline-flex items-center px-1.5 font-mono text-[11px] text-zinc-500 transition-colors hover:text-mem-text-primary focus:outline-none focus-visible:text-mem-text-primary",
        first && "pl-0"
      )}
    >
      {children}
    </Link>
  )
}

function Separator() {
  return (
    <span aria-hidden className="select-none px-0.5 font-mono text-[11px] text-zinc-700">
      ·
    </span>
  )
}

function formatTokens(n: number): string {
  if (n < 10_000) return n.toString()
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`
}
