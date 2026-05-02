"use client"
/**
 * MemoryTopBar — the top bar of /jarvis/memory, sitting just below the
 * Jarvis shell's header (W3A's responsibility) and just above the 4-pane
 * layout.
 *
 * Contains:
 *   - Filter chips: All · Knowledge · Code · Conversations · Inbox folder
 *   - Right-side actions: Settings (gear), open Terminals (CMD+K hint can
 *     come later from W4B)
 *
 * Filter chip click contract:
 *   - Clicking "Inbox folder" calls `onSelectInboxFolder` (wires to the vault
 *     tree's /Inbox scope) — it does NOT open the bell drawer (BUG-003/011).
 *   - Other chips call `onChange(id)` as usual.
 */
import * as React from "react"
import { Settings as SettingsIcon, TerminalSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FilterChips, type FilterId } from "@/components/memory/filter-chips"

interface Props {
  filter: FilterId
  onChange: (id: FilterId) => void
  onSelectInboxFolder: () => void
  onOpenSettings: () => void
  onOpenTerminals?: () => void
  /** Optional secondary toggle when Code filter is active (Pages/Files). */
  rightSlot?: React.ReactNode
}

export function MemoryTopBar({
  filter, onChange, onSelectInboxFolder, onOpenSettings, onOpenTerminals, rightSlot,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 sm:px-5 py-2 border-b border-mem-border bg-mem-surface-1/50 backdrop-blur-sm shrink-0">
      <FilterChips
        value={filter}
        onChange={onChange}
        onSelectInboxFolder={onSelectInboxFolder}
      />
      {rightSlot}
      <div className="ml-auto flex items-center gap-1">
        {onOpenTerminals && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenTerminals}
            className="h-8 w-8 p-0 text-mem-text-secondary hover:text-mem-accent hover:bg-mem-accent/10"
            title="Open Terminals"
            aria-label="Open Terminals"
          >
            <TerminalSquare className="w-4 h-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenSettings}
          className="h-8 w-8 p-0 text-mem-text-secondary hover:text-mem-text-primary"
          title="Memory settings"
          aria-label="Memory settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
