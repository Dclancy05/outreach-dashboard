"use client"

/**
 * AgentMdEditor — opens an agent .md file from the vault and lets the user
 * Edit (textarea) OR Preview (rendered Markdown) the body.
 *
 * BUG-014 fix: The previous viewer's Edit/Preview tabs rendered both panels
 * at once or shared the same body, so toggling did nothing. Here we drive a
 * single `mode` state and render exactly one panel at a time. Switching is
 * an instant DOM swap — no layered z-index trickery.
 *
 * The body fed into this component is post-frontmatter (the strip above
 * already renders frontmatter as pills). When the user edits and saves,
 * we re-attach the original frontmatter block before persisting back to the
 * vault, so the file on disk keeps its YAML head.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { Eye, Pencil, Loader2, Save, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { SaveIndicator, type SaveState } from "@/components/memory/save-indicator"
import { parseAgentMd } from "./agent-frontmatter-strip"

const SAVE_DEBOUNCE_MS = 700

interface AgentMdEditorProps {
  /** Vault path of the agent file, e.g. "Jarvis/agent-skills/outreach-tester.md". */
  filePath: string
  /** Optional initial mode. */
  initialMode?: "edit" | "preview"
  /** Callback when the body changes (after save). */
  onSaved?: () => void
  /**
   * If true, also re-fires the parent's frontmatter parse callback. We do this
   * because edits can change the frontmatter too (the textarea contains the
   * whole post-fence body — but the user is welcome to write `---\n…\n---` of
   * their own at the top of the body and we'll respect it).
   */
  onParsed?: (parsed: ReturnType<typeof parseAgentMd>) => void
  className?: string
}

interface FileResponse {
  path: string
  content: string
  size: number
  updated_at: string
}

export function AgentMdEditor({
  filePath,
  initialMode = "preview",
  onSaved,
  onParsed,
  className,
}: AgentMdEditorProps) {
  const [mode, setMode] = useState<"edit" | "preview">(initialMode)
  const [rawFile, setRawFile] = useState<string>("")
  const [body, setBody] = useState<string>("")
  const [originalFrontmatterBlock, setOriginalFrontmatterBlock] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [dirty, setDirty] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef<AbortController | null>(null)

  /* ---- load ---- */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setDirty(false)

    fetch(`/api/memory-vault/file?path=${encodeURIComponent(filePath)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || `HTTP ${res.status}`)
        }
        return res.json() as Promise<FileResponse>
      })
      .then((data) => {
        if (cancelled) return
        const text = data.content || ""
        setRawFile(text)
        const parsed = parseAgentMd(text)
        // Cache the literal frontmatter block (including fences) so we can
        // re-attach it on save without round-tripping our parser's output.
        const m = /^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/.exec(text)
        setOriginalFrontmatterBlock(m ? m[1] : "")
        setBody(parsed.body)
        onParsed?.(parsed)
        setLastSavedAt(new Date(data.updated_at))
        setSaveState("idle")
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      inFlight.current?.abort()
    }
    // onParsed intentionally omitted; load only depends on the file path
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath])

  /* ---- save ---- */
  const persist = useCallback(
    async (nextBody: string) => {
      inFlight.current?.abort()
      const ctl = new AbortController()
      inFlight.current = ctl
      setSaveState("saving")
      const fullContent = originalFrontmatterBlock
        ? originalFrontmatterBlock + (originalFrontmatterBlock.endsWith("\n") ? "" : "\n") + nextBody
        : nextBody
      try {
        const res = await fetch("/api/memory-vault/file", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: filePath, content: fullContent }),
          signal: ctl.signal,
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || `HTTP ${res.status}`)
        }
        const data = await res.json()
        setLastSavedAt(new Date(data.updated_at || Date.now()))
        setSaveState("saved")
        setDirty(false)
        setRawFile(fullContent)
        onSaved?.()
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        setSaveState("error")
        toast.error("Save failed: " + (err as Error).message)
      }
    },
    [filePath, originalFrontmatterBlock, onSaved]
  )

  const onChange = useCallback(
    (next: string) => {
      setBody(next)
      setDirty(true)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => persist(next), SAVE_DEBOUNCE_MS)
    },
    [persist]
  )

  const onRevert = useCallback(() => {
    const parsed = parseAgentMd(rawFile)
    setBody(parsed.body)
    setDirty(false)
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
  }, [rawFile])

  if (loading) {
    return (
      <div className={cn("flex-1 flex items-center justify-center text-[12px] text-mem-text-muted", className)}>
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading {filePath.split("/").pop()}…
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn("flex-1 p-6", className)}>
        <div className="text-red-400 font-medium mb-1">Couldn&apos;t load this agent file</div>
        <div className="text-xs text-mem-text-muted break-all">{error}</div>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col flex-1 min-h-0", className)}>
      {/* Toolbar — Edit / Preview toggle + Save indicator */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-mem-border bg-mem-surface-1 shrink-0">
        <div
          role="tablist"
          aria-label="Editor mode"
          className="inline-flex h-8 rounded-md bg-mem-surface-2 border border-mem-border p-0.5 gap-0.5"
        >
          <button
            role="tab"
            aria-selected={mode === "edit"}
            onClick={() => setMode("edit")}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 h-7 rounded text-[12px] transition-colors",
              mode === "edit"
                ? "bg-mem-surface-3 text-mem-text-primary"
                : "text-mem-text-secondary hover:text-mem-text-primary"
            )}
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            role="tab"
            aria-selected={mode === "preview"}
            onClick={() => setMode("preview")}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 h-7 rounded text-[12px] transition-colors",
              mode === "preview"
                ? "bg-mem-surface-3 text-mem-text-primary"
                : "text-mem-text-secondary hover:text-mem-text-primary"
            )}
          >
            <Eye className="w-3.5 h-3.5" /> Preview
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <SaveIndicator state={saveState} lastSavedAt={lastSavedAt} />
          {dirty && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] text-mem-text-muted hover:text-mem-text-primary"
              onClick={onRevert}
              title="Revert unsaved edits"
            >
              <RotateCcw className="w-3 h-3 mr-1" /> Revert
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 text-[11px] bg-mem-accent text-white hover:brightness-110"
            onClick={() => persist(body)}
            disabled={saveState === "saving" || !dirty}
            title="Save now (Cmd+S)"
          >
            <Save className="w-3 h-3 mr-1" /> Save
          </Button>
        </div>
      </div>

      {/* Body — exactly ONE panel renders at a time. */}
      {mode === "edit" ? (
        <div className="flex-1 min-h-0 p-4">
          <Textarea
            value={body}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Write the agent's system prompt here…"
            className="h-full w-full font-mono text-sm resize-none bg-mem-surface-1 border-mem-border text-mem-text-primary"
            spellCheck={false}
            data-testid="agent-md-editor-textarea"
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4" data-testid="agent-md-editor-preview">
          <article className="prose prose-invert max-w-none text-sm prose-headings:font-semibold prose-h1:text-[20px] prose-h2:text-[16px] prose-h3:text-[14px] prose-code:text-mem-accent prose-a:text-mem-accent">
            <ReactMarkdown>{body || "_(no body content yet — click Edit to write the agent's system prompt.)_"}</ReactMarkdown>
          </article>
        </div>
      )}
    </div>
  )
}
