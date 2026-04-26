"use client"

import { Mic, MicOff } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface SpeechRecognition {
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
    SpeechRecognition?: { new (): SpeechRecognition }
    webkitSpeechRecognition?: { new (): SpeechRecognition }
  }
}

export function VoiceButton({ onTranscript, className }: { onTranscript: (text: string) => void; className?: string }) {
  const [recording, setRecording] = useState(false)
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const finalRef = useRef("")

  useEffect(() => {
    const Ctor = (typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null
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
      onTranscript(combined)
    }
    rec.onerror = () => setRecording(false)
    rec.onend = () => setRecording(false)
    recognitionRef.current = rec
    return () => { try { rec.stop() } catch {} }
  }, [onTranscript])

  function toggle() {
    if (!recognitionRef.current) return
    if (recording) {
      try { recognitionRef.current.stop() } catch {}
      setRecording(false)
    } else {
      finalRef.current = ""
      try { recognitionRef.current.start() } catch {}
      setRecording(true)
    }
  }

  if (!supported) return null
  return (
    <button
      onClick={toggle}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md border transition-all",
        recording
          ? "border-red-500/50 bg-red-500/15 text-red-300 animate-pulse"
          : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground",
        className
      )}
      title={recording ? "Stop recording" : "Voice input"}
    >
      {recording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
    </button>
  )
}
