"use client"

import { useEffect, useState } from "react"

type LoginResult = { platform: string; loggedIn: boolean | null; loginUrl?: string; reason?: string | null }
type Health = {
  chrome: boolean
  xvfb: boolean
  proxy: boolean
  queueProcessor: boolean
  recording?: boolean
  accountsLoggedIn?: boolean
  loginResults?: LoginResult[]
  loggedOutCount?: number
}

// Module-level cache so multiple consumers (SystemPulse, Accounts page,
// proxy edit dialog) don't each fire their own 30s poll.
let sharedHealth: Health | null = null
let sharedLoading = true
const listeners = new Set<() => void>()
let pollTimer: ReturnType<typeof setInterval> | null = null
let inflight: Promise<void> | null = null

function notify() {
  listeners.forEach((l) => l())
}

async function loadHealth() {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const res = await fetch("/api/recordings/health", { cache: "no-store" })
      sharedHealth = await res.json()
    } catch {
      sharedHealth = { chrome: false, xvfb: false, proxy: false, queueProcessor: false }
    }
    sharedLoading = false
    notify()
  })()
  try {
    await inflight
  } finally {
    inflight = null
  }
}

function startPolling() {
  if (pollTimer) return
  loadHealth()
  pollTimer = setInterval(loadHealth, 30000)
}

function stopPolling() {
  if (pollTimer && listeners.size === 0) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export interface VpsHealthState {
  health: Health | null
  loading: boolean
  // True when 3+ infra checks are failing — matches the SystemPulse "VPS offline" label.
  vpsOffline: boolean
  refresh: () => Promise<void>
}

export function useVpsHealth(): VpsHealthState {
  const [, force] = useState(0)

  useEffect(() => {
    const listener = () => force((n) => n + 1)
    listeners.add(listener)
    startPolling()
    return () => {
      listeners.delete(listener)
      stopPolling()
    }
  }, [])

  const checks = sharedHealth
    ? [sharedHealth.chrome, sharedHealth.xvfb, sharedHealth.proxy, sharedHealth.queueProcessor]
    : []
  const failing = checks.filter((v) => !v).length
  const vpsOffline = checks.length > 0 && failing >= 3

  return {
    health: sharedHealth,
    loading: sharedLoading,
    vpsOffline,
    refresh: loadHealth,
  }
}
