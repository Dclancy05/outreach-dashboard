"use client"

import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Star, Copy, Trash2, MoreHorizontal, Settings as SettingsIcon } from "lucide-react"
import { motion } from "framer-motion"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { Persona } from "@/lib/api/memory"

export function PersonaCard({
  persona,
  onSetDefault,
  onDuplicate,
  onDelete,
  onEdit,
}: {
  persona: Persona
  onSetDefault: () => void
  onDuplicate: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={cn(
        "group relative overflow-hidden border bg-card/60 transition-all hover:border-amber-400/40",
        persona.is_default && "ring-1 ring-amber-300/40 border-amber-400/30"
      )}>
        <Link href={`/agency/memory/personas/${persona.id}`} className="block p-4">
          <div className="flex items-start gap-3">
            <div className="text-3xl leading-none">{persona.emoji}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-semibold">{persona.name}</h3>
                {persona.is_default && (
                  <Badge variant="outline" className="border-amber-400/50 bg-amber-500/10 text-amber-300">
                    <Star className="mr-1 h-3 w-3 fill-amber-400" /> Default
                  </Badge>
                )}
              </div>
              {persona.description && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{persona.description}</p>
              )}
              <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>📚 {persona.memory_count ?? 0} memories</span>
                {persona.last_used_at && (
                  <span>· last used {new Date(persona.last_used_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
        </Link>

        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit() }}
            className="rounded p-1 hover:bg-secondary"
            title="Quick edit"
          >
            <SettingsIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                className="rounded p-1 hover:bg-secondary"
              >
                <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onSetDefault} disabled={persona.is_default}>
                <Star className="mr-2 h-3.5 w-3.5" /> Set as default
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-red-400 focus:text-red-300">
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>
    </motion.div>
  )
}
