import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Skeleton — gray-pulse placeholder for loading states.
 *
 * Used to mimic the shape of forthcoming content (e.g. a 3-row session list)
 * so the layout doesn't shift when data finally lands. Keeps the eye where
 * it belongs and signals "we're alive" without a generic spinner.
 *
 * Usage:
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton className="h-1.5 w-1.5 rounded-full" />
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-zinc-800/60", className)}
      {...props}
    />
  )
}
