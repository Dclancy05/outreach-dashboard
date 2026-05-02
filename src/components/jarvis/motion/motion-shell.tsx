"use client"

// MotionShell wraps the Jarvis canvas and runs `enterJarvis` exactly once on first
// mount. We deliberately use a stateful flag (rather than `key={pathname}`) so
// route navigations *inside* /jarvis don't re-trigger the launch animation —
// only the boundary into /jarvis from elsewhere does.

import { motion, useReducedMotion } from "framer-motion"
import { useEffect, useState, type ReactNode } from "react"
import { enterJarvis } from "./presets"

interface MotionShellProps {
  children: ReactNode
}

export function MotionShell({ children }: MotionShellProps) {
  const reduced = useReducedMotion()
  const [hasEntered, setHasEntered] = useState(false)

  useEffect(() => {
    // Mark the entry animation as consumed after first paint.
    const id = requestAnimationFrame(() => setHasEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  if (reduced) {
    // Honor reduced-motion: render statically, no transform/opacity work.
    return <div className="contents">{children}</div>
  }

  return (
    <motion.div
      initial={hasEntered ? false : enterJarvis.initial}
      animate={enterJarvis.animate}
      transition={enterJarvis.transition}
      className="contents"
    >
      {children}
    </motion.div>
  )
}
