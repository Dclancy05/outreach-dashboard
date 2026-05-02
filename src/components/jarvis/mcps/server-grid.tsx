"use client"

// Responsive grid of MCP server cards.
//
// Breakpoints (matches W4.A.B2 spec):
//   < md (768)   → 1 col stack
//   md ─ lg      → 2 cols
//   lg+          → 3 cols
//
// The grid only handles layout + click routing. Loading + empty states are
// owned by mcps-page-shell.tsx so the orchestrator decides what to render.

import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { ServerCard } from "./server-card"
import { tabSwap, tabSwapTransition } from "@/components/jarvis/motion/presets"
import type { McpServer } from "@/lib/mcp/types"

interface ServerGridProps {
  servers: McpServer[]
  onSelect: (id: string) => void
  className?: string
}

export function ServerGrid({ servers, onSelect, className }: ServerGridProps) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      variants={reduced ? undefined : tabSwap}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={tabSwapTransition}
      className={cn(
        "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
      data-testid="mcps-server-grid"
    >
      {servers.map((s) => (
        <ServerCard key={s.id} server={s} onSelect={onSelect} />
      ))}
    </motion.div>
  )
}
