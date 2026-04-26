export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted/60" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1,2,3,4].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/40" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/40" />)}
        </div>
        <div className="h-[600px] animate-pulse rounded-xl bg-muted/40" />
      </div>
    </div>
  )
}
