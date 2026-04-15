"use client"

import { useState, useEffect } from "react"

const STORAGE_KEY = "outreach_pin_verified"

export function PinLock({ children }: { children: React.ReactNode }) {
  const [pin, setPin] = useState("")
  const [unlocked, setUnlocked] = useState(false)
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(true)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved === "true") setUnlocked(true)
    setChecking(false)
  }, [])

  async function verifyPin(enteredPin: string) {
    setVerifying(true)
    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: enteredPin }),
      })
      if (res.ok) {
        sessionStorage.setItem(STORAGE_KEY, "true")
        setUnlocked(true)
      } else {
        setError(true)
        setTimeout(() => { setPin(""); setError(false) }, 600)
      }
    } catch {
      setError(true)
      setTimeout(() => { setPin(""); setError(false) }, 600)
    } finally {
      setVerifying(false)
    }
  }

  function handleKey(digit: string) {
    if (pin.length >= 6 || verifying) return
    const next = pin + digit
    setPin(next)
    setError(false)

    if (next.length === 6) {
      verifyPin(next)
    }
  }

  function handleDelete() {
    setPin(pin.slice(0, -1))
    setError(false)
  }

  if (checking) return null
  if (unlocked) return <>{children}</>

  const keys = [
    { digit: "1", letters: "" },
    { digit: "2", letters: "ABC" },
    { digit: "3", letters: "DEF" },
    { digit: "4", letters: "GHI" },
    { digit: "5", letters: "JKL" },
    { digit: "6", letters: "MNO" },
    { digit: "7", letters: "PQRS" },
    { digit: "8", letters: "TUV" },
    { digit: "9", letters: "WXYZ" },
  ]

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-[100] select-none">
      {/* Lock Icon */}
      <div className="mb-6">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4 mx-auto shadow-lg shadow-purple-500/20">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <p className="text-white/50 text-sm text-center tracking-wide">Enter Passcode</p>
      </div>

      {/* Pin Dots */}
      <div className="flex gap-5 mb-10">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full transition-all duration-150 ${
              error
                ? "bg-red-500"
                : i < pin.length
                ? "bg-white"
                : "border-2 border-white/25"
            } ${error ? "animate-shake" : ""}`}
          />
        ))}
      </div>

      {/* Keypad - 3x4 grid */}
      <div className="w-[270px]">
        {/* Rows 1-3 */}
        <div className="grid grid-cols-3 gap-[18px]">
          {keys.map(({ digit, letters }) => (
            <button
              key={digit}
              onClick={() => handleKey(digit)}
              className="w-[78px] h-[78px] rounded-full bg-white/[0.08] backdrop-blur-sm flex flex-col items-center justify-center active:bg-white/25 transition-colors duration-100"
            >
              <span className="text-[28px] font-light text-white leading-none">{digit}</span>
              {letters && <span className="text-[9px] tracking-[2.5px] text-white/35 mt-1">{letters}</span>}
            </button>
          ))}
        </div>

        {/* Bottom row: empty, 0, delete */}
        <div className="grid grid-cols-3 gap-[18px] mt-[18px]">
          <div />
          <button
            onClick={() => handleKey("0")}
            className="w-[78px] h-[78px] rounded-full bg-white/[0.08] backdrop-blur-sm flex items-center justify-center active:bg-white/25 transition-colors duration-100"
          >
            <span className="text-[28px] font-light text-white leading-none">0</span>
          </button>
          <button
            onClick={handleDelete}
            className="w-[78px] h-[78px] rounded-full flex items-center justify-center active:bg-white/10 transition-colors duration-100"
          >
            <span className="text-[15px] text-white/50">Delete</span>
          </button>
        </div>
      </div>
    </div>
  )
}
