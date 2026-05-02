"use client"
/**
 * Yellow-amber banner under page header when Time Machine is engaged.
 * "Back to now" clears `?at=` from URL.
 */
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft } from "lucide-react"
import { humanLabelFor, type TimeMachineValue } from "./time-machine"

interface Props {
  at: TimeMachineValue | null
}

export function TimeMachineBanner({ at }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()

  function backToNow() {
    const params = new URLSearchParams(search?.toString() ?? "")
    params.delete("at")
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <AnimatePresence>
      {at !== null && (
        <motion.div
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -6, height: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
          role="status"
          aria-live="polite"
        >
          <div className="mx-3 sm:mx-5 my-2 rounded-lg border border-mem-status-thinking/30 bg-mem-status-thinking/10 px-3 sm:px-4 py-2.5 flex items-center gap-3">
            <span className="font-mono text-[12px] sm:text-[13px] text-mem-text-primary flex items-center gap-2">
              <span aria-hidden>📜</span>
              <span>
                Showing memory as of{" "}
                <span className="text-mem-status-thinking font-semibold">
                  {humanLabelFor(at)}
                </span>
              </span>
            </span>
            <button
              onClick={backToNow}
              className="ml-auto h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md bg-mem-surface-2 border border-mem-border text-mem-text-secondary hover:text-mem-text-primary hover:border-mem-border-strong transition-colors text-[12px] font-medium"
            >
              <ArrowLeft size={12} />
              Back to now
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
