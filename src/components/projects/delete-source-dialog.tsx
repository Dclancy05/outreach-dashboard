"use client"
/**
 * Cascade-aware delete dialog for any source file in the GitHub repo.
 *
 * Used by:
 *  - Pages view (Pages mode) — delete a whole page (frontend + matching backend)
 *  - Files view (Files mode) — delete a single file (still cascade-aware so the user
 *    is reminded if backend partners exist)
 *
 * Always opens a PR — never deletes directly to main.
 */
import { useEffect, useState } from "react"
import { ExternalLink, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface CascadeCandidate {
  path: string
  reason: string
  confidence: "high" | "medium" | "low"
}

interface Props {
  /** Repo-relative path to the file to delete (e.g. `src/app/foo/page.tsx`). */
  sourcePath: string
  /** Friendly name shown in the title — page title, filename, etc. */
  displayName: string
  /** Optional URL route this delete corresponds to (used in PR title). */
  routeContext?: string
  onClose: () => void
  onDeleted: () => void
}

export function DeleteSourceDialog({ sourcePath, displayName, routeContext, onClose, onDeleted }: Props) {
  const [candidates, setCandidates] = useState<CascadeCandidate[] | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sourcePath) return
    fetch(`/api/projects/cascade?path=${encodeURIComponent(sourcePath)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((j: { candidates: CascadeCandidate[] }) => {
        setCandidates(j.candidates || [])
        const toCheck = new Set<string>()
        for (const c of j.candidates || []) {
          if (c.confidence === "high") toCheck.add(c.path)
        }
        setChecked(toCheck)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [sourcePath])

  const totalSelected = 1 + checked.size

  function toggle(path: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const files = [sourcePath, ...Array.from(checked)]
      const res = await fetch("/api/projects/delete-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files, reason: reason.trim(), page_route: routeContext }),
      })
      const j = await res.json()
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`)
      setPrUrl(j.pr_url as string)
      toast.success(`Opened PR #${j.pr_number} — ${j.deleted.length} file(s)`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-rose-400" />
            Delete &ldquo;{displayName}&rdquo;?
          </DialogTitle>
        </DialogHeader>

        {prUrl ? (
          <div className="space-y-3 py-2">
            <div className="text-sm text-zinc-200">
              ✅ Pull request opened. Click below to review the diff and merge.
            </div>
            <a
              href={prUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-amber-300 hover:text-amber-200 text-sm break-all"
            >
              {prUrl} <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <p className="text-xs text-zinc-500">
              Once you merge the PR on GitHub, Vercel will auto-deploy and the file disappears.
              Until then, nothing has actually been removed.
            </p>
          </div>
        ) : (
          <div className="space-y-3 py-2 max-h-[60vh] overflow-auto">
            <div className="text-sm text-zinc-300">
              This will <strong>open a pull request</strong> deleting the file
              {totalSelected > 1 ? `s (${totalSelected} total)` : ""}. Nothing happens until you merge it on GitHub.
            </div>
            <div className="rounded border border-zinc-800/60 bg-zinc-900/40 p-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500">📄 file:</span>
                <span className="font-mono text-zinc-200 truncate">{sourcePath}</span>
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">
                Also delete these? (related backend files)
              </div>
              {candidates === null && (
                <div className="text-xs text-zinc-500 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Looking for related files…
                </div>
              )}
              {candidates && candidates.length === 0 && (
                <div className="text-xs text-zinc-500 italic">None found — just this file.</div>
              )}
              {candidates && candidates.length > 0 && (
                <div className="space-y-1">
                  {candidates.map((c) => (
                    <label
                      key={c.path}
                      className="flex items-start gap-2 text-xs p-2 rounded hover:bg-zinc-900/60 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked.has(c.path)}
                        onChange={() => toggle(c.path)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-zinc-200 truncate">{c.path}</div>
                        <div className="text-[10px] text-zinc-500">
                          {c.confidence === "high" ? "🟥 high" : c.confidence === "medium" ? "🟧 medium" : "⬜ low"}
                          {" "} confidence — {c.reason}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">
                Reason (optional, goes in the PR description)
              </div>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. old experiment, replaced by something else"
                className="min-h-[60px] text-xs"
              />
            </div>

            {error && <div className="text-rose-300 text-xs">{error}</div>}
          </div>
        )}

        <DialogFooter>
          {prUrl ? (
            <Button variant="outline" onClick={() => { onDeleted() }}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={submit} disabled={submitting} className="gap-1.5">
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Open delete PR ({totalSelected} file{totalSelected === 1 ? "" : "s"})
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
