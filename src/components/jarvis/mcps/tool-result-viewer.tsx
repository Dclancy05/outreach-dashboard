"use client"

// Tool result viewer.
//
// Two presentation modes flip at the top of the viewer:
//   1. "Tree"   — collapsible JSON tree (default; instant render, no async highlight)
//   2. "Raw"    — Shiki-highlighted JSON, lazy-imported on first switch into Raw view
//                  (per W4.A.B3 spec: `const { codeToHtml } = await import('shiki')`).
//
// Both modes share a top-right toolbar:
//   - Mode toggle (Tree / Raw)
//   - Copy button (writes pretty JSON to clipboard)
//   - "Open in JSON" button → opens raw text in a Dialog modal
//
// Result objects can be huge (e.g., `browser_snapshot`). The tree starts at
// depth=1 expanded and lazily reveals nested children when the chevron is clicked.

import * as React from "react"
import { ChevronDown, ChevronRight, Copy, CheckCircle2, Maximize2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ToolResultViewerProps {
  /** Parsed JSON (any shape). Pass `undefined` while pending. */
  value: unknown
  /** Optional error string surfaced above the body if non-null. */
  error?: string | null
  /** Optional duration_ms for the meta strip. */
  durationMs?: number | null
  /** Optional status label (ok | error | rejected) for tinting. */
  status?: "ok" | "error" | "rejected" | null
  className?: string
}

type Mode = "tree" | "raw"

export function ToolResultViewer({
  value,
  error,
  durationMs,
  status,
  className,
}: ToolResultViewerProps) {
  const [mode, setMode] = React.useState<Mode>("tree")
  const [copied, setCopied] = React.useState(false)
  const [openModal, setOpenModal] = React.useState(false)

  const prettyJson = React.useMemo(() => safeStringify(value), [value])

  const handleCopy = () => {
    if (!prettyJson) return
    navigator.clipboard?.writeText(prettyJson).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  // Empty / pending state.
  if (value === undefined && !error) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed border-mem-border bg-mem-surface-1 p-6 text-center",
          className
        )}
      >
        <p className="text-[12px] text-mem-text-muted">
          Run a tool to see its result here.
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn("space-y-2", className)}
      data-testid="mcps-result-viewer"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em]">
          <span className="text-mem-text-muted">Result</span>
          {status && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5",
                status === "ok"
                  ? "bg-green-500/10 text-green-300"
                  : status === "rejected"
                    ? "bg-amber-500/10 text-amber-300"
                    : "bg-red-500/10 text-red-300"
              )}
            >
              {status}
            </span>
          )}
          {durationMs != null && (
            <span className="text-mem-text-muted">{durationMs}ms</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <ModeToggle mode={mode} onChange={setMode} />
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy JSON"
            disabled={!prettyJson}
            className="flex h-7 w-7 items-center justify-center rounded text-mem-text-secondary transition-colors hover:bg-white/[0.04] hover:text-mem-text-primary disabled:opacity-50"
          >
            {copied ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setOpenModal(true)}
            aria-label="Open in JSON viewer"
            disabled={!prettyJson}
            className="flex h-7 w-7 items-center justify-center rounded text-mem-text-secondary transition-colors hover:bg-white/[0.04] hover:text-mem-text-primary disabled:opacity-50"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-400/30 bg-red-400/5 p-3 text-[12px] text-red-300">
          <p className="break-words">{error}</p>
        </div>
      )}

      {value !== undefined && (
        <div
          className={cn(
            "max-h-[420px] overflow-auto rounded-md border border-mem-border bg-mem-surface-1",
            // Mobile: allow horizontal scroll for long lines.
            "[scrollbar-gutter:stable]"
          )}
        >
          {mode === "tree" ? (
            <div className="p-3 font-mono text-[12px] leading-relaxed">
              <JsonNode value={value} depth={0} initiallyOpen />
            </div>
          ) : (
            <ShikiBlock json={prettyJson} />
          )}
        </div>
      )}

      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Tool result (raw JSON)</DialogTitle>
            <DialogDescription className="font-mono text-[11px]">
              {durationMs != null && <>{durationMs}ms · </>}
              {prettyJson.length.toLocaleString()} chars
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md border border-mem-border bg-mem-surface-1 p-3 font-mono text-[12px] leading-relaxed text-mem-text-primary">
            {prettyJson}
          </pre>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-8 gap-1.5 text-[12px]"
            >
              {copied ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              Copy
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                Mode toggle                                  */
/* -------------------------------------------------------------------------- */

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode
  onChange: (m: Mode) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Result view mode"
      className="flex items-center rounded-md border border-mem-border bg-mem-surface-2 p-0.5"
    >
      {(["tree", "raw"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          onClick={() => onChange(m)}
          className={cn(
            "rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
            mode === m
              ? "bg-mem-surface-1 text-mem-text-primary"
              : "text-mem-text-secondary hover:text-mem-text-primary"
          )}
        >
          {m}
        </button>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                              Collapsible tree                               */
/* -------------------------------------------------------------------------- */

interface JsonNodeProps {
  value: unknown
  depth: number
  initiallyOpen?: boolean
  /** Optional key label rendered to the left when present. */
  label?: string
}

function JsonNode({ value, depth, initiallyOpen, label }: JsonNodeProps) {
  // Auto-collapse beyond depth 1 on first render to keep big payloads cheap.
  const [open, setOpen] = React.useState<boolean>(
    initiallyOpen ?? depth < 1
  )

  if (value === null) {
    return <Leaf label={label}><span className="text-mem-text-muted">null</span></Leaf>
  }
  if (value === undefined) {
    return <Leaf label={label}><span className="text-mem-text-muted">undefined</span></Leaf>
  }
  if (typeof value === "string") {
    return (
      <Leaf label={label}>
        <span className="text-emerald-300">{JSON.stringify(value)}</span>
      </Leaf>
    )
  }
  if (typeof value === "number") {
    return <Leaf label={label}><span className="text-amber-300">{String(value)}</span></Leaf>
  }
  if (typeof value === "boolean") {
    return <Leaf label={label}><span className="text-violet-300">{String(value)}</span></Leaf>
  }
  if (Array.isArray(value)) {
    const empty = value.length === 0
    return (
      <BranchLine
        label={label}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        summary={empty ? "[]" : `Array(${value.length})`}
        bracketOpen="["
        bracketClose="]"
      >
        {open && (
          <ul className="border-l border-mem-border pl-3">
            {value.map((item, idx) => (
              <li key={idx} className="my-0.5">
                <JsonNode value={item} depth={depth + 1} label={String(idx)} />
              </li>
            ))}
          </ul>
        )}
      </BranchLine>
    )
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    const empty = keys.length === 0
    return (
      <BranchLine
        label={label}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        summary={empty ? "{}" : `${keys.length} key${keys.length === 1 ? "" : "s"}`}
        bracketOpen="{"
        bracketClose="}"
      >
        {open && (
          <ul className="border-l border-mem-border pl-3">
            {keys.map((k) => (
              <li key={k} className="my-0.5">
                <JsonNode value={obj[k]} depth={depth + 1} label={k} />
              </li>
            ))}
          </ul>
        )}
      </BranchLine>
    )
  }
  return <Leaf label={label}>{String(value)}</Leaf>
}

function Leaf({
  label,
  children,
}: {
  label?: string
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-baseline gap-2">
      {label !== undefined && (
        <span className="text-mem-text-secondary">
          <span className="text-mem-text-muted">"</span>
          {label}
          <span className="text-mem-text-muted">"</span>:
        </span>
      )}
      <span className="break-all text-mem-text-primary">{children}</span>
    </span>
  )
}

function BranchLine({
  label,
  open,
  onToggle,
  summary,
  bracketOpen,
  bracketClose,
  children,
}: {
  label?: string
  open: boolean
  onToggle: () => void
  summary: string
  bracketOpen: string
  bracketClose: string
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="group inline-flex items-center gap-1 rounded text-left transition-colors hover:bg-white/[0.03]"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-mem-text-muted" />
        ) : (
          <ChevronRight className="h-3 w-3 text-mem-text-muted" />
        )}
        {label !== undefined && (
          <span className="text-mem-text-secondary">
            <span className="text-mem-text-muted">"</span>
            {label}
            <span className="text-mem-text-muted">"</span>:
          </span>
        )}
        <span className="text-mem-text-muted">{bracketOpen}</span>
        {!open && (
          <span className="text-mem-text-muted">
            {" "}{summary}{" "}
          </span>
        )}
        {!open && <span className="text-mem-text-muted">{bracketClose}</span>}
      </button>
      {open && children}
      {open && (
        <div className="text-mem-text-muted">{bracketClose}</div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                            Shiki (lazy-imported)                            */
/* -------------------------------------------------------------------------- */

interface ShikiBlockProps {
  json: string
}

function ShikiBlock({ json }: ShikiBlockProps) {
  const [html, setHtml] = React.useState<string | null>(null)
  const [errored, setErrored] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setHtml(null)
    setErrored(false)
    // Lazy-import per spec.
    void (async () => {
      try {
        const shiki = await import("shiki")
        if (cancelled) return
        const out = await shiki.codeToHtml(json, {
          lang: "json",
          theme: "github-dark-default",
        })
        if (!cancelled) setHtml(out)
      } catch {
        if (!cancelled) setErrored(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [json])

  if (errored) {
    return (
      <pre className="overflow-auto p-3 font-mono text-[12px] leading-relaxed text-mem-text-primary">
        {json}
      </pre>
    )
  }

  if (!html) {
    return (
      <div className="p-3">
        <div className="h-3 w-1/3 animate-pulse rounded bg-mem-surface-2" />
        <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-mem-surface-2" />
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-mem-surface-2" />
      </div>
    )
  }

  return (
    <div
      className="shiki-result text-[12px] [&>pre]:!m-0 [&>pre]:!bg-transparent [&>pre]:p-3"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*                                  helpers                                    */
/* -------------------------------------------------------------------------- */

function safeStringify(value: unknown): string {
  if (value === undefined) return ""
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
