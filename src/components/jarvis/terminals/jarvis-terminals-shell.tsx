"use client"

/**
 * Jarvis-chromed wrapper around <TerminalsWorkspace>.
 *
 * The actual workspace component is reused 1:1 from /agency/terminals — we
 * just frame it inside the Jarvis canvas (centered, max-width 1280, 32px
 * gutter from the shell sidebar) and add a Jarvis-styled header with the
 * page title and live session count fetched from /api/terminals.
 *
 * We deliberately do NOT render a JarvisSegmentedControl here — Terminals is
 * a top-level sidebar item in the Jarvis shell, not a sibling of
 * Memory/Agents/Runs.
 */
import { useEffect, useState } from "react"
import { TerminalSquare, Plus, Loader2 } from "lucide-react"
import { TerminalsWorkspace } from "@/components/terminals/terminals-workspace"

interface SessionCountResponse {
  sessions?: Array<{ id: string }>
  capacity?: { active: number; soft_max: number }
}

export function JarvisTerminalsShell() {
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [softMax, setSoftMax] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // Header is purely informational — TerminalsWorkspace also fetches /api/terminals
  // for its own state. Keeping these as two independent fetches is cheaper than
  // hoisting state since the workspace already polls every 15s and re-renders.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/terminals", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as SessionCountResponse
        if (cancelled) return
        const count = data.capacity?.active ?? data.sessions?.length ?? 0
        setActiveCount(count)
        if (data.capacity?.soft_max !== undefined) setSoftMax(data.capacity.soft_max)
      } catch {
        // Header fallback — leave as null, workspace surfaces real errors.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 15_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // The "+ New session" button is a UX-friendly affordance at the page level;
  // it just clicks the workspace's own "New terminal" button via a synthetic
  // event so we don't duplicate the spawn logic. We find the button by its
  // accessible name within the workspace root.
  const spawnFromHeader = () => {
    const root = document.getElementById("jarvis-terminals-workspace-root")
    if (!root) return
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"))
    const target = buttons.find(
      (b) => b.textContent?.trim().toLowerCase().startsWith("new terminal") ||
        b.textContent?.trim().toLowerCase().startsWith("start your first terminal"),
    )
    target?.click()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Jarvis page header: 32px gutter, max-width 1280 */}
      <header className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-8 pt-8 pb-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-mem-border bg-mem-surface-2">
            <TerminalSquare className="h-5 w-5 text-mem-accent" />
          </div>
          <div className="min-w-0">
            <h1
              className="truncate text-[28px] font-semibold leading-tight tracking-tight text-mem-text-primary"
              style={{ fontFamily: "'Inter Display', Inter, ui-sans-serif, system-ui, sans-serif" }}
            >
              Terminals
            </h1>
            <p className="mt-0.5 text-xs text-mem-text-secondary">
              Parallel claudes on the VPS — survive your laptop close.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <SessionCountChip loading={loading} active={activeCount} softMax={softMax} />
          <button
            type="button"
            onClick={spawnFromHeader}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-mem-border bg-mem-accent/15 px-3.5 text-xs font-medium text-mem-text-primary transition-colors hover:bg-mem-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mem-accent/60"
            aria-label="Start a new terminal session"
          >
            <Plus className="h-3.5 w-3.5" />
            New session
          </button>
        </div>
      </header>

      {/* Workspace canvas. Same 1280 max + 32px gutter as the header so the
          terminal grid lines up with the title row visually. */}
      <div className="mx-auto w-full max-w-[1280px] flex-1 min-h-0 px-8 pb-8">
        <div
          id="jarvis-terminals-workspace-root"
          className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-mem-border bg-mem-surface-1 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_24px_48px_-24px_rgba(0,0,0,0.6)]"
        >
          <TerminalsWorkspace />
        </div>
      </div>
    </div>
  )
}

function SessionCountChip({
  loading,
  active,
  softMax,
}: {
  loading: boolean
  active: number | null
  softMax: number | null
}) {
  if (loading && active === null) {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-mem-border bg-mem-surface-2 px-3 text-[11px] text-mem-text-muted">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading sessions
      </span>
    )
  }

  if (active === null) return null

  const hasCapacity = softMax !== null && softMax > 0

  return (
    <span
      className="inline-flex h-9 items-center gap-2 rounded-full border border-mem-border bg-mem-surface-2 px-3 text-[11px] text-mem-text-secondary"
      aria-live="polite"
      title={hasCapacity ? `${active} active of ${softMax} soft cap (VPS RAM-aware)` : `${active} active sessions`}
    >
      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
      <span className="font-mono text-mem-text-primary">{active}</span>
      <span>active</span>
      {hasCapacity && (
        <span className="text-mem-text-muted">
          / {softMax}
        </span>
      )}
    </span>
  )
}
