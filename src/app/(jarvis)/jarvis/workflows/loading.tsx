/**
 * /jarvis/workflows — themed skeleton matching the 3-pane builder.
 *
 * Mirrors the dark Jarvis chrome so the user never sees a flash of light
 * during navigation. The xyflow canvas is also dynamically imported, so this
 * doubles as the chunk-fetch fallback.
 */

export default function JarvisWorkflowsLoading() {
  return (
    <div className="flex flex-col h-full min-h-dvh bg-mem-bg animate-pulse -mx-4 sm:-mx-8 -mt-6 -mb-12">
      {/* Title bar skeleton */}
      <div className="flex items-center gap-3 px-4 sm:px-6 pt-4 pb-3 shrink-0">
        <div className="h-7 w-7 rounded bg-mem-surface-2" />
        <div className="h-7 w-32 rounded bg-mem-surface-2" />
        <div className="h-6 w-10 rounded-full bg-mem-surface-2" />
        <div className="ml-auto flex gap-2">
          <div className="h-8 w-24 rounded bg-mem-surface-2" />
          <div className="h-8 w-24 rounded bg-mem-surface-2" />
          <div className="h-8 w-28 rounded bg-mem-accent/40" />
        </div>
      </div>

      {/* 3-pane skeleton */}
      <div className="flex-1 min-h-0 flex border-t border-mem-border">
        {/* Palette pane */}
        <div className="hidden md:block w-[180px] shrink-0 border-r border-mem-border bg-mem-surface-1 p-2 space-y-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-8 rounded bg-mem-surface-2"
              style={{ width: `${72 + (i * 9) % 24}%` }}
            />
          ))}
        </div>

        {/* Canvas pane */}
        <div className="flex-1 min-w-0 relative bg-mem-surface-1 m-2 rounded-lg border border-mem-border overflow-hidden">
          {/* Faux dot grid */}
          <div
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)",
              backgroundSize: "16px 16px",
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-12 w-44 rounded-md bg-mem-surface-2 border border-mem-border" />
          </div>
          {/* Faux Controls bottom-left */}
          <div className="absolute bottom-3 left-3 h-20 w-9 rounded bg-mem-surface-2 border border-mem-border" />
          {/* Faux MiniMap bottom-right */}
          <div className="absolute bottom-3 right-3 h-20 w-32 rounded bg-mem-surface-2 border border-mem-border" />
        </div>

        {/* Inspector pane */}
        <div className="hidden lg:block w-[320px] shrink-0 border-l border-mem-border bg-mem-surface-1 p-3 space-y-2">
          <div className="h-7 rounded bg-mem-surface-2" />
          <div className="h-32 rounded bg-mem-surface-2/60" />
          <div className="h-32 rounded bg-mem-surface-2/60" />
        </div>
      </div>
    </div>
  )
}
