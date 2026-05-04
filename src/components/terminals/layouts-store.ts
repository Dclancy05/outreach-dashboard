/**
 * Layouts persistence — Phase 4 #10.
 *
 * Saves the user's grid layout (which sessions are visible, in what order, at
 * what tile size 1/4/9/16) to localStorage under a versioned key. Lets the
 * user "Save layout as…" by name and "Load layout" later.
 *
 * Trivial JSON shape; no backend yet (single-user dashboard, the localStorage
 * is fine). When user-scoping arrives in Phase 5+, lift this into the
 * `terminal_layouts` table the original plan called for.
 */
const LS_KEY = "terminals.layouts.v1"
const LS_CURRENT = "terminals.currentLayout.v1"

export type LayoutSize = 1 | 4 | 9 | 16

export interface SavedLayout {
  name: string
  size: LayoutSize
  /** Session ids in slot order. Ids that no longer exist are filtered on load. */
  visibleIds: string[]
  /** When this layout was last written, ISO. */
  savedAt: string
}

interface CurrentLayout {
  size: LayoutSize
  visibleIds: string[]
  /** Updated whenever the layout changes — purely informational. */
  updatedAt: string
}

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / serialisation — ignore */
  }
}

export function listLayouts(): SavedLayout[] {
  return read<SavedLayout[]>(LS_KEY) || []
}

export function saveLayout(layout: SavedLayout): SavedLayout[] {
  const all = listLayouts().filter((l) => l.name !== layout.name)
  all.push(layout)
  all.sort((a, b) => a.name.localeCompare(b.name))
  write(LS_KEY, all)
  return all
}

export function deleteLayout(name: string): SavedLayout[] {
  const all = listLayouts().filter((l) => l.name !== name)
  write(LS_KEY, all)
  return all
}

export function readCurrentLayout(): CurrentLayout | null {
  return read<CurrentLayout>(LS_CURRENT)
}

export function writeCurrentLayout(size: LayoutSize, visibleIds: string[]): void {
  write<CurrentLayout>(LS_CURRENT, {
    size,
    visibleIds,
    updatedAt: new Date().toISOString(),
  })
}
