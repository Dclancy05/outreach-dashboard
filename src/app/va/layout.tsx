"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export default function VALayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const session = localStorage.getItem("va_session")
    if (!session) {
      router.replace("/va-login")
    } else {
      setAuthorized(true)
    }
  }, [router])

  if (!authorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      {children}
    </main>
  )
}
