// Jarvis motion vocabulary
// All variants honor `prefers-reduced-motion` via the helper below — when reduced
// motion is set, transitions become instantaneous and movement collapses to opacity-only
// (or no-op) so the experience is still legible without visual churn.
//
// Other Wave 3 agents should import these directly:
//   import { enterJarvis, tabSwap } from "@/components/jarvis/motion/presets"
//   <motion.div {...enterJarvis}> ... </motion.div>

import type { Transition, Variants } from "framer-motion"

/**
 * Spring-like ease tuned to feel "macOS app launching" — quick-out, soft-land.
 * Same curve used by Tailwind's `mem-spring`.
 */
export const JARVIS_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1]

/**
 * Returns true if the current document/user prefers reduced motion.
 * Safe to call during SSR — returns false on the server.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** Wraps a transition; collapses to instant when reduced-motion is on. */
function rmTransition(t: Transition): Transition {
  if (prefersReducedMotion()) return { duration: 0 }
  return t
}

/* -------------------------------------------------------------------------- */
/*                                  Variants                                  */
/* -------------------------------------------------------------------------- */

/** Plays once when /jarvis mounts. Fade + faint scale-in (98 → 100). */
export const enterJarvis = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: rmTransition({ duration: 0.28, ease: JARVIS_EASE }),
}

/** Reverse of enterJarvis — used when stepping out of /jarvis (back to /agency). */
export const exitJarvis = {
  initial: { opacity: 1, scale: 1 },
  animate: { opacity: 0, scale: 1.02 },
  transition: rmTransition({ duration: 0.22, ease: JARVIS_EASE }),
}

/**
 * Tab/sub-route swap — 150ms slide-up (4px) + crossfade.
 * Used by the segmented control + bottom-dock active pill.
 */
export const tabSwap: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
}

/** Persona-flip transition: 280ms hue rotation + faint scale pop. */
export const personaFlip: Variants = {
  initial: { opacity: 0, rotateY: -12, filter: "hue-rotate(-30deg)" },
  animate: { opacity: 1, rotateY: 0, filter: "hue-rotate(0deg)" },
  exit: { opacity: 0, rotateY: 12, filter: "hue-rotate(30deg)" },
}

/**
 * Status dot pulse. 1.2s ease-in-out, infinite. Used on the header live dot
 * when a workflow run is active. Pause it (don't render) on reduced motion.
 */
export const statusPulse = {
  animate: prefersReducedMotion()
    ? { opacity: 1 }
    : { opacity: [0.5, 1, 0.5], scale: [1, 1.15, 1] },
  transition: prefersReducedMotion()
    ? { duration: 0 }
    : { duration: 1.2, ease: "easeInOut" as const, repeat: Infinity },
}

/** Default spring transition for layout components (sidebar collapse, etc.). */
export const jarvisSpring: Transition = rmTransition({
  type: "spring",
  stiffness: 400,
  damping: 32,
})

/** Default tween for tab swap (matches CSS transition-timing-function: mem-spring). */
export const tabSwapTransition: Transition = rmTransition({
  duration: 0.15,
  ease: JARVIS_EASE,
})

/** Default for personaFlip. */
export const personaFlipTransition: Transition = rmTransition({
  duration: 0.28,
  ease: JARVIS_EASE,
})
