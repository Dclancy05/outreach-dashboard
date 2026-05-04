"use client"

/**
 * CustomizeSessionDialog — pick a color, icon, and nickname for a terminal.
 *
 * Phase 4 #7. Reached from the SessionList ⋯ menu. Persists immediately on
 * each change (PATCH `/api/terminals/:id` with the new field) so a half-typed
 * nickname survives a tab close. The dashboard's GET `/api/terminals` merges
 * these dashboard-only columns from Postgres into every list refresh.
 */
import * as React from "react"
import { Check, X } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  TERMINAL_COLORS, TERMINAL_ICONS, colorClasses, iconFor,
} from "./terminal-style"
import { cn } from "@/lib/utils"

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  sessionId: string
  /** Initial values shown in the form. */
  current: {
    title: string
    color?: string | null
    icon?: string | null
    nickname?: string | null
  }
  /** Called optimistically with the new fields so the parent re-renders fast. */
  onChanged?: (patch: { color?: string | null; icon?: string | null; nickname?: string | null }) => void
}

export function CustomizeSessionDialog({ open, onOpenChange, sessionId, current, onChanged }: Props) {
  const [color, setColor] = React.useState<string | null>(current.color ?? null)
  const [icon, setIcon] = React.useState<string | null>(current.icon ?? null)
  const [nickname, setNickname] = React.useState<string>(current.nickname ?? "")

  // Reset form when the dialog re-opens for a different session.
  React.useEffect(() => {
    if (open) {
      setColor(current.color ?? null)
      setIcon(current.icon ?? null)
      setNickname(current.nickname ?? "")
    }
  }, [open, current.color, current.icon, current.nickname])

  const persist = React.useCallback(async (patch: Record<string, string | null>) => {
    onChanged?.(patch as { color?: string | null; icon?: string | null; nickname?: string | null })
    try {
      const res = await fetch(`/api/terminals/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message })
    }
  }, [sessionId, onChanged])

  const onPickColor = (c: string) => {
    setColor(c)
    void persist({ color: c })
  }
  const onPickIcon = (i: string) => {
    setIcon(i)
    void persist({ icon: i })
  }
  const onSaveNickname = () => {
    void persist({ nickname: nickname.trim() })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Customise terminal</DialogTitle>
          <div className="text-xs text-zinc-400 mt-1">
            Color and icon show up in the session list, the pane header, and Telegram.
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs uppercase tracking-wider text-zinc-500">Color</Label>
            <div className="grid grid-cols-8 gap-1.5 mt-2">
              {TERMINAL_COLORS.map((c) => {
                const klass = colorClasses(c)
                const active = c === color
                return (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => onPickColor(c)}
                    className={cn(
                      "h-8 rounded-md border flex items-center justify-center transition-colors",
                      klass.bgSoft,
                      active ? klass.border + " ring-2 " + klass.ring : "border-zinc-800",
                    )}
                  >
                    <span className={cn("h-2.5 w-2.5 rounded-full", klass.dot)} />
                    {active && <Check className="w-3 h-3 ml-1 text-zinc-100" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-zinc-500">Icon</Label>
            <div className="grid grid-cols-6 gap-1.5 mt-2">
              {TERMINAL_ICONS.map((name) => {
                const Icon = iconFor(name)
                const active = name === icon
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    onClick={() => onPickIcon(name)}
                    className={cn(
                      "h-8 rounded-md border flex items-center justify-center transition-colors",
                      active
                        ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                        : "border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <Label htmlFor="terminal-nickname" className="text-xs uppercase tracking-wider text-zinc-500">
              Nickname
            </Label>
            <div className="flex items-center gap-2 mt-2">
              <Input
                id="terminal-nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="e.g. cleanup-bot"
                maxLength={40}
                onKeyDown={(e) => { if (e.key === "Enter") onSaveNickname() }}
                className="h-8 text-sm"
              />
              {nickname && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400"
                  onClick={() => setNickname("")}
                  title="Clear"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">
              Shown next to the terminal name everywhere. Leave blank to use the title.
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          <Button size="sm" onClick={onSaveNickname}>Save nickname</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
