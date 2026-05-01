"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

type TerminalsDrawerContext = {
  isOpen: boolean
  isMounted: boolean
  isFullscreen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  toggleFullscreen: () => void
}

const Ctx = createContext<TerminalsDrawerContext | null>(null)

export function TerminalsDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const open = useCallback(() => {
    setIsMounted(true)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => setIsOpen(false), [])

  const toggle = useCallback(() => {
    setIsMounted((m) => m || true)
    setIsOpen((o) => !o)
  }, [])

  const toggleFullscreen = useCallback(() => setIsFullscreen((f) => !f), [])

  const value = useMemo<TerminalsDrawerContext>(
    () => ({ isOpen, isMounted, isFullscreen, open, close, toggle, toggleFullscreen }),
    [isOpen, isMounted, isFullscreen, open, close, toggle, toggleFullscreen]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTerminalsDrawer(): TerminalsDrawerContext {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error("useTerminalsDrawer must be used inside <TerminalsDrawerProvider>")
  }
  return ctx
}
