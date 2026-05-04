"use client"

/**
 * LayoutsMenu — top-bar dropdown for "Save layout as…" / "Load layout".
 * Phase 4 #10.
 */
import * as React from "react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { Bookmark, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  type LayoutSize, type SavedLayout,
  listLayouts, saveLayout, deleteLayout,
} from "./layouts-store"

interface Props {
  size: LayoutSize
  visibleIds: string[]
  onLoad: (layout: SavedLayout) => void
}

export function LayoutsMenu({ size, visibleIds, onLoad }: Props) {
  const [layouts, setLayouts] = React.useState<SavedLayout[]>([])
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (open) setLayouts(listLayouts())
  }, [open])

  const onSave = () => {
    const name = window.prompt("Save layout as…", `Layout ${layouts.length + 1}`)?.trim()
    if (!name) return
    const next = saveLayout({
      name,
      size,
      visibleIds: [...visibleIds],
      savedAt: new Date().toISOString(),
    })
    setLayouts(next)
    toast.success("Layout saved", { description: name })
  }

  const onDelete = (name: string) => {
    if (!window.confirm(`Delete layout "${name}"?`)) return
    setLayouts(deleteLayout(name))
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-400 hover:text-cyan-100 hover:bg-cyan-500/10"
          title="Saved layouts"
        >
          <Bookmark className="w-3.5 h-3.5 mr-1" />
          Layouts
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="min-w-[240px] bg-zinc-900 border border-zinc-800 rounded-md shadow-xl py-1 text-sm z-50"
        >
          <DropdownMenu.Item
            onSelect={(e) => { e.preventDefault(); onSave() }}
            className="px-3 py-1.5 cursor-pointer outline-none data-[highlighted]:bg-zinc-800 text-zinc-200 flex items-center gap-2"
          >
            <Save className="w-3.5 h-3.5" />
            Save current layout as…
          </DropdownMenu.Item>
          {layouts.length > 0 && (
            <>
              <DropdownMenu.Separator className="h-px bg-zinc-800 my-1" />
              <div className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-zinc-500">Saved</div>
              {layouts.map((l) => (
                <div
                  key={l.name}
                  className="px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800/60 group"
                >
                  <button
                    onClick={() => { onLoad(l); setOpen(false) }}
                    className="flex-1 min-w-0 text-left text-zinc-200 hover:text-zinc-50"
                  >
                    <div className="truncate">{l.name}</div>
                    <div className="text-[10px] text-zinc-500">
                      {l.size}-pane · {l.visibleIds.length} session{l.visibleIds.length === 1 ? "" : "s"}
                    </div>
                  </button>
                  <button
                    onClick={() => onDelete(l.name)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 shrink-0"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </>
          )}
          {layouts.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-zinc-500">
              No saved layouts yet. Arrange your panes, then click "Save…".
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
