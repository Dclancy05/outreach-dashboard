"use client"
/**
 * Code File Viewer — renders one file from the Project Tree.
 *
 * Modes:
 *  - markdown (.md / .mdx)            — react-markdown + prose
 *  - code (everything else)           — server-rendered Shiki HTML
 *  - binary                           — "Preview not available" + GitHub link
 *  - too_large                        — refusal card + GitHub link
 *
 * If the user opens a folder and the API returns a file (auto-README),
 * this component handles it transparently.
 */
import { useEffect, useState } from "react"
import { AlertTriangle, FileImage, Loader2 } from "lucide-react"
import ReactMarkdown from "react-markdown"
import { CodeFileHeader } from "./code-file-header"

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

interface Props {
  path: string
  onSegmentClick?: (segmentPath: string) => void
}

export function CodeFileViewer({ path, onSegmentClick }: Props) {
  const [data, setData] = useState<FileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/projects/file?path=${encodeURIComponent(path)}`, { cache: "no-store" })
        const body = (await res.json()) as FileResponse
        if (cancelled) return
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
        setData(body)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [path])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-zinc-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading {path.split("/").pop()}…
      </div>
    )
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
      <div className="flex-1 overflow-auto">
        {data.too_large ? (
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
          className="inline-block text-amber-300 hover:text-amber-200 text-sm underline"
        >
          Open on GitHub →
        </a>
      )}
    </div>
  )
}

function RedactedNote() {
  return (
    <div className="px-4 py-2 text-xs text-amber-300/80 border-t border-amber-500/20 bg-amber-500/5">
      Some token-like values were replaced with <code className="text-amber-200">[REDACTED]</code> before display.
    </div>
  )
}
