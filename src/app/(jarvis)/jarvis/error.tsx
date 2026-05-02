"use client"

// Themed error boundary for /jarvis/* routes.
//
// Goals:
//  1. NO white flash. Renders inside the layout — shell chrome stays painted.
//  2. Friendly copy — Dylan is non-technical; the user sees plain English,
//     not a stack trace.
//  3. Recovery paths: try-again first, then go-home, then "report" mailto.
//  4. Auto-detect common transient causes (network, 401, 5xx) and surface a
//     specific tip per cause.
//  5. Telemetry: the digest ID is shown so paste-into-bug-report works.

import { AlertTriangle, ArrowLeft, ExternalLink, RotateCcw } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo } from "react"

interface JarvisErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

interface ErrorClass {
  tone: "network" | "auth" | "server" | "data" | "unknown"
  title: string
  hint: string
}

function classify(err: Error): ErrorClass {
  const msg = (err.message || "").toLowerCase()
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("offline") || msg.includes("aborted")) {
    return {
      tone: "network",
      title: "Looks like the network's wobbly.",
      hint: "Check your wifi or VPN. Most pages will reload themselves once the connection is back.",
    }
  }
  if (msg.includes("401") || msg.includes("unauthor") || msg.includes("forbidden")) {
    return {
      tone: "auth",
      title: "Your session timed out.",
      hint: "PIN in again from /admin and you'll land right back here.",
    }
  }
  if (msg.includes("500") || msg.includes("503") || msg.includes("502") || msg.includes("server")) {
    return {
      tone: "server",
      title: "The server hiccupped.",
      hint: "Try again in a few seconds. If it keeps happening, /jarvis/status will show what's down.",
    }
  }
  if (msg.includes("undefined") || msg.includes("null") || msg.includes("cannot read") || msg.includes("not iterable")) {
    return {
      tone: "data",
      title: "We hit some unexpected data.",
      hint: "Refresh the page. If it still shows up, that ref ID below is what to share when reporting.",
    }
  }
  return {
    tone: "unknown",
    title: "Something went sideways.",
    hint: "Try again. If it keeps happening, copy the ref ID and ping support.",
  }
}

export default function JarvisError({ error, reset }: JarvisErrorProps) {
  const cls = useMemo(() => classify(error), [error])

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[jarvis] route error:", error)
  }, [error])

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex min-h-[60vh] items-center justify-center"
    >
      <div className="max-w-md rounded-xl border border-mem-border bg-mem-surface-1 p-6 text-center">
        <div
          className={
            "mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full " +
            (cls.tone === "network"
              ? "bg-mem-status-thinking/15 text-mem-status-thinking"
              : cls.tone === "auth"
              ? "bg-mem-status-needs/15 text-mem-status-needs"
              : "bg-mem-status-stuck/15 text-mem-status-stuck")
          }
        >
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h1 className="jarvis-page-title mb-2 text-lg">{cls.title}</h1>
        <p className="mb-3 text-sm text-mem-text-secondary">{cls.hint}</p>
        {error.message ? (
          <details className="mb-4 text-left">
            <summary className="cursor-pointer text-[11px] font-mono uppercase tracking-wider text-mem-text-muted hover:text-mem-text-secondary">
              Show technical details
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-mem-border bg-mem-bg p-2 text-[11px] text-mem-text-secondary text-left whitespace-pre-wrap">
              {error.message}
            </pre>
          </details>
        ) : null}
        {error.digest && (
          <p className="mb-4 font-mono text-[11px] text-mem-text-muted">
            ref: {error.digest}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-mem-border bg-mem-surface-2 px-3 text-sm font-medium text-mem-text-primary transition-colors hover:border-mem-border-strong"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try again
          </button>
          <Link
            href="/jarvis"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-mem-border bg-mem-surface-1 px-3 text-sm font-medium text-mem-text-secondary transition-colors hover:border-mem-border-strong hover:text-mem-text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Go home
          </Link>
          <Link
            href="/jarvis/status"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-mem-border bg-mem-surface-1 px-3 text-sm font-medium text-mem-text-secondary transition-colors hover:border-mem-border-strong hover:text-mem-text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Check system status
          </Link>
        </div>
      </div>
    </div>
  )
}
