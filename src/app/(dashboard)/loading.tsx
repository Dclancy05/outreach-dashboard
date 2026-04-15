export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 rounded-lg bg-muted" />
        <div className="space-y-2">
          <div className="h-5 w-48 bg-muted rounded" />
          <div className="h-3 w-32 bg-muted rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-xl" />
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-14 bg-muted rounded-lg" style={{ opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    </div>
  )
}
