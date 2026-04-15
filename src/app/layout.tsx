import "./globals.css"
import { ThemeProvider } from "@/contexts/theme-context"
import { PinLock } from "@/components/pin-lock"
import { Toaster } from "@/components/ui/sonner"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: {
    default: "Outreach HQ",
    template: "%s — Outreach HQ",
  },
  description: "Outreach automation dashboard",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <PinLock>{children}</PinLock>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
