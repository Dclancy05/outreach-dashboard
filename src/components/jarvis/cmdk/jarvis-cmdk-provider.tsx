"use client"

// Jarvis cmdk provider — owns open/close state and the path-scoped Cmd+K
// hotkey. Wraps the actual <JarvisCmdk /> dialog at the bottom of its tree
// so consumers only have to mount one component in the layout.
//
// Path scoping: Cmd+K opens this palette ONLY when pathname starts with
// "/jarvis". On other routes the global RememberPalette handles ⌘K
// (it gates itself with the same prefix check on its end).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"
import { JarvisCmdk } from "./jarvis-cmdk"

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

interface JarvisCmdkProviderProps {
  children?: ReactNode
}

export function JarvisCmdkProvider({ children }: JarvisCmdkProviderProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname() ?? ""
  const isJarvis = pathname.startsWith("/jarvis")

  const toggle = useCallback(() => setOpen((v) => !v), [])

  useEffect(() => {
    function isMacPlatform(): boolean {
      if (typeof navigator === "undefined") return false
      return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    }

    const onKey = (e: KeyboardEvent) => {
      const isMac = isMacPlatform()
      const trigger = isMac ? e.metaKey : e.ctrlKey
      if (!trigger) return

      // Plain Cmd+K (no shift): only inside /jarvis. Outside /jarvis the
      // global RememberPalette handles it.
      if (e.key.toLowerCase() === "k" && !e.shiftKey && isJarvis) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isJarvis])

  // If user navigates away from /jarvis while palette is open, close it so
  // the keystroke handler ownership transfers cleanly to RememberPalette.
  useEffect(() => {
    if (!isJarvis && open) setOpen(false)
  }, [isJarvis, open])

  return (
    <CmdkContext.Provider value={{ open, setOpen, toggle }}>
      {children}
      <JarvisCmdk open={open} onOpenChange={setOpen} />
    </CmdkContext.Provider>
  )
}
