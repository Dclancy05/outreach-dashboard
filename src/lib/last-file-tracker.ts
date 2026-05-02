/**
 * Tiny localStorage helpers for the "Continue where you left off" card on
 * /agency/memory. Mirrors the API of the prototype's last-file-tracker.
 *
 * - `vault_last_file_path` (localStorage) — the most-recently-opened file
 * - `vault_last_opened_at` (localStorage) — ISO timestamp of that open
 * - `continue_card_dismissed` (sessionStorage) — set when the user X's the card
 */

const PATH_KEY = "vault_last_file_path"
const OPENED_AT_KEY = "vault_last_opened_at"
const DISMISSED_KEY = "continue_card_dismissed"

export interface LastFile {
  path: string
  openedAt: Date
}

export function recordFileOpen(path: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(PATH_KEY, path)
    window.localStorage.setItem(OPENED_AT_KEY, new Date().toISOString())
  } catch {
    /* private mode / quota — fall through */
  }
}

export function getLastFile(): LastFile | null {
  if (typeof window === "undefined") return null
  try {
    const path = window.localStorage.getItem(PATH_KEY)
    const opened = window.localStorage.getItem(OPENED_AT_KEY)
    if (!path || !opened) return null
    const date = new Date(opened)
    if (Number.isNaN(date.getTime())) return null
    return { path, openedAt: date }
  } catch {
    return null
  }
}

export function dismissContinueCard(): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(DISMISSED_KEY, "1")
  } catch {
    /* ignore */
  }
}

export function isContinueCardDismissed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) === "1"
  } catch {
    return false
  }
}

/** Format a relative "X minutes ago" string. */
export function relativeMinutesAgo(when: Date): string {
  const sec = Math.max(0, Math.floor((Date.now() - when.getTime()) / 1000))
  if (sec < 60) return "just now"
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`
  const d = Math.floor(hr / 24)
  return `${d} day${d === 1 ? "" : "s"} ago`
}
