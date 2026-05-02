"use client"

/**
 * Reusable saved-views bar. Renders a horizontal pill row of saved views
 * (click to load) plus a "Save view" button (prompts for name).
 *
 * Pages that have URL-synced filters use `useSavedViews` from
 * `lib/jarvis/saved-views.ts` to get the data; this component handles the
 * UI.
 */

import { useState } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { BookmarkPlus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SavedView } from "@/lib/jarvis/saved-views"

interface Props<S extends Record<string, unknown>> {
  views: SavedView<S>[]
  onSave: (name: string) => void
  onLoad: (id: string) => void
  onDelete: (id: string) => void
  className?: string
}

export function SavedViewsBar<S extends Record<string, unknown>>({
  views,
  onSave,
  onLoad,
  onDelete,
  className,
}: Props<S>) {
  const reduced = useReducedMotion() ?? false
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  function commit() {
    if (!name.trim()) {
      setNaming(false)
      return
    }
    onSave(name.trim())
    setName("")
    setNaming(false)
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} aria-label="Saved views">
      {views.length > 0 ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-mem-text-muted">
          Views
        </span>
      ) : null}
      <AnimatePresence initial={false}>
        {views.map((v) => (
          <motion.div
            key={v.id}
            initial={reduced ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="group relative inline-flex items-center"
          >
            <button
              type="button"
              onClick={() => onLoad(v.id)}
              title={`Load ${v.name}`}
              className="rounded-full border border-mem-border bg-mem-surface-1 px-3 py-1 text-[12px] text-mem-text-secondary transition hover:border-mem-border-strong hover:bg-mem-surface-2 hover:text-mem-text-primary"
            >
              {v.name}
            </button>
            <button
              type="button"
              aria-label={`Delete ${v.name}`}
              onClick={() => setConfirmDeleteId(v.id)}
              className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-mem-text-muted opacity-0 transition group-hover:opacity-100 hover:bg-mem-status-stuck/20 hover:text-mem-status-stuck"
            >
              <X className="h-3 w-3" />
            </button>
            {confirmDeleteId === v.id ? (
              <span className="ml-1 rounded-md border border-mem-status-stuck/40 bg-mem-status-stuck/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-mem-status-stuck">
                <button onClick={() => { onDelete(v.id); setConfirmDeleteId(null) }} className="hover:underline">
                  delete?
                </button>
                {" · "}
                <button onClick={() => setConfirmDeleteId(null)} className="text-mem-text-secondary hover:underline">cancel</button>
              </span>
            ) : null}
          </motion.div>
        ))}
      </AnimatePresence>

      {naming ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-mem-accent/40 bg-mem-surface-2 px-2 py-0.5 ring-1 ring-mem-accent/20">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit()
              if (e.key === "Escape") setNaming(false)
            }}
            placeholder="View name…"
            className="w-32 bg-transparent text-[12px] text-mem-text-primary placeholder:text-mem-text-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={commit}
            className="font-mono text-[10px] uppercase tracking-wider text-mem-accent hover:underline"
          >
            save
          </button>
          <button
            type="button"
            onClick={() => setNaming(false)}
            className="font-mono text-[10px] uppercase tracking-wider text-mem-text-muted hover:underline"
          >
            cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="inline-flex items-center gap-1 rounded-full border border-mem-border bg-mem-surface-1 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-mem-text-secondary transition hover:border-mem-border-strong hover:bg-mem-surface-2 hover:text-mem-text-primary"
        >
          <BookmarkPlus className="h-3 w-3" />
          Save view
        </button>
      )}
    </div>
  )
}
