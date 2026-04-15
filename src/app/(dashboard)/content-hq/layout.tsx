"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const tabs = [
  { label: "Trend Radar", href: "/content-hq/trends", emoji: "🔥" },
  { label: "Hook Library", href: "/content-hq/hooks", emoji: "🎣" },
  { label: "Inspiration", href: "/content-hq/inspiration", emoji: "💡" },
  { label: "Personas", href: "/content-hq/personas", emoji: "🎭" },
  { label: "Content Factory", href: "/content-hq/factory", emoji: "🎬" },
  { label: "Calendar", href: "/content-hq/calendar", emoji: "📅" },
]

export default function ContentHQLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-zinc-900 p-1 border border-zinc-800">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-all",
                isActive
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              )}
            >
              <span>{tab.emoji}</span>
              {tab.label}
            </Link>
          )
        })}
      </div>
      {children}
    </div>
  )
}
