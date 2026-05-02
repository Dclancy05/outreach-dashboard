"use client"
/**
 * MemoryResumeChip — single-line "Resume /README.md →" replacement for the
 * stacked Welcome banner + Continue card on /agency/memory (BUG-010, BUG-019).
 *
 * Three flavors, picked in priority order (matches the legacy ContinueCard):
 *   1) "Resume run · ▶ <workflow>"   — there's a running workflow run
 *   2) "Continue /README.md · 5m ago" — last vault file opened < 24h
 *   3) "Open /README.md →"            — first-visit fallback, points at root
 *
 * Dismissable for the rest of the session via sessionStorage. Renders inline
 * (single row, ~36px tall) so it never blows out the top of the page on mobile.
 */
import * as React from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, X, PlayCircle, FileText } from "lucide-react"
import {
  dismissContinueCard,
  getLastFile,
  isContinueCardDismissed,
  relativeMinutesAgo,
  type LastFile,
} from "@/lib/last-file-tracker"

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

interface RunningRun {
  id: string
  workflow_name?: string
  workflow_emoji?: string | null
  status: string
}

type ChipKind =
  | { kind: "run"; run: RunningRun }
  | { kind: "file"; file: LastFile }
  | { kind: "first-visit" }

interface Props {
  /** Called when the user clicks the chip and it points at a vault file. */
  onSelect: (path: string) => void
}

export function MemoryResumeChip({ onSelect }: Props) {
  const [chip, setChip] = React.useState<ChipKind | null>(null)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (isContinueCardDismissed()) return
    let cancelled = false
    ;(async () => {
      // 1) running run
      try {
        const res = await fetch("/api/runs?status=running&limit=1", { cache: "no-store" })
        if (res.ok) {
          const j = await res.json()
          const run = (j.data || [])[0]
          if (!cancelled && run) {
            setChip({ kind: "run", run })
            setVisible(true)
            return
          }
        }
      } catch {
        /* ignore — fall through */
      }
      // 2) last file < 24h
      const f = getLastFile()
      if (!cancelled && f) {
        const age = Date.now() - f.openedAt.getTime()
        if (age <= TWENTY_FOUR_HOURS_MS) {
          setChip({ kind: "file", file: f })
          setVisible(true)
          return
        }
      }
      // 3) first-visit fallback
      if (!cancelled) {
        setChip({ kind: "first-visit" })
        setVisible(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  function handleDismiss() {
    dismissContinueCard()
    setVisible(false)
  }

  function handleOpenFile(path: string) {
    onSelect(path)
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && chip && (
        <motion.div
          initial={{ opacity: 0, height: 0, y: -4 }}
          animate={{ opacity: 1, height: "auto", y: 0 }}
          exit={{ opacity: 0, height: 0, y: -4 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
          role="region"
          aria-label="Resume work"
        >
          <div className="mx-3 sm:mx-5 mt-2 mb-1 flex items-center gap-2 h-9 px-3 rounded-lg border border-mem-border bg-gradient-to-r from-mem-accent/10 via-mem-surface-1 to-mem-surface-1 text-[12.5px]">
            {chip.kind === "run" ? (
              <PlayCircle size={13} className="text-mem-accent shrink-0" />
            ) : (
              <FileText size={13} className="text-mem-accent shrink-0" />
            )}

            {chip.kind === "run" ? (
              <Link
                href={`/agency/runs?run=${chip.run.id}`}
                className="truncate text-mem-text-primary font-medium hover:text-mem-accent transition-colors"
              >
                Resume run · {chip.run.workflow_emoji || "▶"}{" "}
                {chip.run.workflow_name || "workflow"}
              </Link>
            ) : chip.kind === "file" ? (
              <button
                onClick={() => handleOpenFile(chip.file.path)}
                className="truncate text-mem-text-primary hover:text-mem-accent transition-colors text-left"
              >
                <span className="font-medium">Resume</span>{" "}
                <span className="font-mono text-mem-text-secondary">{chip.file.path}</span>
                <span className="ml-2 text-mem-text-muted text-[11px]">
                  · {relativeMinutesAgo(chip.file.openedAt)}
                </span>
              </button>
            ) : (
              <button
                onClick={() => handleOpenFile("/README.md")}
                className="truncate text-mem-text-primary hover:text-mem-accent transition-colors text-left"
              >
                <span className="font-medium">Open</span>{" "}
                <span className="font-mono text-mem-text-secondary">/README.md</span>
                <span className="ml-2 text-mem-text-muted text-[11px]">
                  · welcome to your vault
                </span>
              </button>
            )}

            <ArrowRight size={12} className="text-mem-text-muted ml-auto shrink-0" />
            <button
              onClick={handleDismiss}
              aria-label="Dismiss resume chip"
              className="h-6 w-6 grid place-items-center rounded-md text-mem-text-muted hover:text-mem-text-primary hover:bg-mem-surface-3 transition-colors shrink-0"
            >
              <X size={11} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
