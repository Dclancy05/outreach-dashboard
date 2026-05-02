"use client"
/**
 * MemoryEmptyFolder — drop-zone hint for empty vault folders (e.g. /Inbox).
 *
 * Renders inside the editor pane when the user filters to a folder that has
 * no files yet. Friendly copy + a primary CTA. The drag-drop wiring itself
 * happens in the tree (via dnd-kit) — this is purely presentational.
 */
import * as React from "react"
import { motion } from "framer-motion"
import { Inbox, FilePlus } from "lucide-react"

interface Props {
  /** Folder name to show in the header, e.g. "Inbox" or "Conversations". */
  folder: string
  /** Friendly explanation under the title. */
  hint?: string
  /** Optional click handler for the primary CTA (e.g. open New File dialog). */
  onCreate?: () => void
}

export function MemoryEmptyFolder({
  folder,
  hint = "Drop files here, or create a new note. The AI will pick it up automatically.",
  onCreate,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="h-full flex flex-col items-center justify-center text-center px-6"
    >
      <div className="h-14 w-14 rounded-2xl bg-mem-surface-2 border border-mem-border grid place-items-center mb-4">
        <Inbox className="h-6 w-6 text-mem-accent" />
      </div>
      <h3 className="text-mem-text-primary text-[15px] font-semibold tracking-tight">
        {folder} is empty
      </h3>
      <p className="mt-2 max-w-sm text-[12.5px] text-mem-text-secondary leading-relaxed">
        {hint}
      </p>
      {onCreate && (
        <button
          onClick={onCreate}
          className="mt-5 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-mem-accent text-white text-[12.5px] font-semibold hover:brightness-110 hover:shadow-[0_0_18px_rgba(124,92,255,0.3)] transition-all"
        >
          <FilePlus size={13} />
          New file in {folder}
        </button>
      )}
    </motion.div>
  )
}
