"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import { Button } from "@/components/ui/button"

// Wave 3.4 — /automations/* error boundary.
export default function AutomationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { context: "ui", scope: "automations" },
    })
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-md">
        <div className="text-5xl">⚠️</div>
        <h2 className="text-xl font-semibold">Automations page error</h2>
        <p className="text-muted-foreground text-sm">
          {error.message || "Reload to retry."}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 font-mono">id: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <Button onClick={reset}>Reload</Button>
          <Button onClick={() => (window.location.href = "/automations")} variant="outline">Automations home</Button>
        </div>
      </div>
    </div>
  )
}
