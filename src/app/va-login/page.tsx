"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default function VALoginPage() {
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleDigit = (d: string) => {
    if (pin.length < 4) setPin(prev => prev + d)
    setError("")
  }

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1))
    setError("")
  }

  const handleSubmit = async () => {
    if (pin.length !== 4) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/auth/va-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError("Invalid PIN")
        setPin("")
        return
      }
      // Store VA session
      localStorage.setItem("va_session", JSON.stringify(json.data))
      // If they have multiple businesses, go to business picker
      if (json.data.business_ids?.length === 1) {
        // Auto-select the single business
        const bizRes = await fetch("/api/businesses")
        const bizData = await bizRes.json()
        const biz = (bizData.data || []).find((b: { id: string }) => b.id === json.data.business_ids[0])
        if (biz) {
          localStorage.setItem("selected_business", JSON.stringify(biz))
        }
        router.push("/va-queue")
      } else if (json.data.business_ids?.length > 1) {
        router.push("/va-queue")
      } else {
        router.push("/va-queue")
      }
    } catch {
      setError("Login failed")
      setPin("")
    } finally {
      setLoading(false)
    }
  }

  // Auto-submit on 4 digits
  if (pin.length === 4 && !loading && !error) {
    handleSubmit()
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm p-8 space-y-6 text-center">
        <div>
          <div className="text-4xl mb-2">🔐</div>
          <h1 className="text-2xl font-bold">VA Login</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter your 4-digit PIN</p>
        </div>

        {/* PIN Display */}
        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                pin.length > i
                  ? "border-purple-500 bg-purple-500/10 text-purple-400"
                  : "border-border bg-secondary/50"
              }`}
            >
              {pin.length > i ? "●" : ""}
            </div>
          ))}
        </div>

        {error && <p className="text-red-400 text-sm font-medium">{error}</p>}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map(d => (
            <Button
              key={d || "empty"}
              variant="outline"
              className={`h-14 text-xl font-bold ${!d ? "invisible" : ""}`}
              onClick={() => d === "⌫" ? handleDelete() : d ? handleDigit(d) : null}
              disabled={loading || !d}
            >
              {d}
            </Button>
          ))}
        </div>

        {loading && <p className="text-sm text-muted-foreground animate-pulse">Logging in...</p>}
      </Card>
    </div>
  )
}
