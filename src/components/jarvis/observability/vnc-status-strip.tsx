"use client"

/**
 * Bottom status strip for the VNC viewer.
 *
 * Shows a single line:
 *   [pulse-dot] connected · 1920×1080 · 58 fps · 28 ms ping
 *
 * Falls back gracefully when stats aren't available (shows "—" placeholder).
 * The pulse dot color tracks connection state. When prefers-reduced-motion is
 * set the pulse animation is disabled (CSS handles via `motion-reduce:`).
 */

import { cn } from "@/lib/utils"
import type {
  VncConnectionState,
  VncStats,
} from "@/components/jarvis/observability/vnc-viewer"

interface VncStatusStripProps {
  state: VncConnectionState
  stats: VncStats
  /** Resolved WS URL (so we can show the host being connected to). */
  wsUrl: string | null
  className?: string
}

const STATE_LABELS: Record<VncConnectionState, string> = {
  idle: "Disconnected",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  error: "Error",
}

const STATE_COLORS: Record<VncConnectionState, string> = {
  idle: "bg-mem-text-muted",
  connecting: "bg-mem-status-thinking",
  connected: "bg-mem-status-working",
  reconnecting: "bg-mem-status-thinking",
  error: "bg-mem-status-stuck",
}

export function VncStatusStrip({
  state,
  stats,
  wsUrl,
  className,
}: VncStatusStripProps) {
  const host = wsUrl ? safeHost(wsUrl) : null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-3 rounded-md border border-mem-border bg-mem-surface-1 px-3 py-2 font-mono text-[11px] text-mem-text-secondary",
        "overflow-x-auto whitespace-nowrap",
        className
      )}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "relative flex h-2 w-2 items-center justify-center rounded-full",
            STATE_COLORS[state]
          )}
        >
          {state === "connected" && (
            <span className="absolute inset-0 animate-ping rounded-full bg-mem-status-working/40 motion-reduce:hidden" />
          )}
        </span>
        <span className="text-mem-text-primary">{STATE_LABELS[state]}</span>
      </span>

      <Sep />

      <Field label="host">{host ?? "—"}</Field>
      <Sep />
      <Field label="resolution">{stats.resolution ?? "—"}</Field>
      <Sep />
      <Field label="fps">{stats.fps ? `${stats.fps}` : "—"}</Field>
      <Sep />
      <Field label="ping">
        {stats.ping !== null ? `${stats.ping} ms` : "—"}
      </Field>
      {stats.desktopName ? (
        <>
          <Sep />
          <Field label="desktop">{stats.desktopName}</Field>
        </>
      ) : null}
    </div>
  )
}

function Sep() {
  return (
    <span aria-hidden className="text-mem-text-muted/50">
      ·
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="uppercase tracking-[0.14em] text-mem-text-muted">
        {label}
      </span>
      <span className="text-mem-text-primary">{children}</span>
    </span>
  )
}

function safeHost(url: string): string {
  try {
    const u = new URL(url)
    return u.host
  } catch {
    return url
  }
}
