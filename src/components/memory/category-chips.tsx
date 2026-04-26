"use client"

import { cn } from "@/lib/utils"
import { MEMORY_TYPES, type MemoryType } from "@/lib/api/memory"

export function CategoryChips({
  value,
  onChange,
  counts,
  showAll = true,
}: {
  value: MemoryType | "all"
  onChange: (v: MemoryType | "all") => void
  counts?: Partial<Record<MemoryType | "all", number>>
  showAll?: boolean
}) {
  const items: Array<{ value: MemoryType | "all"; label: string; emoji: string; help: string }> = [
    ...(showAll ? [{ value: "all" as const, label: "All", emoji: "✨", help: "Every memory" }] : []),
    ...MEMORY_TYPES.map((t) => ({ value: t.value, label: t.label, emoji: t.emoji, help: t.help })),
  ]
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((it) => {
        const active = value === it.value
        const count = counts?.[it.value]
        return (
          <button
            key={it.value}
            onClick={() => onChange(it.value)}
            title={it.help}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
              active
                ? "border-amber-400/50 bg-amber-500/10 text-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.25)]"
                : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <span>{it.emoji}</span>
            <span>{it.label}</span>
            {typeof count === "number" && (
              <span className={cn("rounded-full px-1.5 text-[10px]", active ? "bg-amber-400/20 text-amber-200" : "bg-muted text-muted-foreground")}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
