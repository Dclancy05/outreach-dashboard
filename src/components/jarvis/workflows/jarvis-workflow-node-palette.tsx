"use client"

/**
 * JarvisWorkflowNodePalette — left rail (180px) of the builder. Lists every
 * node type from the legacy PALETTE in /agent-workflows/workflows/nodes.tsx.
 *
 * Two interaction modes:
 *   1. Click  → adds a node at a default offset (mirrors the legacy click-add).
 *   2. Drag   → user can drag onto the canvas. Today the canvas doesn't yet
 *               wire onDrop / onDragOver, so the visual affordance is in place
 *               but the actual landing-position behaviour falls back to the
 *               click-add pathway. Follow-up: wire native xyflow drag-onto-pane.
 *
 * No new node TYPES are introduced here — we strictly reuse PALETTE so the
 * palette stays in sync with whatever the legacy /agency builder shows.
 */

import * as React from "react"
import {
  PALETTE,
  type NODE_TYPES,
} from "@/components/agent-workflows/workflows/nodes"
import { cn } from "@/lib/utils"

interface JarvisWorkflowNodePaletteProps {
  onAdd: (type: keyof typeof NODE_TYPES) => void
}

export function JarvisWorkflowNodePalette({
  onAdd,
}: JarvisWorkflowNodePaletteProps) {
  return (
    <aside
      className="hidden md:flex flex-col w-[180px] shrink-0 border-r border-mem-border bg-mem-surface-1"
      aria-label="Workflow node palette"
    >
      <div className="px-3 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-mem-text-muted">
        Add node
      </div>
      <div className="flex flex-col gap-0.5 px-2 pb-3 overflow-auto">
        {PALETTE.map((p) => (
          <button
            key={p.type}
            type="button"
            onClick={() => onAdd(p.type)}
            draggable
            onDragStart={(e) => {
              // Provide a payload for canvas drop support landing in a
              // follow-up wave. The basic click-to-add is the supported path.
              e.dataTransfer.setData(
                "application/x-jarvis-node-type",
                p.type
              )
              e.dataTransfer.effectAllowed = "move"
            }}
            title={p.help}
            className={cn(
              "group flex items-center gap-2 rounded-md px-2 py-2 text-left text-[12px]",
              "text-mem-text-secondary hover:text-mem-text-primary",
              "hover:bg-mem-surface-2 active:bg-mem-surface-3",
              "border border-transparent hover:border-mem-border",
              "transition-colors cursor-grab active:cursor-grabbing"
            )}
            data-testid={`jarvis-palette-${p.type}`}
          >
            <span
              className={cn(
                "w-7 h-7 rounded flex items-center justify-center shrink-0 bg-mem-surface-2 group-hover:bg-mem-surface-3"
              )}
              aria-hidden="true"
            >
              <span className="text-mem-text-secondary group-hover:text-mem-text-primary">
                {p.icon}
              </span>
            </span>
            <span className="flex-1 min-w-0 truncate">{p.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-auto px-3 py-2 border-t border-mem-border text-[10px] text-mem-text-muted leading-snug">
        Click to add. Drag soon.
      </div>
    </aside>
  )
}
