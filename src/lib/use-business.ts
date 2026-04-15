"use client"

import { useState, useEffect } from "react"

export function useBusinessId(): string {
  const [businessId, setBusinessId] = useState<string>("")

  useEffect(() => {
    const load = () => {
      try {
        const stored = localStorage.getItem("selected_business")
        if (stored) setBusinessId(JSON.parse(stored).id || "")
      } catch {}
    }
    load()
    window.addEventListener("storage", load)
    return () => window.removeEventListener("storage", load)
  }, [])

  return businessId
}
