/**
 * /jarvis/observability — themed loading skeleton.
 *
 * Streams while the client bundle hydrates the noVNC viewer. Mirrors the real
 * page's geometry (header → canvas → status strip) so there's no layout shift
 * when the actual UI mounts.
 *
 * Server component (no "use client") so it streams ASAP.
 */

export default function JarvisObservabilityLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-[calc(100vh-3.5rem)] flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8"
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 animate-pulse rounded-lg bg-mem-surface-2" />
          <div className="space-y-2">
            <div className="h-7 w-44 animate-pulse rounded-md bg-mem-surface-2" />
            <div className="h-3.5 w-72 animate-pulse rounded bg-mem-surface-2/70" />
          </div>
        </div>
        <div className="h-9 w-32 animate-pulse rounded-full bg-mem-surface-2" />
      </header>

      {/* Canvas */}
      <section className="relative flex-1 min-h-[480px] sm:min-h-[560px] overflow-hidden rounded-xl border border-mem-border bg-mem-surface-1">
        <div className="absolute inset-6 flex flex-col items-center justify-center gap-4">
          <div className="h-14 w-14 animate-pulse rounded-2xl bg-mem-surface-2" />
          <div className="h-5 w-64 animate-pulse rounded bg-mem-surface-2" />
          <div className="h-3 w-80 max-w-full animate-pulse rounded bg-mem-surface-2/70" />
          <div className="mt-4 h-10 w-40 animate-pulse rounded-lg bg-mem-surface-2" />
        </div>
        {/* Faux toolbar */}
        <div className="absolute right-3 top-3 flex gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-8 w-8 animate-pulse rounded-md bg-mem-surface-2"
            />
          ))}
        </div>
      </section>

      {/* Status strip */}
      <div className="h-9 animate-pulse rounded-md bg-mem-surface-1" />
    </div>
  )
}
