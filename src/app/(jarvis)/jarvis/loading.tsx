// Themed loading skeleton — mounted by Next.js automatically for /jarvis routes
// while their server work resolves. Matches the canvas area only; the shell
// chrome (sidebar/header/status) is already painted by the layout, so the
// skeleton just fills the canvas with shimmer placeholders.
//
// Keep this server-rendered (no "use client") so it streams as fast as possible.

export default function JarvisLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <header className="flex items-center justify-between">
        <div className="h-7 w-48 animate-pulse rounded-md bg-mem-surface-2" />
        <div className="h-9 w-44 animate-pulse rounded-full bg-mem-surface-2" />
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-mem-border bg-mem-surface-1"
          />
        ))}
      </section>

      <section className="rounded-xl border border-mem-border bg-mem-surface-1 p-4">
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-mem-surface-2"
              style={{ width: `${100 - i * 8}%` }}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
