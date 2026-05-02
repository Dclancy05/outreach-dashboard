"use client"

// Cmd+K stub. W4B replaces the dialog body with the real palette behavior;
// this file is the stable mount point + global hotkey listener.
//
// Exposes `useJarvisCmdk()` so the header search button can call open() without
// importing the dialog itself.

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Search } from "lucide-react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

interface CmdkValue {
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
}

const CmdkContext = createContext<CmdkValue>({
  open: false,
  setOpen: () => {},
  toggle: () => {},
})

export const useJarvisCmdk = (): CmdkValue => useContext(CmdkContext)

interface JarvisCmdkStubProps {
  children?: ReactNode
}

export function JarvisCmdkProvider({ children }: JarvisCmdkStubProps) {
  const [open, setOpen] = useState(false)

  const toggle = useCallback(() => setOpen((v) => !v), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac =
        typeof navigator !== "undefined" &&
        /Mac|iPhone|iPad|iPod/.test(navigator.platform)
      const trigger = isMac ? e.metaKey : e.ctrlKey
      if (trigger && e.key.toLowerCase() === "k") {
        e.preventDefault()
        // eslint-disable-next-line no-console
        console.log("cmdk")
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <CmdkContext.Provider value={{ open, setOpen, toggle }}>
      {children}
      <JarvisCmdkDialog open={open} onOpenChange={setOpen} />
    </CmdkContext.Provider>
  )
}

interface JarvisCmdkDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

function JarvisCmdkDialog({ open, onOpenChange }: JarvisCmdkDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-mem-border bg-mem-surface-1 p-0">
        <div className="flex items-center gap-3 border-b border-mem-border px-4 py-3">
          <Search className="h-4 w-4 text-mem-text-muted" />
          <input
            autoFocus
            placeholder="Search Jarvis…"
            aria-label="Search Jarvis"
            className="flex-1 bg-transparent text-sm text-mem-text-primary outline-none placeholder:text-mem-text-muted"
            onChange={() => {
              /* W4B fills this in. */
            }}
          />
          <kbd className="rounded border border-mem-border px-1.5 py-0.5 font-mono text-[10px] text-mem-text-muted">
            esc
          </kbd>
        </div>
        <div className="px-4 py-8 text-center text-xs text-mem-text-muted">
          Command palette coming online…
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Header search-bar opener. Renders as a fake input bar that opens the dialog
 * when clicked. W4B will replace internals; the API stays stable.
 */
interface JarvisCmdkOpenerProps {
  className?: string
}

export function JarvisCmdkOpener({ className }: JarvisCmdkOpenerProps) {
  const { setOpen } = useJarvisCmdk()
  return (
    <button
      type="button"
      onClick={() => {
        // eslint-disable-next-line no-console
        console.log("cmdk")
        setOpen(true)
      }}
      aria-label="Open command palette"
      className={
        "group flex h-9 w-full max-w-[420px] items-center gap-2.5 rounded-md border border-mem-border bg-mem-surface-2 px-3 text-left text-xs text-mem-text-muted transition-colors hover:border-mem-border-strong hover:bg-mem-surface-3 focus:outline-none focus:ring-1 focus:ring-mem-accent " +
        (className ?? "")
      }
    >
      <Search className="h-3.5 w-3.5" />
      <span className="flex-1 truncate">Search or jump to anything…</span>
      <kbd className="rounded border border-mem-border bg-mem-bg px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-mem-text-muted">
        ⌘K
      </kbd>
    </button>
  )
}
