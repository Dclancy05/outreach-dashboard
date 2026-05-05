"use client"

/**
 * Shared client hook for the active dummy group + account selection.
 *
 * `LiveViewTab` writes the selection to `/api/automations/dummy-selection`
 * when the user picks an account from the dropdown; `RecordingModal` reads
 * the same selection so clicking "Record" on Your Automations tab uses the
 * same dummy account the user has already chosen on Live View tab.
 *
 * This hook keeps both UIs reading from the persisted DB state instead of
 * passing props through the page tree. It does NOT modify any server route —
 * it just consumes `/api/automations/dummy-selection` (existing GET + POST).
 */

import { useCallback, useEffect, useState } from "react"

export interface DummyGroup {
  id: string
  name: string | null
  ip: string | null
  port: string | null
  location_city: string | null
  location_country: string | null
}

export interface DummyAccount {
  account_id: string
  platform: string
  username: string | null
  display_name: string | null
  status: string | null
}

export interface DummySelection {
  group: DummyGroup | null
  accounts: DummyAccount[]
  /** account_id of the currently-active dummy account, or "" if none picked */
  selectedAccountId: string
  loading: boolean
  /** Non-fatal warning ("no dummy group configured") for the UI to surface */
  warning: string | null
  /** Force a re-fetch (e.g., after navigating from accounts page) */
  reload: () => Promise<void>
  /** Persist a new selection. Returns once the POST completes. */
  setSelectedAccountId: (id: string) => Promise<void>
}

export function useDummySelection(): DummySelection {
  const [group, setGroup] = useState<DummyGroup | null>(null)
  const [accounts, setAccounts] = useState<DummyAccount[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/automations/dummy-selection")
      const data = await res.json()
      if (data?.error) {
        setWarning(data.error)
        setGroup(null)
        setAccounts([])
        setSelectedId("")
        return
      }
      if (!data?.group) {
        setWarning(
          data?.message ||
            "No dummy group configured. Mark one proxy group as is_dummy=true on the Accounts page."
        )
        setGroup(null)
        setAccounts([])
        setSelectedId("")
        return
      }
      setWarning(null)
      setGroup(data.group)
      setAccounts(data.accounts || [])
      setSelectedId(data?.selection?.account_id || "")
    } catch (e) {
      setWarning((e as Error).message || "Failed to load dummy selection")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const setSelectedAccountId = useCallback(
    async (id: string) => {
      if (!group) return
      setSelectedId(id)
      try {
        await fetch("/api/automations/dummy-selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proxy_group_id: group.id,
            account_id: id || null,
          }),
        })
      } catch {
        // Swallow — UI shows "Saving…" until this resolves; if it fails the
        // local state is still updated so the user's pick reflects what they
        // see, and the next reload() will reconcile with the DB.
      }
    },
    [group]
  )

  return {
    group,
    accounts,
    selectedAccountId: selectedId,
    loading,
    warning,
    reload,
    setSelectedAccountId,
  }
}
