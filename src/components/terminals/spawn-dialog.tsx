"use client"

/**
 * SpawnDialog — pick a preset (or go blank), then spawn.
 *
 * Phase 4 #13. Reads `/api/spawn-presets` and renders each as a button. The
 * "Blank terminal" option spawns with no preset (legacy POST /api/terminals
 * with empty body). Presets pre-fill `initial_prompt` + `cost_cap_usd` so a
 * "Bug fix" terminal opens cheaper than a "Build feature" one.
 */
import * as React from "react"
import { Loader2, Plus, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { iconFor } from "./terminal-style"
import { cn } from "@/lib/utils"

interface SpawnPreset {
  id: string
  label: string
  icon: string
  prompt: string
  cost_cap_usd: number
  is_default: boolean
}

interface SpawnResult {
  id: string
  title: string
  ws_url: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Called after a successful spawn so the workspace can refresh + focus. */
  onSpawned?: (result: SpawnResult) => void
}

export function SpawnDialog({ open, onOpenChange, onSpawned }: Props) {
  const [presets, setPresets] = React.useState<SpawnPreset[]>([])
  const [loading, setLoading] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [selected, setSelected] = React.useState<SpawnPreset | null>(null)
  const [title, setTitle] = React.useState("")
  const [prompt, setPrompt] = React.useState("")
  const [costCap, setCostCap] = React.useState<number>(5)

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setSelected(null)
    setTitle("")
    setPrompt("")
    setCostCap(5)
    void (async () => {
      try {
        const res = await fetch("/api/spawn-presets", { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!cancelled) setPresets((body.presets || []) as SpawnPreset[])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open])

  const pickPreset = (p: SpawnPreset | null) => {
    setSelected(p)
    if (p) {
      setTitle(p.label)
      setPrompt(p.prompt)
      setCostCap(Number(p.cost_cap_usd) || 5)
    } else {
      setTitle("")
      setPrompt("")
      setCostCap(5)
    }
  }

  const spawn = async () => {
    setCreating(true)
    try {
      const body: Record<string, unknown> = {}
      if (title.trim()) body.title = title.trim()
      if (prompt.trim()) body.initial_prompt = prompt.trim()
      if (costCap && costCap !== 5) body.cost_cap_usd = costCap
      if (selected) body.icon = selected.icon
      const res = await fetch("/api/terminals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success("Terminal started", { description: data.title || selected?.label || "Blank session" })
      onSpawned?.(data as SpawnResult)
      onOpenChange(false)
    } catch (e) {
      toast.error("Couldn't start terminal", { description: (e as Error).message })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            Start a new terminal
          </DialogTitle>
          <div className="text-xs text-zinc-400 mt-1">
            Pick a preset to pre-fill your first task &amp; cost cap, or start blank.
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs uppercase tracking-wider text-zinc-500">Preset</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <PresetButton
                active={selected === null && !loading}
                icon={iconFor("terminal")}
                label="Blank"
                hint="No initial prompt"
                onClick={() => pickPreset(null)}
              />
              {loading ? (
                <div className="col-span-1 flex items-center justify-center text-xs text-zinc-500 h-12 border border-dashed border-zinc-800 rounded-md">
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  Loading…
                </div>
              ) : presets.map((p) => (
                <PresetButton
                  key={p.id}
                  active={selected?.id === p.id}
                  icon={iconFor(p.icon)}
                  label={p.label}
                  hint={`$${Number(p.cost_cap_usd).toFixed(2)} cap`}
                  onClick={() => pickPreset(p)}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="spawn-title" className="text-xs uppercase tracking-wider text-zinc-500">Title</Label>
              <Input
                id="spawn-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Fix login bug"
                className="h-8 text-sm mt-2"
              />
            </div>
            <div>
              <Label htmlFor="spawn-cap" className="text-xs uppercase tracking-wider text-zinc-500">Cost cap</Label>
              <div className="relative mt-2">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500">$</span>
                <Input
                  id="spawn-cap"
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={costCap}
                  onChange={(e) => setCostCap(Number(e.target.value) || 5)}
                  className="h-8 text-sm pl-5"
                />
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="spawn-prompt" className="text-xs uppercase tracking-wider text-zinc-500">First task (optional)</Label>
            <Textarea
              id="spawn-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should the terminal start working on?"
              rows={5}
              className="text-xs mt-2 font-mono"
            />
            <div className="text-[11px] text-zinc-500 mt-1">
              Sent as the first message to Claude when the session boots.
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button size="sm" onClick={spawn} disabled={creating}>
            {creating ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 mr-1.5" />
            )}
            Start terminal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PresetButton({
  active, icon: Icon, label, hint, onClick,
}: {
  active: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md border text-left text-sm transition-colors",
        active
          ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-100"
          : "bg-zinc-900/40 border-zinc-800 text-zinc-300 hover:bg-zinc-800/60",
      )}
    >
      <Icon className={cn("w-4 h-4 shrink-0", active ? "text-cyan-300" : "text-zinc-400")} />
      <span className="flex-1 min-w-0">
        <span className="block font-medium truncate">{label}</span>
        <span className="block text-[10px] text-zinc-500 truncate">{hint}</span>
      </span>
    </button>
  )
}
