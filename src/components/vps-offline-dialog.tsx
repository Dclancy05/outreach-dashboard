"use client"

import Link from "next/link"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface VpsOfflineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // What action the user was trying to do — tweaks the body copy slightly.
  action?: "signin" | "test-proxy"
}

export function VpsOfflineDialog({ open, onOpenChange, action = "signin" }: VpsOfflineDialogProps) {
  const body =
    action === "test-proxy"
      ? "The remote browser isn't running, so the proxy test can't reach it. Start the VPS from Maintenance, then come back here."
      : "The remote browser isn't running, so signing in won't work. Start the VPS from Maintenance, then come back here."

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>VPS is offline</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Link href="/automations?tab=maintenance">Open Maintenance</Link>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
