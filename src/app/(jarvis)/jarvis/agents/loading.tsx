/**
 * /jarvis/agents — themed skeleton shown during server-side render and client
 * navigation. Matches the dark Jarvis chrome so there's no flash of white.
 *
 * BUG-001/002 also benefit from this — even before the [slug] route resolves,
 * the user stays inside the dark theme.
 */

export default function JarvisAgentsLoading() {
  return (
    <div className="flex flex-col h-full min-h-0 bg-mem-bg animate-pulse">
      {/* Title row skeleton */}
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-5 rounded bg-mem-surface-2" />
          <div className="h-7 w-24 rounded bg-mem-surface-2" />
          <div className="h-6 w-8 rounded-full bg-mem-surface-2" />
        </div>
        <div className="h-8 w-28 rounded bg-mem-surface-2" />
      </header>

      {/* Subtab strip skeleton */}
      <div className="px-4 mt-2 flex gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-24 rounded-md bg-mem-surface-2" />
        ))}
      </div>

      {/* Body skeleton */}
      <div className="flex-1 min-h-0 px-4 pt-4 pb-4">
        <div className="h-full rounded-lg border border-mem-border bg-mem-surface-1 p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-mem-surface-2" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/3 rounded bg-mem-surface-2" />
                <div className="h-2.5 w-2/3 rounded bg-mem-surface-2/60" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
