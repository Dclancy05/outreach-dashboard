"use client"

import { motion, AnimatePresence } from "framer-motion"
import { ChevronLeft, TerminalSquare } from "lucide-react"
import { useTerminalsDrawer } from "./terminals-drawer-provider"

export function TerminalsRailTab() {
  const { isOpen, open } = useTerminalsDrawer()

  return (
    <AnimatePresence>
      {!isOpen && (
        <motion.button
          key="terminals-rail-tab"
          type="button"
          onClick={open}
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 360, damping: 28 }}
          className="group fixed right-0 top-1/2 z-[55] -translate-y-1/2 flex flex-col items-center gap-1.5 rounded-l-lg border border-r-0 border-zinc-800/80 bg-zinc-900/90 px-1.5 py-3 text-cyan-300 shadow-lg backdrop-blur hover:bg-zinc-800/90 hover:text-cyan-200 hover:px-2 transition-[padding,background-color,color]"
          title="Open Terminals — persistent VPS sessions"
          aria-label="Open Terminals drawer"
        >
          <TerminalSquare className="h-4 w-4" />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 group-hover:text-cyan-200"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Terminals
          </span>
          <ChevronLeft className="h-3.5 w-3.5 text-zinc-500 group-hover:text-cyan-200 transition-transform group-hover:-translate-x-0.5" />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
