"use client"

import { useEffect, useState, useRef } from "react"
import { usePathname } from "next/navigation"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Sparkles, Loader2, Mic, MicOff } from "lucide-react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { createMemory, MEMORY_TYPES, type MemoryType } from "@/lib/api/memory"
import { cn } from "@/lib/utils"
import { VoiceButton } from "./voice-button"

interface Candidate {
  type: MemoryType
  title: string
  description: string
  body: string
  emoji: string
  why?: string
  how_to_apply?: string
  tags?: string[]
}

export function RememberPalette() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [analyzing, setAnalyzing] = useState(false)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const pathname = usePathname()

  // Keyboard binding: ⌘⇧K (anywhere) opens this palette. Plain ⌘K is owned by
  // the Jarvis cmdk (inside /jarvis) and the dashboard <CommandPalette /> (the
  // rest of the app, Phase 4 #2 of the terminals overhaul, 2026-05-04). Both of
  // those palettes have a "Quick remember" action that fires
  // `jarvis:open-remember-palette` to reach us programmatically — see the
  // listener below.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key.toLowerCase() !== "k") return
      if (!e.shiftKey) return // ⌘K alone is owned by the global cmdk now.
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [pathname])

  // Listen for programmatic opens (e.g. from Jarvis cmdk "Quick remember").
  useEffect(() => {
    const open = () => setOpen(true)
    window.addEventListener("jarvis:open-remember-palette", open)
    return () => window.removeEventListener("jarvis:open-remember-palette", open)
  }, [])

  useEffect(() => {
    if (open) {
      setText("")
      setCandidate(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  async function analyze() {
    if (!text.trim()) return
    setAnalyzing(true)
    try {
      const r = await fetch("/api/memories/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      })
      const data = await r.json()
      const first = data.candidates?.[0] as Candidate | undefined
      if (first) setCandidate(first)
      else {
        // fall back to user-typed memory
        const t = pickType(text)
        setCandidate({
          type: t,
          title: text.slice(0, 60),
          description: text.slice(0, 120),
          body: text,
          emoji: emojiFor(t),
          tags: [],
        })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to analyze")
    } finally { setAnalyzing(false) }
  }

  function pickType(s: string): MemoryType {
    const low = s.toLowerCase()
    if (/^(don'?t|never|always|stop|please|prefer|avoid)\b/.test(low)) return "feedback"
    if (/^i (am|'m|work as|build|run)\b/.test(low)) return "user"
    if (/(deadline|launching|shipping|due|by friday|by next)/.test(low)) return "project"
    if (/(see|check|tracked in|docs at|notion|linear)/.test(low)) return "reference"
    return "user"
  }
  function emojiFor(t: MemoryType): string {
    return MEMORY_TYPES.find((x) => x.value === t)?.emoji || "📝"
  }

  async function saveDirect() {
    if (!text.trim()) return
    const t = pickType(text)
    setSaving(true)
    try {
      await createMemory({
        title: text.slice(0, 60),
        description: text.slice(0, 120),
        body: text,
        type: t,
        emoji: emojiFor(t),
        source: "quick_add",
      })
      toast.success("Saved memory ✨")
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally { setSaving(false) }
  }

  async function saveCandidate() {
    if (!candidate) return
    setSaving(true)
    try {
      await createMemory({
        title: candidate.title,
        description: candidate.description,
        body: candidate.body,
        type: candidate.type,
        emoji: candidate.emoji,
        why: candidate.why || null,
        how_to_apply: candidate.how_to_apply || null,
        tags: candidate.tags || [],
        source: "quick_add",
      })
      toast.success("Memory saved ✨")
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl gap-3 p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent p-4 pb-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-300">
            <Sparkles className="h-3.5 w-3.5" /> Quick remember
            <span className="ml-auto text-muted-foreground">
              <kbd className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">⌘K</kbd>
            </span>
          </div>
        </div>
        <div className="px-4 pb-4 space-y-3">
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={text}
              onChange={(e) => { setText(e.target.value); setCandidate(null) }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  if (candidate) saveCandidate()
                  else if (text.trim()) saveDirect()
                }
              }}
              placeholder="Type something to remember… or paste a chat snippet"
              className="flex-1"
            />
            <VoiceButton onTranscript={(t) => setText(t)} />
          </div>

          {!candidate && text.trim() && (
            <div className="flex items-center gap-2">
              <Button onClick={analyze} disabled={analyzing} variant="outline" size="sm" className="flex-1">
                {analyzing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                AI: extract memories
              </Button>
              <Button onClick={saveDirect} disabled={saving} size="sm" className="flex-1 bg-amber-500 hover:bg-amber-600 text-amber-950">
                Save as-is ↵
              </Button>
            </div>
          )}

          {candidate && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-amber-400/40 bg-amber-500/5 p-3">
              <div className="flex items-start gap-2">
                <span className="text-2xl">{candidate.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase text-amber-300">{candidate.type}</span>
                    <span className="font-semibold">{candidate.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{candidate.description}</p>
                  {candidate.why && <p className="mt-2 text-[11px]"><strong>Why:</strong> {candidate.why}</p>}
                  {candidate.how_to_apply && <p className="text-[11px]"><strong>How:</strong> {candidate.how_to_apply}</p>}
                  {candidate.tags && candidate.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {candidate.tags.map((t) => <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">#{t}</span>)}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCandidate(null)}>Edit</Button>
                <Button onClick={saveCandidate} disabled={saving} className="ml-auto bg-amber-500 hover:bg-amber-600 text-amber-950">
                  {saving ? "Saving…" : "Save memory ✨"}
                </Button>
              </div>
            </motion.div>
          )}

          <p className="text-center text-[10px] text-muted-foreground">
            Tip: press ⌘K anywhere in the dashboard · Enter to save · ⏎+Shift for newline
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
