/**
 * Saved-views infrastructure for /jarvis/* pages with filters.
 *
 * A "view" is a named snapshot of arbitrary filter state — typically
 * URL-synced filters (search, facets, sort). Pages register a scope (their
 * own pathname) and the hook returns CRUD ops scoped to that page.
 *
 * Storage: localStorage under `jarvis:views:<scope>` as a JSON array.
 *
 * Usage on a page:
 *
 *   const { views, currentState, saveCurrent, loadView, deleteView } =
 *     useSavedViews({
 *       scope: "audit",
 *       state: { search, actionFilter, resourceFilter },
 *       apply: (s) => {
 *         setSearch(s.search ?? "")
 *         setActionFilter(s.actionFilter ?? "")
 *         setResourceFilter(s.resourceFilter ?? "")
 *       },
 *     })
 *
 *   <SavedViewsBar
 *     views={views} onSave={saveCurrent} onLoad={loadView} onDelete={deleteView}
 *   />
 */

import { useCallback, useEffect, useState } from "react"

export interface SavedView<S extends Record<string, unknown>> {
  id: string
  name: string
  state: S
  created_at: string
}

interface UseSavedViewsArgs<S extends Record<string, unknown>> {
  scope: string
  state: S
  apply: (state: S) => void
}

function storageKey(scope: string): string {
  return `jarvis:views:${scope}`
}

function readViews<S extends Record<string, unknown>>(scope: string): SavedView<S>[] {
  if (typeof localStorage === "undefined") return []
  try {
    const raw = localStorage.getItem(storageKey(scope))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as SavedView<S>[]
  } catch {
    return []
  }
}

function writeViews<S extends Record<string, unknown>>(scope: string, views: SavedView<S>[]) {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(views))
  } catch {
    /* quota — silently fail; views are best-effort */
  }
}

export function useSavedViews<S extends Record<string, unknown>>({
  scope,
  state,
  apply,
}: UseSavedViewsArgs<S>) {
  const [views, setViews] = useState<SavedView<S>[]>([])

  useEffect(() => {
    setViews(readViews<S>(scope))
  }, [scope])

  const saveCurrent = useCallback(
    (name: string) => {
      const id = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      const newView: SavedView<S> = {
        id,
        name: name.trim() || "Untitled view",
        state,
        created_at: new Date().toISOString(),
      }
      const next = [newView, ...views]
      setViews(next)
      writeViews(scope, next)
      return newView
    },
    [scope, state, views],
  )

  const loadView = useCallback(
    (id: string) => {
      const v = views.find((x) => x.id === id)
      if (!v) return false
      apply(v.state)
      return true
    },
    [apply, views],
  )

  const deleteView = useCallback(
    (id: string) => {
      const next = views.filter((x) => x.id !== id)
      setViews(next)
      writeViews(scope, next)
    },
    [scope, views],
  )

  const renameView = useCallback(
    (id: string, name: string) => {
      const next = views.map((x) => (x.id === id ? { ...x, name } : x))
      setViews(next)
      writeViews(scope, next)
    },
    [scope, views],
  )

  return { views, currentState: state, saveCurrent, loadView, deleteView, renameView }
}
