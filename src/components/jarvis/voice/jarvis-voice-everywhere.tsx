"use client"

/**
 * Jarvis voice-everywhere — global Web Speech recognition wired to whatever
 * input/textarea/contentEditable element is currently focused.
 *
 * Two ways to invoke:
 *  1. Hold `⌘⇧V` (or `Ctrl+Shift+V` on win/linux) — start listening; release
 *     the modifier to stop. Transcript streams into the focused element.
 *  2. Click the floating mic FAB at bottom-right (only visible inside
 *     `/jarvis/*`). Click again to stop.
 *
 * If no input is focused, the FAB opens an inline scratch popup the user
 * can dictate into and then copy out — better than discarding speech.
 *
 * Reuses the existing `<VoiceButton>` SpeechRecognition pattern for the
 * underlying STT — same Web Speech API, no extra deps.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { Mic, MicOff, Copy, X } from "lucide-react"
import { cn } from "@/lib/utils"

// SpeechRecognition shape (mirrors voice-button.tsx so we don't add a global type pollution)
interface SR {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((ev: { results: Array<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: { new (): SR }
    webkitSpeechRecognition?: { new (): SR }
  }
}

function getRecognitionCtor(): { new (): SR } | null {
  if (typeof window === "undefined") return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function isEditable(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
  if (!el) return false
  if (el instanceof HTMLInputElement) {
    const t = (el.type || "text").toLowerCase()
    return ["text", "search", "url", "tel", "email", "password", ""].includes(t)
  }
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLElement && el.isContentEditable) return true
  return false
}

function insertAtCursor(el: HTMLInputElement | HTMLTextAreaElement | HTMLElement, text: string) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const before = el.value.slice(0, start)
    const after = el.value.slice(end)
    el.value = `${before}${text}${after}`
    const newPos = start + text.length
    el.setSelectionRange(newPos, newPos)
    // Fire input event so React state updates
    el.dispatchEvent(new Event("input", { bubbles: true }))
    return
  }
  if (el.isContentEditable) {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(document.createTextNode(text))
      range.collapse(false)
    } else {
      el.textContent = (el.textContent || "") + text
    }
    el.dispatchEvent(new Event("input", { bubbles: true }))
  }
}

export function JarvisVoiceEverywhere() {
  const pathname = usePathname() ?? ""
  const reduced = useReducedMotion() ?? false
  const [supported, setSupported] = useState(true)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [scratchOpen, setScratchOpen] = useState(false)
  const recRef = useRef<SR | null>(null)
  const focusedRef = useRef<HTMLElement | null>(null)
  const finalRef = useRef("")
  const lastInsertedRef = useRef("")

  // Detect support once
  useEffect(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setSupported(false)
      return
    }
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = "en-US"
    rec.onresult = (ev) => {
      let finalText = ""
      let interim = ""
      const results = ev.results as unknown as Array<{ 0: { transcript: string }; isFinal: boolean }>
      for (const r of results) {
        if (r.isFinal) finalText += r[0].transcript
        else interim += r[0].transcript
      }
      if (finalText) finalRef.current += finalText
      const combined = (finalRef.current + " " + interim).trim()
      setTranscript(combined)

      // Streamed insert — we add the delta since the last insert
      const target = focusedRef.current
      if (target && combined.length > lastInsertedRef.current.length) {
        const delta = combined.slice(lastInsertedRef.current.length)
        if (isEditable(target)) {
          try {
            insertAtCursor(target as HTMLInputElement | HTMLTextAreaElement | HTMLElement, delta)
            lastInsertedRef.current = combined
          } catch {
            // If insertion fails (focus moved, etc.), the scratch popup is fallback
          }
        }
      }
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recRef.current = rec
    return () => {
      try { rec.stop() } catch {}
    }
  }, [])

  // Start/stop helpers
  const start = useCallback(() => {
    if (!recRef.current) return
    finalRef.current = ""
    lastInsertedRef.current = ""
    setTranscript("")
    // Capture focus target snapshot
    const active = document.activeElement
    if (isEditable(active)) {
      focusedRef.current = active as HTMLElement
      setScratchOpen(false)
    } else {
      focusedRef.current = null
      setScratchOpen(true)
    }
    try {
      recRef.current.start()
      setListening(true)
    } catch {
      // already-started or other; ignore
    }
  }, [])

  const stop = useCallback(() => {
    try { recRef.current?.stop() } catch {}
    setListening(false)
  }, [])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  // ⌘⇧V chord
  useEffect(() => {
    if (!pathname.startsWith("/jarvis")) return
    const onKey = (e: KeyboardEvent) => {
      const trigger = navigator.platform.includes("Mac") ? e.metaKey : e.ctrlKey
      if (trigger && e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault()
        toggle()
      }
      if (e.key === "Escape" && listening) {
        stop()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pathname, toggle, listening, stop])

  if (!pathname.startsWith("/jarvis")) return null
  if (!supported) return null

  const copyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(transcript)
    } catch {}
  }

  return (
    <>
      {/* Scratch popup — only when there's no focused input + we have transcript */}
      <AnimatePresence>
        {scratchOpen && (listening || transcript) ? (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-24 right-4 z-[70] w-[min(380px,90vw)] overflow-hidden rounded-lg border border-mem-border-strong bg-mem-surface-1 shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-mem-border bg-mem-surface-2 px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-mem-text-muted">
                {listening ? "Listening — no input focused" : "Captured speech"}
              </span>
              <button
                aria-label="Close"
                onClick={() => { setScratchOpen(false); stop() }}
                className="rounded-md p-1 text-mem-text-muted transition hover:bg-mem-surface-3 hover:text-mem-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </header>
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words p-3 text-sm text-mem-text-primary">
              {transcript || <span className="text-mem-text-muted">Speak…</span>}
            </div>
            {transcript ? (
              <footer className="flex items-center justify-end gap-2 border-t border-mem-border bg-mem-surface-2 px-3 py-2">
                <button
                  onClick={copyTranscript}
                  className="inline-flex items-center gap-1 rounded-md border border-mem-border bg-mem-surface-1 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-mem-text-secondary transition hover:bg-mem-surface-3 hover:text-mem-text-primary"
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </footer>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Floating mic FAB — bottom right, above status bar */}
      <button
        type="button"
        aria-label={listening ? "Stop dictation" : "Start dictation (⌘⇧V)"}
        title={listening ? "Stop dictation (Esc)" : "Dictate into focused input — ⌘⇧V"}
        onClick={toggle}
        className={cn(
          "fixed bottom-10 right-4 z-[60] flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-all",
          listening
            ? "border-mem-status-stuck/50 bg-mem-status-stuck/15 text-mem-status-stuck animate-pulse"
            : "border-mem-border-strong bg-mem-surface-1 text-mem-text-secondary hover:bg-mem-surface-2 hover:text-mem-text-primary",
        )}
      >
        {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>
    </>
  )
}
