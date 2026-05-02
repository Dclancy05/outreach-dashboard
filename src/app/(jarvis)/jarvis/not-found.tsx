// Themed 404 for /jarvis/*. The layout's sidebar and header stay visible,
// so the user always has a way out without hitting a dashboard-flavored page.

import Link from "next/link"
import { Compass, Home } from "lucide-react"

export default function JarvisNotFound() {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex min-h-[60vh] items-center justify-center"
    >
      <div className="max-w-md rounded-xl border border-mem-border bg-mem-surface-1 p-6 text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-mem-accent/15 text-mem-accent">
          <Compass className="h-5 w-5" />
        </div>
        <h1 className="jarvis-page-title mb-2 text-lg">Page not found.</h1>
        <p className="mb-5 text-sm text-mem-text-secondary">
          That route isn&apos;t wired up inside Jarvis yet. Head back to Memory or
          jump out to the dashboard.
        </p>
        <div className="flex justify-center gap-2">
          <Link
            href="/jarvis/memory"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-mem-border bg-mem-surface-2 px-3 text-sm font-medium text-mem-text-primary transition-colors hover:border-mem-border-strong"
          >
            <Home className="h-3.5 w-3.5" />
            Go to Memory
          </Link>
          <Link
            href="/agency/memory"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-mem-border bg-mem-bg px-3 text-sm font-medium text-mem-text-secondary transition-colors hover:border-mem-border-strong hover:text-mem-text-primary"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
