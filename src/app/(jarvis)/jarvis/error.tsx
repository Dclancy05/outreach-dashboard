"use client"

// Themed error boundary for /jarvis/* routes.
// IMPORTANT: NO white flash. This component renders inside the layout, so the
// shell chrome stays painted; we only need to fill the canvas with a dark,
// readable error card.

import { AlertTriangle, RotateCcw } from "lucide-react"
import { useEffect } from "react"

interface JarvisErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function JarvisError({ error, reset }: JarvisErrorProps) {
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
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-mem-status-stuck/15 text-mem-status-stuck">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h1 className="jarvis-page-title mb-2 text-lg">Something went sideways.</h1>
        <p className="mb-4 text-sm text-mem-text-secondary">
          {error.message || "An unexpected error occurred while loading this page."}
        </p>
        {error.digest && (
          <p className="mb-4 font-mono text-[11px] text-mem-text-muted">
            ref: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-mem-border bg-mem-surface-2 px-3 text-sm font-medium text-mem-text-primary transition-colors hover:border-mem-border-strong"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    </div>
  )
}
