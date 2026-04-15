"use client"

import { useEffect, useState } from "react"

export default function OAuthComplete() {
  const [status, setStatus] = useState<"success" | "error" | "loading">("loading")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    if (typeof window === "undefined") return

    const params = new URLSearchParams(window.location.search)
    const connected = params.get("connected")
    const error = params.get("error")
    const hash = window.location.hash

    if (connected && hash.startsWith("#token=")) {
      const token = decodeURIComponent(hash.slice(7))

      // Strategy 1: Save token directly to localStorage (same key the app uses)
      try {
        const existing = JSON.parse(localStorage.getItem("email_oauth_tokens") || "{}")
        existing[connected] = token
        localStorage.setItem("email_oauth_tokens", JSON.stringify(existing))
      } catch {}

      // Strategy 2: Signal via a temporary key (triggers storage event in parent tab)
      localStorage.setItem("oauth_complete_signal", JSON.stringify({
        type: "oauth-complete",
        email: connected,
        token,
        timestamp: Date.now(),
      }))

      // Strategy 3: Try postMessage if opener exists
      if (window.opener) {
        try {
          window.opener.postMessage({ type: "oauth-complete", email: connected, token }, "*")
        } catch {}
      }

      setStatus("success")

      // Auto-close after delay
      setTimeout(() => window.close(), 2000)
    } else if (error) {
      // Signal error
      localStorage.setItem("oauth_complete_signal", JSON.stringify({
        type: "oauth-error",
        error,
        timestamp: Date.now(),
      }))

      if (window.opener) {
        try {
          window.opener.postMessage({ type: "oauth-error", error }, "*")
        } catch {}
      }

      setStatus("error")
      setErrorMsg(error)
      setTimeout(() => window.close(), 3000)
    } else {
      setStatus("error")
      setErrorMsg("No connection data received")
      setTimeout(() => window.close(), 3000)
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white">
      <div className="text-center space-y-3">
        {status === "loading" && <p className="text-zinc-400">Processing...</p>}
        {status === "success" && (
          <>
            <div className="text-3xl">✅</div>
            <p className="text-lg font-medium">Account connected!</p>
            <p className="text-sm text-zinc-400">This tab will close automatically...</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="text-3xl">❌</div>
            <p className="text-lg font-medium">Connection failed</p>
            <p className="text-sm text-zinc-400">{errorMsg}</p>
            <p className="text-xs text-zinc-500 mt-2">This tab will close automatically...</p>
          </>
        )}
      </div>
    </div>
  )
}
