"use client"
/**
 * Bell icon button with unread-count badge. Click toggles the slide-in drawer.
 * Replaces the legacy <NotificationsBell /> popover behavior with the slide-in
 * pattern.
 */
import { Bell } from "lucide-react"
import { cn } from "@/lib/utils"
import { useInboxDrawer } from "./inbox-drawer-provider"

interface Props {
  /** When true (mobile), renders larger floating button styling. */
  floating?: boolean
}

export function InboxBell({ floating = false }: Props) {
  const { toggle, unreadCount, isOpen } = useInboxDrawer()

  if (floating) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={unreadCount > 0 ? `Inbox — ${unreadCount} unread` : "Inbox"}
        aria-expanded={isOpen}
        className={cn(
          "fixed top-3 right-3 z-40 lg:hidden h-10 w-10 grid place-items-center rounded-full",
          "bg-mem-surface-2/95 backdrop-blur border border-mem-border-strong shadow-lg",
          "text-mem-text-primary hover:bg-mem-surface-3 transition-colors"
        )}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-mem-accent text-white text-[10px] font-semibold leading-none flex items-center justify-center shadow-[0_0_0_2px_var(--background)]"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={unreadCount > 0 ? `Inbox — ${unreadCount} unread` : "Inbox"}
      aria-expanded={isOpen}
      className={cn(
        "relative h-8 w-8 grid place-items-center rounded-md transition-colors",
        "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        isOpen && "text-mem-accent bg-muted/50"
      )}
      title="Inbox"
    >
      <Bell size={14} />
      {unreadCount > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-mem-accent text-white text-[10px] font-semibold leading-none flex items-center justify-center"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  )
}
