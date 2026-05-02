"use client"

/**
 * Empty state shown before the user clicks Connect.
 *
 * Renders a big "Click to connect" CTA + a small troubleshooting block. The
 * parent page polls /api/observability/vnc/health every 5s (when this view is
 * mounted) — we receive the result via the `health` prop and show a small
 * status pill so the user knows whether the VPS is reachable BEFORE they hit
 * the button.
 */

import { Eye, Wifi, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type VncHealth = "unknown" | "reachable" | "unreachable" | "checking"

interface VncEmptyStateProps {
  /** Whether NEXT_PUBLIC_VNC_WS_URL was configured. */
  hasUrl: boolean
  /** Resolved URL we're going to connect to (display only). */
  wsUrl: string | null
  /** Result of last health check. */
  health: VncHealth
  /** True if the user has tried and failed once already. */
  hadError: boolean
  /** Last error message from the viewer (when hadError). */
  errorMessage?: string | null
  onConnect: () => void
  className?: string
}

const HEALTH_BADGE: Record<VncHealth, { label: string; tone: string }> = {
  unknown: { label: "Status unknown", tone: "text-mem-text-muted" },
  checking: { label: "Checking…", tone: "text-mem-status-thinking" },
  reachable: { label: "VPS reachable", tone: "text-mem-status-working" },
  unreachable: { label: "VPS unreachable", tone: "text-mem-status-stuck" },
}

export function VncEmptyState({
  hasUrl,
  wsUrl,
  health,
  hadError,
  errorMessage,
  onConnect,
  className,
}: VncEmptyStateProps) {
  const healthBadge = HEALTH_BADGE[health]

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center rounded-lg border border-dashed border-mem-border bg-mem-surface-1/50 p-6 sm:p-10 text-center",
        className
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mem-accent/10 text-mem-accent">
        <Eye className="h-7 w-7" aria-hidden />
      </div>

      <h2 className="mt-5 text-lg font-semibold text-mem-text-primary">
        {hasUrl ? "Live VPS browser, ready to watch" : "VNC viewer needs a host"}
      </h2>

      <p className="mt-2 max-w-md text-[13px] text-mem-text-secondary">
        {hasUrl
          ? "Connect to see — and click into — the Chrome window your senders are running on the VPS."
          : "Set the NEXT_PUBLIC_VNC_WS_URL environment variable to point at your noVNC websockify endpoint."}
      </p>

      {/* Health pill */}
      <div className="mt-4 flex items-center gap-2 rounded-full border border-mem-border bg-mem-surface-2 px-3 py-1 text-[11px] font-mono">
        {health === "checking" ? (
          <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
        ) : (
          <span
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              health === "reachable" && "bg-mem-status-working",
              health === "unreachable" && "bg-mem-status-stuck",
              health === "unknown" && "bg-mem-text-muted"
            )}
          />
        )}
        <span className={healthBadge.tone}>{healthBadge.label}</span>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onConnect}
        disabled={!hasUrl}
        className={cn(
          "mt-6 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-semibold transition-colors",
          hasUrl
            ? "bg-mem-accent text-white hover:bg-mem-accent/90"
            : "cursor-not-allowed bg-mem-surface-2 text-mem-text-muted"
        )}
      >
        <Wifi className="h-4 w-4" aria-hidden />
        Click to connect
      </button>

      {/* Error message from a previous failed connect */}
      {hadError && errorMessage ? (
        <div
          role="alert"
          className="mt-5 flex max-w-md items-start gap-2 rounded-md border border-mem-status-stuck/40 bg-mem-status-stuck/10 px-3 py-2 text-left text-[12px] text-mem-text-primary"
        >
          <AlertCircle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mem-status-stuck"
            aria-hidden
          />
          <div>
            <span className="font-medium text-mem-status-stuck">
              Last attempt failed
            </span>
            <p className="mt-0.5 text-mem-text-secondary">{errorMessage}</p>
          </div>
        </div>
      ) : null}

      {/* Setup tips */}
      <div className="mt-8 w-full max-w-md rounded-lg border border-mem-border bg-mem-surface-2/50 p-4 text-left">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mem-text-muted">
          Setup checklist
        </p>
        <ul className="mt-2 space-y-1.5 text-[12px] text-mem-text-secondary">
          <li className="flex gap-2">
            <span className="text-mem-text-muted">1.</span>
            <span>
              Make sure <code className="rounded bg-mem-surface-3 px-1">noVNC</code>{" "}
              and <code className="rounded bg-mem-surface-3 px-1">x11vnc</code>{" "}
              are running on the VPS (ports 6080 and 5900).
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-mem-text-muted">2.</span>
            <span>
              Expose port 6080 publicly via Tailscale Funnel, Caddy, or another
              proxy that supports WebSocket upgrade.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-mem-text-muted">3.</span>
            <span>
              Set{" "}
              <code className="rounded bg-mem-surface-3 px-1">
                NEXT_PUBLIC_VNC_WS_URL
              </code>{" "}
              in Vercel — e.g.{" "}
              <code className="rounded bg-mem-surface-3 px-1 break-all">
                wss://srv1197943.taild42583.ts.net:6080/websockify
              </code>
              .
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-mem-text-muted">4.</span>
            <span>
              Optionally set{" "}
              <code className="rounded bg-mem-surface-3 px-1">
                NEXT_PUBLIC_VNC_PASSWORD
              </code>{" "}
              if x11vnc was started with a password.
            </span>
          </li>
        </ul>
        {wsUrl ? (
          <p className="mt-3 truncate font-mono text-[10px] text-mem-text-muted">
            target: {wsUrl}
          </p>
        ) : null}
      </div>
    </div>
  )
}
