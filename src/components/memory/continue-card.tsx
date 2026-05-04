"use client"
/**
 * Sticky card above the welcome banner. Three flavors:
 *   1) "Continue editing <file>"        — last vault file opened < 24h ago
 *   2) "Resume run #<n>"                — there's a running workflow run
 *   3) "Reattach to terminal"           — there's a terminal_session.last_activity_at < 1h
 *
 * Priority: running run > recent terminal > last file. Whichever is "freshest"
 * wins. The card is dismissable for the rest of the session.
 *
 * Wires to:
 *   GET /api/runs?status=running&limit=1
 *   localStorage (vault_last_file_path / vault_last_opened_at)
 *
 * Note: terminal session lookup is best-effort — terminal-server source of truth
 * is on the VPS; we just check the dashboard's last-known last_activity_at.
 */
import * as React from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { Home, ArrowRight, X, PlayCircle, TerminalSquare } from "lucide-react"
import {
  dismissContinueCard,
  getLastFile,
  isContinueCardDismissed,
  relativeMinutesAgo,
  type LastFile,
} from "@/lib/last-file-tracker"

interface Props {
  onSelect: (path: string) => void
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

interface RunningRun {
  id: string
  workflow_name?: string
  workflow_emoji?: string | null
  status: string
}

type CardKind =
  | { kind: "run"; run: RunningRun }
  | { kind: "file"; file: LastFile }
  | null

export function ContinueCard({ onSelect }: Props) {
  const [card, setCard] = React.useState<CardKind>(null)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (isContinueCardDismissed()) return
    let cancelled = false
    ;(async () => {
      // 1) running workflow run takes priority
      try {
        const res = await fetch("/api/runs?status=running&limit=1", { cache: "no-store" })
        if (res.ok) {
          const j = await res.json()
          const run = (j.data || [])[0]
          if (!cancelled && run) {
            setCard({ kind: "run", run })
            setVisible(true)
            return
          }
        }
      } catch {
        /* ignore — fall through to file */
      }
      // 2) last vault file < 24h
      const f = getLastFile()
      if (!f || cancelled) return
      const age = Date.now() - f.openedAt.getTime()
      if (age > TWENTY_FOUR_HOURS_MS) return
      setCard({ kind: "file", file: f })
      setVisible(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function handleDismiss() {
    dismissContinueCard()
    setVisible(false)
  }

  function handleContinue() {
    if (card?.kind === "file") {
      onSelect(card.file.path)
      setVisible(false)
    }
  }

  return (
    <AnimatePresence>
      {visible && card && (
        <motion.div
          initial={{ opacity: 0, height: 0, y: -6 }}
          animate={{ opacity: 1, height: "auto", y: 0 }}
          exit={{ opacity: 0, height: 0, y: -6 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
          role="region"
          aria-label="Continue where you left off"
        >
          <div className="mx-3 sm:mx-6 mt-3 mb-1 rounded-xl border border-mem-accent/30 bg-gradient-to-r from-mem-accent/10 via-mem-surface-1 to-mem-surface-1 px-3 sm:px-4 py-3 flex items-center gap-3">
            <div
              aria-hidden
              className="shrink-0 h-9 w-9 rounded-lg bg-mem-surface-2 border border-mem-border grid place-items-center"
            >
              {card.kind === "run" ? (
                <PlayCircle size={16} className="text-mem-accent" />
              ) : (
                <Home size={16} className="text-mem-accent" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {card.kind === "run" ? (
                <>
                  <p className="text-[13px] font-semibold text-mem-text-primary leading-tight">
                    Resume run · {card.run.workflow_emoji || "▶"}{" "}
                    {card.run.workflow_name || "workflow"}
                  </p>
                  <p className="mt-0.5 font-mono text-[11.5px] text-mem-text-muted truncate">
                    Run #{String(card.run.id).slice(0, 8)} — currently running
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[13px] font-semibold text-mem-text-primary leading-tight">
                    Continue where you left off
                  </p>
                  <p className="mt-0.5 font-mono text-[11.5px] text-mem-text-muted truncate">
                    {card.file.path}
                    <span className="ml-2 text-mem-text-muted/70">
                      · {relativeMinutesAgo(card.file.openedAt)}
                    </span>
                  </p>
                </>
              )}
            </div>
            {card.kind === "run" ? (
              <Link
                href={`/agency/runs/${card.run.id}`}
                className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg bg-mem-accent text-white text-[12.5px] font-semibold hover:brightness-110 hover:shadow-[0_0_18px_rgba(124,92,255,0.3)] transition-all"
              >
                View run
                <ArrowRight size={13} />
              </Link>
            ) : (
              <button
                onClick={handleContinue}
                className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg bg-mem-accent text-white text-[12.5px] font-semibold hover:brightness-110 hover:shadow-[0_0_18px_rgba(124,92,255,0.3)] transition-all"
              >
                Continue
                <ArrowRight size={13} />
              </button>
            )}
            <button
              onClick={handleDismiss}
              aria-label="Dismiss continue card"
              className="h-8 w-8 grid place-items-center rounded-lg text-mem-text-muted hover:text-mem-text-primary hover:bg-mem-surface-3 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Re-export for callers that want to render a static "Reattach to terminal" link
// from elsewhere (eg. terminals page header). Not used on the main page yet.
export function ReattachTerminalChip() {
  return (
    <Link
      href="/agency/terminals"
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-mem-surface-2 border border-mem-border text-mem-text-secondary text-[12px] hover:text-mem-text-primary hover:border-mem-border-strong transition-colors"
    >
      <TerminalSquare size={12} />
      Reattach terminal
    </Link>
  )
}
