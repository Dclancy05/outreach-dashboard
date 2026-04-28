"use client"
/**
 * Code File Viewer — renders one file from the Project Tree, with optional
 * Edit (PR-based save) and Delete (cascade-aware PR) actions.
 *
 * Modes:
 *  - markdown (.md / .mdx)            — react-markdown + prose
 *  - code (everything else)           — server-rendered Shiki HTML
 *  - binary                           — "Preview not available" + GitHub link
 *  - too_large                        — refusal card + GitHub link
 *
 * Cross-nav: when the file matches a known dashboard page (via /api/projects/all-pages),
 * an "Open in Pages" button appears so the user can flip between dumbed-down view
 * and raw source view.
 */
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ExternalLink, FileImage, LayoutGrid, Loader2, Pencil, Save, Trash2, X } from "lucide-react"
import ReactMarkdown from "react-markdown"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { CodeFileHeader } from "./code-file-header"
import { DeleteSourceDialog } from "./delete-source-dialog"
import { SessionExpiredCard } from "./session-expired"

interface FileResponse {
  path: string
  size?: number
  sha?: string
  language?: string
  content?: string
  html?: string | null
  redacted?: boolean
  is_binary?: boolean
  too_large?: boolean
  github_url?: string | null
  error?: string
}

interface AllPage {
  route: string
  title: string
  source_path: string
}

interface Props {
  /** Slug-prefixed path, e.g. "agency-hq/src/app/page.tsx". */
  path: string
  onSegmentClick?: (segmentPath: string) => void
  /** Switch to Pages view and select the page that matches this file (if any). */
  onOpenInPages?: (route: string) => void
  /** Called after a successful delete-PR is opened, so the host can clear selection. */
  onDeleted?: () => void
}

export function CodeFileViewer({ path, onSegmentClick, onOpenInPages, onDeleted }: Props) {
  const [data, setData] = useState<FileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)

  // Edit-mode state
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)

  // Delete-dialog state
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Page-match state for "Open in Pages" button
  const [pageMatch, setPageMatch] = useState<{ route: string; title: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    setError(null)
    setErrorStatus(null)
    setEditing(false)
    ;(async () => {
      try {
        const res = await fetch(`/api/projects/file?path=${encodeURIComponent(path)}`, { cache: "no-store" })
        const body = (await res.json()) as FileResponse
        if (cancelled) return
        if (!res.ok) {
          setErrorStatus(res.status)
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        setData(body)
        setDraft(body.content ?? "")
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [path])

  // Try to find a Pages-view page that owns this file. Strip the slug prefix so
  // "agency-hq/src/app/foo/page.tsx" → "src/app/foo/page.tsx" (what all-pages stores).
  useEffect(() => {
    let cancelled = false
    const repoPath = path.startsWith("agency-hq/") ? path.slice("agency-hq/".length) : path
    fetch("/api/projects/all-pages", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null
        return r.json()
      })
      .then((j: { pages?: AllPage[] } | null) => {
        if (cancelled || !j?.pages) return
        const match = j.pages.find((p) => p.source_path === repoPath)
        setPageMatch(match ? { route: match.route, title: match.title } : null)
      })
      .catch(() => { /* ignore — match is just a nice-to-have */ })
    return () => { cancelled = true }
  }, [path])

  const repoPath = useMemo(
    () => (path.startsWith("agency-hq/") ? path.slice("agency-hq/".length) : path),
    [path],
  )

  const canEdit = !!data && !data.too_large && !data.is_binary && !data.redacted
  const canDelete = !!data && !!data.path
  const isDirty = editing && data?.content !== undefined && draft !== data.content

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isDirty])

  async function handleSave() {
    if (!data) return
    if (draft.length > 1_000_000) {
      toast.error("File is too large (max 1 MB)")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/projects/save-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          content: draft,
          base_sha: data.sha,
          reason: "edit from /agency/memory#project-tree → Files",
        }),
      })
      const j = await res.json()
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`)
      toast.success(
        <span>
          Opened PR #{j.pr_number}.{" "}
          <a href={j.pr_url} target="_blank" rel="noreferrer" className="underline">Review &amp; merge</a>
        </span>,
      )
      setEditing(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-zinc-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading {path.split("/").pop()}…
      </div>
    )
  }

  if (errorStatus === 401) {
    return <SessionExpiredCard what="this file" />
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-red-300">
        <AlertTriangle className="w-4 h-4 mr-2 inline" />
        {error}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex flex-col h-full">
      <CodeFileHeader path={data.path} githubUrl={data.github_url ?? undefined} onSegmentClick={onSegmentClick} />

      {/* Action bar — Open in Pages, Edit, Delete */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800/60 bg-zinc-950/30 shrink-0">
        {pageMatch && onOpenInPages && !editing && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpenInPages(pageMatch.route)}
            className="h-7 px-2 text-xs gap-1.5 text-zinc-400 hover:text-amber-300"
            title={`Open the friendly view for ${pageMatch.title}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Open in Pages
          </Button>
        )}
        <div className="flex-1" />
        {editing ? (
          <>
            <span className="text-[10px] text-zinc-500 mr-2">
              {isDirty ? "unsaved changes" : "no changes"}
            </span>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(data.content ?? "") }} disabled={saving} className="h-7 px-2 text-xs gap-1.5">
              <X className="w-3.5 h-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !isDirty} className="h-7 px-2 text-xs gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? "Opening PR…" : "Save (open PR)"}
            </Button>
          </>
        ) : (
          <>
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(true)}
                className="h-7 px-2 text-xs gap-1.5 text-zinc-400 hover:text-amber-300"
                title="Edit this file (opens a PR — nothing ships until you merge)"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Button>
            )}
            {data.redacted && !editing && (
              <span className="text-[10px] text-amber-400/80 mr-1" title="Edit disabled because the displayed content has redacted secrets">
                edit disabled (redacted)
              </span>
            )}
            {canDelete && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteOpen(true)}
                className="h-7 px-2 text-xs gap-1.5 text-zinc-500 hover:text-rose-400"
                title="Delete this file (opens a PR with cascade analysis)"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            )}
          </>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="w-full h-full bg-zinc-950 text-zinc-200 text-xs font-mono p-4 resize-none focus:outline-none"
          />
        ) : data.too_large ? (
          <RefusalCard
            title="File too large to preview"
            detail={`${formatBytes(data.size ?? 0)} — preview cap is 1 MB.`}
            githubUrl={data.github_url}
          />
        ) : data.is_binary ? (
          <RefusalCard
            title="Binary file"
            detail={`${formatBytes(data.size ?? 0)} — no in-browser preview.`}
            githubUrl={data.github_url}
            icon="image"
          />
        ) : isMarkdown(data.path) ? (
          <article className="prose prose-invert prose-sm max-w-none p-6">
            <ReactMarkdown>{data.content ?? ""}</ReactMarkdown>
            {data.redacted && <RedactedNote />}
          </article>
        ) : data.html ? (
          <>
            <div
              className="text-sm font-mono [&_pre]:!bg-zinc-950 [&_pre]:!p-4 [&_pre]:!rounded-none [&_pre]:!m-0 [&_pre]:overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: data.html }}
            />
            {data.redacted && <RedactedNote />}
          </>
        ) : (
          <pre className="text-xs font-mono p-4 text-zinc-300 whitespace-pre-wrap break-all">
            {data.content}
          </pre>
        )}
      </div>

      {deleteOpen && (
        <DeleteSourceDialog
          sourcePath={repoPath}
          displayName={path.split("/").pop() || path}
          routeContext={pageMatch?.route}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            setDeleteOpen(false)
            onDeleted?.()
          }}
        />
      )}
    </div>
  )
}

function isMarkdown(path: string): boolean {
  return /\.mdx?$/i.test(path)
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function RefusalCard(props: { title: string; detail: string; githubUrl?: string | null; icon?: "image" }) {
  return (
    <div className="p-8 text-center space-y-3">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-800/60">
        {props.icon === "image"
          ? <FileImage className="w-6 h-6 text-zinc-400" />
          : <AlertTriangle className="w-6 h-6 text-zinc-400" />}
      </div>
      <div className="text-zinc-200 font-medium">{props.title}</div>
      <div className="text-zinc-500 text-sm">{props.detail}</div>
      {props.githubUrl && (
        <a
          href={props.githubUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 text-sm underline"
        >
          Open on GitHub <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}

function RedactedNote() {
  return (
    <div className="px-4 py-2 text-xs text-amber-300/80 border-t border-amber-500/20 bg-amber-500/5">
      Some token-like values were replaced with <code className="text-amber-200">[REDACTED]</code> before display.
      Editing is disabled here so we don&apos;t accidentally commit the redacted form back to GitHub.
    </div>
  )
}
