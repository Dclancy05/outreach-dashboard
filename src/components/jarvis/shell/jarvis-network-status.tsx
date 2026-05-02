"use client"

/**
 * Jarvis network-status banner — listens for `online`/`offline` events and
 * shows the user a friendly toast + sticky banner when their connection
 * drops or returns. Pairs with the friendly-errors helper so SWR/fetch
 * failures are framed correctly.
 *
 * Why a banner AND a toast:
 *  - Toast confirms the transition ("you went offline" / "you're back online")
 *  - Sticky banner persists while offline so the user doesn't forget why
 *    things look stale. Closes itself on reconnect.
 *
 * Mount once in (jarvis)/layout.tsx — the banner is fixed position so it
 * doesn't displace any content.
 */

import { useEffect, useState } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { WifiOff, Wifi } from "lucide-react"
import { toast } from "sonner"

export function JarvisNetworkStatus() {
  const reduced = useReducedMotion() ?? false
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return true
    return navigator.onLine
  })

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
      toast.success("Back online", {
        description: "Reconnected. Anything that errored should retry on the next click.",
        duration: 3000,
      })
    }
    function handleOffline() {
      setOnline(false)
      toast.error("You're offline", {
        description: "Save buttons will keep trying. We'll let you know when the connection is back.",
        duration: 6000,
      })
    }
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  return (
    <AnimatePresence>
      {!online ? (
        <motion.div
          initial={reduced ? false : { y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -8, opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="status"
          aria-live="polite"
          aria-label="You are currently offline"
          className="fixed left-1/2 top-2 z-[90] -translate-x-1/2 inline-flex items-center gap-2 rounded-full border border-mem-status-thinking/40 bg-mem-status-thinking/10 px-3 py-1.5 text-xs font-medium text-mem-status-thinking shadow-lg backdrop-blur-md"
        >
          <WifiOff className="h-3.5 w-3.5" />
          <span>Offline — changes will retry when you reconnect</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
