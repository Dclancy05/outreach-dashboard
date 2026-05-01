"use client"

import dynamic from "next/dynamic"
import { useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Maximize2, Minimize2, X, TerminalSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTerminalsDrawer } from "./terminals-drawer-provider"

const TerminalsWorkspace = dynamic(
  () => import("./terminals-workspace").then((m) => m.TerminalsWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-zinc-500 text-sm">
        Loading terminals…
      </div>
    ),
  }
)

export function TerminalsDrawer() {
  const { isOpen, isMounted, isFullscreen, close, toggleFullscreen } = useTerminalsDrawer()

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, close])

  if (!isMounted) return null

  const widthClass = isFullscreen
    ? "w-full"
    : "w-full md:w-[60vw] md:max-w-[1200px] md:min-w-[640px]"

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="terminals-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
            onClick={close}
          />
          <motion.aside
            key="terminals-drawer-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.9 }}
            className={cn(
              "fixed right-0 top-0 z-[61] flex h-screen flex-col border-l border-zinc-800/80 bg-zinc-950 shadow-2xl",
              widthClass
            )}
            role="dialog"
            aria-label="Terminals workspace"
            aria-modal="false"
          >
            <header className="flex h-12 items-center justify-between border-b border-zinc-800/80 bg-zinc-950/95 px-4 shrink-0">
              <div className="flex items-center gap-2 text-zinc-200">
                <TerminalSquare className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-medium">Terminals</span>
                <span className="text-xs text-zinc-500 hidden sm:inline">— persistent VPS sessions</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleFullscreen}
                  className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
                  title={isFullscreen ? "Restore drawer" : "Fullscreen"}
                  aria-label={isFullscreen ? "Restore drawer" : "Fullscreen"}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button
                  onClick={close}
                  className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
                  title="Close (Esc) — sessions keep running on VPS"
                  aria-label="Close drawer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="flex-1 min-h-0">
              <TerminalsWorkspace />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
