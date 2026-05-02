/**
 * Friendly error helpers — convert raw Error / fetch responses into
 * non-technical user-facing messages and Sonner toasts.
 *
 * Use these instead of raw `toast.error(err.message)` so the user sees a
 * consistent voice and never gets "TypeError: Cannot read property" copy.
 */

import { toast } from "sonner"

export type ErrorTone = "network" | "auth" | "server" | "limit" | "validation" | "unknown"

export interface FriendlyError {
  tone: ErrorTone
  title: string
  description: string
}

/**
 * Classify an Error or fetch Response into a friendly message.
 * Pass the raw error first; if you have an HTTP status code, pass it as well.
 */
export function friendly(err: unknown, status?: number): FriendlyError {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()

  // HTTP status takes precedence
  if (status !== undefined) {
    if (status === 401 || status === 403) {
      return {
        tone: "auth",
        title: "Session expired",
        description: "PIN in again from /admin and try this action once more.",
      }
    }
    if (status === 429) {
      return {
        tone: "limit",
        title: "Too many requests",
        description: "Slow down a sec — wait 10 seconds and try again.",
      }
    }
    if (status >= 500 && status < 600) {
      return {
        tone: "server",
        title: "Server hiccup",
        description: "Try again in a moment. /jarvis/status shows what's up.",
      }
    }
    if (status >= 400 && status < 500) {
      return {
        tone: "validation",
        title: "Couldn't process that",
        description: msg || "The request didn't pass validation.",
      }
    }
  }

  // Fall back to message-based classification
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("offline") || msg.includes("aborted")) {
    return {
      tone: "network",
      title: "Network's wobbly",
      description: "Check your wifi/VPN. We'll retry automatically when you're back online.",
    }
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return {
      tone: "network",
      title: "That took too long",
      description: "The server didn't respond in time. Try again.",
    }
  }
  if (msg.includes("unauthor") || msg.includes("forbidden")) {
    return {
      tone: "auth",
      title: "Session expired",
      description: "PIN in again and retry.",
    }
  }
  return {
    tone: "unknown",
    title: "Something went sideways",
    description: msg || "Unknown error. The technical details are in the console if you need them.",
  }
}

/**
 * Show a friendly error toast. Replaces ad-hoc `toast.error(err.message)`.
 *
 * Usage:
 *   try { await action() }
 *   catch (e) { toastError(e, "Couldn't save the file") }
 */
export function toastError(err: unknown, prefix?: string, status?: number) {
  const f = friendly(err, status)
  toast.error(prefix ? `${prefix}: ${f.title}` : f.title, {
    description: f.description,
    duration: f.tone === "network" ? 4000 : 6000,
  })
}

/**
 * Show a friendly success toast with consistent voice.
 */
export function toastSuccess(title: string, description?: string) {
  toast.success(title, {
    description,
    duration: 3000,
  })
}

/**
 * Wrap a fetch with automatic friendly-error toast on failure. Throws the
 * original error so callers can still react to specific error shapes.
 */
export async function fetchWithToast(
  input: RequestInfo | URL,
  init?: RequestInit,
  errorPrefix?: string,
): Promise<Response> {
  try {
    const res = await fetch(input, init)
    if (!res.ok) {
      let body = ""
      try {
        body = await res.clone().text()
      } catch {}
      const err = new Error(body || `HTTP ${res.status}`)
      toastError(err, errorPrefix, res.status)
      throw err
    }
    return res
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("HTTP ")) {
      // Already toasted above
      throw e
    }
    toastError(e, errorPrefix)
    throw e
  }
}
