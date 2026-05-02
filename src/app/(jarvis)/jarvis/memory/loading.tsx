/**
 * /jarvis/memory — themed skeleton matching the 4-pane workspace.
 *
 * Mirrors the dark Jarvis chrome so the user never sees a flash of white
 * during navigation (BUG-001/002 family).
 */

export default function JarvisMemoryLoading() {
  return (
    <div className="flex flex-col h-full min-h-dvh bg-mem-bg animate-pulse -mx-4 sm:-mx-8 -mt-6 -mb-12">
      {/* Resume chip skeleton */}
      <div className="mx-3 sm:mx-5 mt-2 mb-1 h-9 rounded-lg bg-mem-surface-2 border border-mem-border" />

      {/* Top bar skeleton (filter chips + actions) */}
      <div className="flex items-center gap-2 px-3 sm:px-5 py-2 border-b border-mem-border shrink-0">
        <div className="h-7 w-72 rounded-lg bg-mem-surface-2" />
        <div className="ml-auto flex gap-1">
          <div className="h-8 w-8 rounded bg-mem-surface-2" />
          <div className="h-8 w-8 rounded bg-mem-surface-2" />
        </div>
      </div>

      {/* 4-pane skeleton */}
      <div className="flex-1 min-h-0 flex">
        {/* Tree pane */}
        <div className="hidden lg:block w-[260px] xl:w-[280px] shrink-0 border-r border-mem-border bg-mem-surface-1 p-2 space-y-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-6 rounded bg-mem-surface-2" style={{ width: `${60 + (i * 7) % 30}%` }} />
          ))}
        </div>

        {/* Editor pane */}
        <div className="flex-1 min-w-0 p-4 space-y-2">
          <div className="h-6 w-1/3 rounded bg-mem-surface-2" />
          <div className="h-3 w-1/2 rounded bg-mem-surface-2/60" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-3 rounded bg-mem-surface-2/60" style={{ width: `${50 + (i * 11) % 40}%` }} />
            ))}
          </div>
        </div>

        {/* Right rail */}
        <div className="hidden xl:block w-[320px] shrink-0 border-l border-mem-border bg-mem-surface-1 p-3 space-y-2">
          <div className="h-7 rounded bg-mem-surface-2" />
          <div className="h-32 rounded bg-mem-surface-2/60" />
          <div className="h-32 rounded bg-mem-surface-2/60" />
        </div>
      </div>
    </div>
  )
}
