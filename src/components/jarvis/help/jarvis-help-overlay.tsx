"use client"

/**
 * Jarvis help overlay — the "press ?" shortcut cheatsheet.
 *
 * Listens globally for `?` key (without modifiers, when no input is focused)
 * and shows a route-scoped Radix Dialog with relevant keyboard shortcuts.
 * Esc closes. The pattern matches JarvisCmdkProvider.
 *
 * Mount once in (jarvis)/layout.tsx alongside the other providers.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import * as Dialog from "@radix-ui/react-dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { HelpCircle, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface HelpValue {
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
}

const HelpContext = createContext<HelpValue>({
  open: false,
  setOpen: () => {},
  toggle: () => {},
})

export const useJarvisHelp = (): HelpValue => useContext(HelpContext)

type Shortcut = { keys: string[]; label: string }

type ShortcutGroup = {
  title: string
  shortcuts: Shortcut[]
}

const GLOBAL_SHORTCUTS: ShortcutGroup = {
  title: "Anywhere",
  shortcuts: [
    { keys: ["?"], label: "Show this help" },
    { keys: ["⌘", "K"], label: "Command palette (Jarvis-scoped)" },
    { keys: ["⌘", "⇧", "K"], label: "Global command palette" },
    { keys: ["Esc"], label: "Close drawer / modal / overlay" },
  ],
}

const NAV_SHORTCUTS: ShortcutGroup = {
  title: "Navigation",
  shortcuts: [
    { keys: ["g", "m"], label: "Go to Memory" },
    { keys: ["g", "a"], label: "Go to Agents" },
    { keys: ["g", "t"], label: "Go to Terminals" },
    { keys: ["g", "p"], label: "Go to MCPs" },
    { keys: ["g", "w"], label: "Go to Workflows" },
    { keys: ["g", "o"], label: "Go to Observability" },
    { keys: ["g", "s"], label: "Go to System Status" },
    { keys: ["g", "."], label: "Go to Settings" },
  ],
}

const ROUTE_SHORTCUTS: Record<string, ShortcutGroup> = {
  "/jarvis/memory": {
    title: "Memory",
    shortcuts: [
      { keys: ["⌘", "S"], label: "Save current file" },
      { keys: ["F2"], label: "Rename selected file" },
      { keys: ["Del"], label: "Delete selected file (soft, 30d grace)" },
      { keys: ["⌘", "↑"], label: "Time Machine: snapshot back" },
      { keys: ["⌘", "↓"], label: "Time Machine: snapshot forward" },
    ],
  },
  "/jarvis/agents": {
    title: "Agents",
    shortcuts: [
      { keys: ["1"], label: "Switch to Agents tab" },
      { keys: ["2"], label: "Switch to Workflows tab" },
      { keys: ["3"], label: "Switch to Schedules tab" },
      { keys: ["4"], label: "Switch to Runs tab" },
      { keys: ["5"], label: "Switch to Health tab" },
    ],
  },
  "/jarvis/terminals": {
    title: "Terminals",
    shortcuts: [
      { keys: ["⌘", "Enter"], label: "Send chat → start session" },
      { keys: ["⌘", "K"], label: "Find a terminal slot" },
      { keys: ["Esc"], label: "Close terminal pane" },
    ],
  },
  "/jarvis/mcps": {
    title: "MCPs",
    shortcuts: [
      { keys: ["⌘", "F"], label: "Search tools" },
      { keys: ["⌘", "Enter"], label: "Run tool with current args" },
    ],
  },
  "/jarvis/workflows": {
    title: "Workflows",
    shortcuts: [
      { keys: ["Space"], label: "Drag canvas / pan" },
      { keys: ["⌘", "+"], label: "Zoom in" },
      { keys: ["⌘", "-"], label: "Zoom out" },
      { keys: ["⌘", "0"], label: "Fit view" },
    ],
  },
  "/jarvis/observability": {
    title: "Observability",
    shortcuts: [
      { keys: ["⌘", "⇧", "F"], label: "Fullscreen the VNC viewport" },
      { keys: ["Esc"], label: "Disconnect" },
    ],
  },
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const t = target as HTMLElement
  if (t.isContentEditable) return true
  const tag = t.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  return false
}

interface ProviderProps {
  children?: ReactNode
}

export function JarvisHelpOverlayProvider({ children }: ProviderProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname() ?? ""
  const isJarvis = pathname.startsWith("/jarvis")

  const toggle = useCallback(() => setOpen((v) => !v), [])

  useEffect(() => {
    if (!isJarvis) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key !== "?") return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      setOpen((v) => !v)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isJarvis])

  return (
    <HelpContext.Provider value={{ open, setOpen, toggle }}>
      {children}
      <JarvisHelpOverlay open={open} onOpenChange={setOpen} pathname={pathname} />
    </HelpContext.Provider>
  )
}

interface OverlayProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  pathname: string
}

function JarvisHelpOverlay({ open, onOpenChange, pathname }: OverlayProps) {
  const reduced = useReducedMotion() ?? false
  const routeGroup = useMemo<ShortcutGroup | null>(() => {
    // Match "/jarvis/<segment>" — ignore deeper segments
    const parts = pathname.split("/").filter(Boolean)
    if (parts.length < 2) return null
    const key = `/${parts[0]}/${parts[1]}`
    return ROUTE_SHORTCUTS[key] || null
  }, [pathname])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[81] w-[min(640px,92vw)] -translate-x-1/2 -translate-y-1/2 outline-none"
          aria-describedby={undefined}
        >
          <VisuallyHidden asChild>
            <Dialog.Title>Keyboard shortcuts</Dialog.Title>
          </VisuallyHidden>
          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden rounded-xl border border-mem-border-strong bg-mem-surface-1 shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-mem-border bg-mem-surface-2 px-5 py-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-mem-accent" />
                <h2 className="text-sm font-medium text-mem-text-primary">Keyboard shortcuts</h2>
                <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-mem-text-muted">
                  press ? anywhere · esc to close
                </span>
              </div>
              <Dialog.Close
                aria-label="Close help"
                className="rounded-md p-1 text-mem-text-muted transition hover:bg-mem-surface-3 hover:text-mem-text-primary"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </header>

            <div className="grid max-h-[70vh] grid-cols-1 gap-6 overflow-y-auto p-5 sm:grid-cols-2">
              <ShortcutColumn group={GLOBAL_SHORTCUTS} />
              <ShortcutColumn group={NAV_SHORTCUTS} />
              {routeGroup ? (
                <div className="sm:col-span-2">
                  <ShortcutColumn group={routeGroup} accent />
                </div>
              ) : null}
            </div>

            <footer className="flex items-center justify-between border-t border-mem-border bg-mem-surface-2 px-5 py-2.5">
              <span className="font-mono text-[10px] text-mem-text-muted">
                Customize at <span className="text-mem-text-secondary">/jarvis/settings#keyboard</span> (coming soon)
              </span>
              <span className="font-mono text-[10px] text-mem-text-muted">v1</span>
            </footer>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ShortcutColumn({ group, accent }: { group: ShortcutGroup; accent?: boolean }) {
  return (
    <div>
      <h3
        className={cn(
          "mb-3 font-mono text-[10px] uppercase tracking-[0.18em]",
          accent ? "text-mem-accent" : "text-mem-text-muted",
        )}
      >
        {group.title}
      </h3>
      <ul className="space-y-2">
        {group.shortcuts.map((s, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="text-sm text-mem-text-primary">{s.label}</span>
            <span className="flex shrink-0 items-center gap-1">
              {s.keys.map((k, j) => (
                <kbd
                  key={j}
                  className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-mem-border bg-mem-surface-3 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-mem-text-secondary shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]"
                >
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
