"use client"

import { useEffect, useState } from "react"

// Wave 1.6 — drop-in card for per-account VNC display settings.
// Renders quality + compression sliders + adaptive toggle.
// Uses /api/accounts/[id]/vnc-settings.

interface Settings {
  quality: number
  compression: number
  adaptive: boolean
}

interface Props {
  accountId: string
  className?: string
}

const DEFAULTS: Settings = { quality: 4, compression: 7, adaptive: true }

export function VncSettingsCard({ accountId, className }: Props) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/vnc-settings`)
        if (!res.ok) {
          setLoaded(true)
          return
        }
        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (json?.settings) setSettings(json.settings)
        setLoaded(true)
      } catch {
        setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [accountId])

  const save = async (next: Partial<Settings>) => {
    setSaving(true)
    const merged = { ...settings, ...next }
    setSettings(merged)
    try {
      await fetch(`/api/accounts/${encodeURIComponent(accountId)}/vnc-settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      })
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className={className}>
        <div className="text-xs text-mem-text-secondary">Loading VNC settings…</div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="space-y-3 rounded-lg border border-mem-border bg-mem-surface p-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-mem-text-primary">VNC Display Settings</h3>
            <p className="text-[11px] text-mem-text-secondary">
              How the embedded browser feels for this account.
            </p>
          </div>
          {saving ? (
            <span className="text-[11px] text-mem-text-secondary">saving…</span>
          ) : savedAt ? (
            <span className="text-[11px] text-emerald-400">saved</span>
          ) : null}
        </div>

        <label className="block">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-mem-text-primary">Quality</span>
            <span className="font-mono text-mem-text-secondary">{settings.quality} / 9</span>
          </div>
          <input
            type="range"
            min={0}
            max={9}
            value={settings.quality}
            onChange={(e) => save({ quality: Number(e.target.value) })}
            className="w-full"
          />
        </label>

        <label className="block">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-mem-text-primary">Compression</span>
            <span className="font-mono text-mem-text-secondary">{settings.compression} / 9</span>
          </div>
          <input
            type="range"
            min={0}
            max={9}
            value={settings.compression}
            onChange={(e) => save({ compression: Number(e.target.value) })}
            className="w-full"
          />
          <p className="mt-1 text-[10px] text-mem-text-secondary">
            Reconnect required for compression changes to apply.
          </p>
        </label>

        <label className="flex items-center gap-2 text-[12px] text-mem-text-primary">
          <input
            type="checkbox"
            checked={settings.adaptive}
            onChange={(e) => save({ adaptive: e.target.checked })}
          />
          <span>Adapt quality automatically based on latency</span>
        </label>
      </div>
    </div>
  )
}
