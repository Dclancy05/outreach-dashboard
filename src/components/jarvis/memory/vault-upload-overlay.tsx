"use client"
/**
 * VaultUploadOverlay — full-pane dropzone shown over the vault tree while a
 * user drags a file from their desktop. Tells them which folder the drop will
 * land in.
 *
 * Visual: a softly tinted amber overlay with a dashed border + a single line
 * of copy: "Drop here to upload to /<currentFolder>". Becomes opaque-amber
 * while a drop is "active" (file actually over the pane).
 *
 * Pure presentation — no fetch / no file reading. The parent (TreeView)
 * handles the actual upload via `uploadFileToVault`.
 */
import * as React from "react"
import { Upload } from "lucide-react"
import { cn } from "@/lib/utils"

export interface VaultUploadOverlayProps {
  /** Whether the overlay is currently mounted/visible. */
  visible: boolean
  /** Whether the dragged file is actively over the dropzone (vs just nearby). */
  active: boolean
  /** Folder path the file will land in, e.g. "/Projects" or "/" for root. */
  targetFolder: string
}

export function VaultUploadOverlay({
  visible,
  active,
  targetFolder,
}: VaultUploadOverlayProps): React.ReactElement | null {
  if (!visible) return null
  const friendlyFolder = !targetFolder || targetFolder === "/" ? "/ (root)" : targetFolder
  return (
    <div
      // pointer-events-none keeps the overlay from eating drag events itself —
      // the underlying tree container's onDragOver/onDrop still fire.
      className={cn(
        "pointer-events-none absolute inset-0 z-30 flex items-center justify-center",
        "transition-colors duration-100"
      )}
      aria-hidden="true"
    >
      <div
        className={cn(
          "mx-3 my-2 w-full h-full rounded-lg border-2 border-dashed",
          "flex flex-col items-center justify-center gap-2 text-center px-6",
          active
            ? "border-amber-400 bg-amber-500/15"
            : "border-amber-500/50 bg-amber-500/5"
        )}
      >
        <Upload
          className={cn(
            "w-6 h-6 transition-colors",
            active ? "text-amber-300" : "text-amber-400/80"
          )}
        />
        <div
          className={cn(
            "text-sm font-medium transition-colors",
            active ? "text-amber-100" : "text-amber-300/90"
          )}
        >
          Drop here to upload to{" "}
          <code className="bg-zinc-900/60 text-amber-200 px-1.5 py-0.5 rounded text-xs font-mono">
            {friendlyFolder}
          </code>
        </div>
        <div className="text-[11px] text-amber-200/60 font-mono">
          markdown / text · 1 MB max
        </div>
      </div>
    </div>
  )
}
