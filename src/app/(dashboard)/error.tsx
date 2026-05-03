"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import { Button } from "@/components/ui/button"

// Wave 3.4 — dashboard route group error boundary.
// Catches any unhandled exception inside (dashboard)/* before the root
// boundary takes over. Captures to Sentry with the route group tag so
// alerts can fire on dashboard-specific errors.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { context: "ui", scope: "dashboard" },
    })
    console.error("[dashboard error]", error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-md">
        <div className="text-5xl">😬</div>
        <h2 className="text-xl font-semibold">Something broke on this page</h2>
        <p className="text-muted-foreground text-sm">
          {error.message || "Unexpected error. Try reloading."}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 font-mono">id: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <Button onClick={reset} variant="default">Reload page</Button>
          <Button onClick={() => (window.location.href = "/")} variant="outline">Home</Button>
        </div>
      </div>
    </div>
  )
}
