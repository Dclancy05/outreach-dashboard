"use client"
/**
 * Sticky breadcrumb + actions for the Code File Viewer.
 * Shows path segments (each clickable to scroll the tree to that level),
 * plus copy-path and open-on-GitHub buttons.
 */
import { useState } from "react"
import { ChevronRight, Copy, ExternalLink, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Props {
  path: string                       // "agency-hq/src/app/page.tsx"
  githubUrl?: string | null
  onSegmentClick?: (segmentPath: string) => void
}

export function CodeFileHeader({ path, githubUrl, onSegmentClick }: Props) {
  const [copied, setCopied] = useState(false)
  const segs = path.split("/").filter(Boolean)

  async function copy() {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignored */ }
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800/60 bg-zinc-950/40 sticky top-0 z-10">
      <div className="flex items-center gap-1 text-xs font-mono text-zinc-300 truncate">
        {segs.map((s, i) => {
          const segPath = segs.slice(0, i + 1).join("/")
          const isLast = i === segs.length - 1
          return (
            <span key={segPath} className="flex items-center gap-1 min-w-0">
              {i > 0 && <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />}
              <button
                type="button"
                onClick={() => onSegmentClick?.(segPath)}
                className={cn(
                  "hover:text-amber-300 truncate",
                  isLast ? "text-zinc-100" : "text-zinc-400",
                )}
                title={segPath}
              >
                {s}
              </button>
            </span>
          )
        })}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="ghost" onClick={copy} className="h-7 px-2 text-xs" title="Copy path">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
        {githubUrl && (
          <Button size="sm" variant="ghost" asChild className="h-7 px-2 text-xs" title="Open on GitHub">
            <a href={githubUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}
