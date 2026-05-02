"use client"

/**
 * Floating toolbar for the VNC viewer. Sits at the top-right of the canvas.
 *
 * On mobile (< sm), the buttons collapse into a single "More" overflow menu
 * (pure CSS dropdown — no extra portal wiring) so the canvas stays usable on
 * a 375px viewport.
 *
 * Each button is wired through props so the parent page owns the imperative
 * VNC actions on the viewer ref.
 */

import {
  Camera,
  Maximize2,
  MoreVertical,
  Power,
  RotateCcw,
  Settings as SettingsIcon,
  Wifi,
  WifiOff,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { VncConnectionState } from "@/components/jarvis/observability/vnc-viewer"

interface VncToolbarProps {
  state: VncConnectionState
  onConnect: () => void
  onDisconnect: () => void
  onFullscreen: () => void
  onScreenshot: () => void
  onRefresh: () => void
  onCtrlAltDel: () => void
  onOpenSettings: () => void
  className?: string
}

interface ToolbarBtn {
  /** Stable identifier (used for React `key`). Named `id` to avoid colliding
   *  with React's reserved `key` prop when we spread the object. */
  id: string
  label: string
  icon: LucideIcon
  onClick: () => void
  disabled?: boolean
  emphasis?: "primary" | "danger"
}

export function VncToolbar({
  state,
  onConnect,
  onDisconnect,
  onFullscreen,
  onScreenshot,
  onRefresh,
  onCtrlAltDel,
  onOpenSettings,
  className,
}: VncToolbarProps) {
  const isConnected = state === "connected"
  const isBusy = state === "connecting" || state === "reconnecting"

  const buttons: ToolbarBtn[] = [
    isConnected || isBusy
      ? {
          id: "disconnect",
          label: "Disconnect",
          icon: WifiOff,
          onClick: onDisconnect,
          emphasis: "danger",
        }
      : {
          id: "connect",
          label: "Connect",
          icon: Wifi,
          onClick: onConnect,
          emphasis: "primary",
        },
    {
      id: "fullscreen",
      label: "Fullscreen",
      icon: Maximize2,
      onClick: onFullscreen,
      disabled: !isConnected,
    },
    {
      id: "screenshot",
      label: "Screenshot",
      icon: Camera,
      onClick: onScreenshot,
      disabled: !isConnected,
    },
    {
      id: "refresh",
      label: "Refresh",
      icon: RotateCcw,
      onClick: onRefresh,
      disabled: state === "idle",
    },
    {
      id: "ctrlaltdel",
      label: "Send Ctrl-Alt-Del",
      icon: Power,
      onClick: onCtrlAltDel,
      disabled: !isConnected,
    },
    {
      id: "settings",
      label: "Quality settings",
      icon: SettingsIcon,
      onClick: onOpenSettings,
    },
  ]

  return (
    <div
      role="toolbar"
      aria-label="VNC controls"
      className={cn(
        "absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-mem-border bg-mem-surface-1/90 p-1 shadow-lg backdrop-blur-md",
        className
      )}
    >
      {/* Desktop: render every button inline. */}
      <div className="hidden sm:flex items-center gap-1">
        {buttons.map((b) => (
          <ToolbarButton key={b.id} btn={b} />
        ))}
      </div>

      {/* Mobile: connect/disconnect inline, everything else in overflow. */}
      <div className="flex sm:hidden items-center gap-1">
        <ToolbarButton btn={buttons[0]} />
        <OverflowMenu items={buttons.slice(1)} />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Buttons                                   */
/* -------------------------------------------------------------------------- */

function ToolbarButton({ btn }: { btn: ToolbarBtn }) {
  const { label, icon: Icon, onClick, disabled, emphasis } = btn
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-mem-text-secondary transition-colors",
        "hover:bg-white/[0.06] hover:text-mem-text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mem-accent/60",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-mem-text-secondary",
        emphasis === "primary" && "text-mem-accent hover:text-mem-accent",
        emphasis === "danger" && "text-mem-status-stuck hover:text-mem-status-stuck"
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/*                              Overflow menu                                  */
/* -------------------------------------------------------------------------- */

function OverflowMenu({ items }: { items: ToolbarBtn[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (ev: MouseEvent) => {
      if (!ref.current) return
      if (!ref.current.contains(ev.target as Node)) setOpen(false)
    }
    const handleKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More controls"
        className="flex h-8 w-8 items-center justify-center rounded-md text-mem-text-secondary transition-colors hover:bg-white/[0.06] hover:text-mem-text-primary"
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-48 rounded-md border border-mem-border bg-mem-surface-2 p-1 shadow-xl"
        >
          {items.map((b) => (
            <button
              key={b.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                b.onClick()
              }}
              disabled={b.disabled}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] text-mem-text-secondary transition-colors",
                "hover:bg-white/[0.04] hover:text-mem-text-primary",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              )}
            >
              <b.icon className="h-3.5 w-3.5" aria-hidden />
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
