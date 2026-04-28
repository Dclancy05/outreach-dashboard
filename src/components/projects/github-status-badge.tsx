"use client"
/**
 * Status pill for the Project Tree tab — shows GitHub PAT health and
 * remaining rate-limit headroom. Click for details.
 */
import { useEffect, useState } from "react"
import { CheckCircle2, AlertTriangle, Github } from "lucide-react"

interface Status {
  github_configured: boolean
  rate_limit?: { limit: number; remaining: number; resetAt: number } | null
  projects?: Array<{ slug: string; display_name: string; github_owner: string; github_repo: string; branch: string }>
}

export function GitHubStatusBadge() {
  const [s, setS] = useState<Status | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchOnce = async () => {
      try {
        const res = await fetch("/api/projects", { cache: "no-store" })
        const j = (await res.json()) as Status
        if (!cancelled) setS(j)
      } catch {
        if (!cancelled) setS({ github_configured: false })
      }
    }
    fetchOnce()
    const id = setInterval(fetchOnce, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (!s) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-400">
        <Github className="w-3 h-3 animate-pulse" /> GitHub
      </span>
    )
  }

  if (!s.github_configured) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-700/50 bg-amber-950/40 px-2.5 py-1 text-xs text-amber-300"
        title="Set GITHUB_PAT in Vercel env to enable Project Tree"
      >
        <AlertTriangle className="w-3 h-3" />
        GitHub not configured
      </span>
    )
  }

  const rl = s.rate_limit
  const remaining = rl?.remaining ?? null
  const limit = rl?.limit ?? null
  const low = remaining !== null && limit !== null && remaining < limit * 0.1

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
          low
            ? "border-amber-700/50 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50"
            : "border-emerald-700/50 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50"
        }`}
        title={remaining !== null ? `${remaining}/${limit} GitHub API requests remaining` : "GitHub PAT configured"}
      >
        <CheckCircle2 className="w-3 h-3" />
        <Github className="w-3 h-3" />
        {remaining !== null && limit !== null
          ? <span className="font-medium">{remaining.toLocaleString()}/{limit.toLocaleString()}</span>
          : <span className="font-medium">ready</span>}
      </button>
      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl p-3 text-xs"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="font-semibold text-zinc-100 mb-2">GitHub status</div>
          <dl className="space-y-1.5 text-zinc-400">
            <Row label="PAT" value={s.github_configured ? "configured" : "missing"} />
            {rl && (
              <>
                <Row label="Remaining" value={`${rl.remaining.toLocaleString()} / ${rl.limit.toLocaleString()}`} />
                <Row label="Resets at" value={new Date(rl.resetAt).toLocaleTimeString()} />
              </>
            )}
            <Row label="Projects" value={String(s.projects?.length ?? 0)} />
          </dl>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-zinc-500 shrink-0">{label}</dt>
      <dd className="text-right break-all text-zinc-300">{value}</dd>
    </div>
  )
}
