"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import useSWR from "swr"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select"
import { ArrowLeft, Star, Save, Beaker, Brain, Sparkles, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { motion } from "framer-motion"
import {
  listPersonas, updatePersona, setDefaultPersona,
  listMemories, updateMemory,
  previewInjection,
  type Persona, type Memory,
} from "@/lib/api/memory"
import { TokenMeter } from "@/components/memory/token-meter"
import { SaveIndicator, type SaveState } from "@/components/memory/save-indicator"
import ReactMarkdown from "react-markdown"

const SAVE_DEBOUNCE = 700

export default function PersonaDetailPage() {
  const params = useParams()
  const id = String(params?.id || "")
  const router = useRouter()

  const { data: personasData = [], mutate: refetchPersonas } = useSWR(
    ["personas", "all"],
    () => listPersonas({ business_id: null, include_archived: true })
  )
  const persona = personasData.find((p) => p.id === id) || null

  const { data: memoryData, mutate: refetchMemories } = useSWR(
    ["persona-memories", id],
    () => listMemories({ persona_id: id, include_archived: false, limit: 200 })
  )
  const personaMemories = memoryData?.data || []

  const { data: globalMemories = [] } = useSWR(
    ["global-memories"],
    async () => (await listMemories({ persona_id: "global", include_archived: false, limit: 200 })).data
  )

  const [draft, setDraft] = useState<Persona | null>(persona)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(persona ? new Date(persona.updated_at) : null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [testInput, setTestInput] = useState("")
  const [testOutput, setTestOutput] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => { if (persona && !draft) setDraft(persona) }, [persona, draft])

  function patch(p: Partial<Persona>) {
    if (!draft) return
    const next = { ...draft, ...p }
    setDraft(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSaveState("saving")
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await updatePersona(draft.id, p)
        setSaveState("saved")
        setLastSavedAt(new Date())
        setDraft(r)
        refetchPersonas()
      } catch (e) {
        setSaveState("error")
        toast.error(e instanceof Error ? e.message : "Save failed")
      }
    }, SAVE_DEBOUNCE)
  }

  async function handleAttach(memId: string) {
    try {
      await updateMemory(memId, { persona_id: id })
      toast.success("Attached")
      refetchMemories()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
  }

  async function handleDetach(memId: string) {
    try {
      await updateMemory(memId, { persona_id: null })
      toast.success("Detached — now a global memory")
      refetchMemories()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed") }
  }

  async function handleTest() {
    if (!testInput.trim() || !draft) return
    setTesting(true); setTestOutput(null)
    try {
      const r = await fetch("/api/memories/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_id: draft.id, message: testInput }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || "Test failed")
      setTestOutput(data.reply || data.error || "(no reply)")
    } catch (e) {
      setTestOutput(`Error: ${e instanceof Error ? e.message : "unknown"}`)
    } finally { setTesting(false) }
  }

  const { data: injectionPreview } = useSWR(
    ["inject-preview-persona", id],
    () => previewInjection({ persona_id: id, max_tokens: 4000 }),
    { revalidateOnFocus: false }
  )

  const otherPersonas = useMemo(() => personasData.filter((p) => p.id !== id), [personasData, id])

  if (!persona || !draft) {
    return (
      <div className="space-y-3">
        <Link href="/agency/memory" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Memory HQ
        </Link>
        <Card className="p-12 text-center text-sm text-muted-foreground">Persona not found.</Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/agency/memory" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Memory HQ
        </Link>
      </div>

      {/* Header */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-4">
              <button
                onClick={() => {
                  const e = prompt("New emoji:", draft.emoji) || draft.emoji
                  if (e !== draft.emoji) patch({ emoji: e })
                }}
                className="text-5xl hover:scale-110 transition-transform"
              >
                {draft.emoji}
              </button>
              <div className="flex-1">
                <Input
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  className="border-0 bg-transparent p-0 text-2xl font-bold focus-visible:ring-0"
                />
                <Input
                  value={draft.description || ""}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder="One-line description"
                  className="mt-1 border-0 bg-transparent p-0 text-sm text-muted-foreground focus-visible:ring-0"
                />
                <div className="mt-2 flex items-center gap-2">
                  {draft.is_default && <Badge className="bg-amber-500/15 text-amber-300 border-amber-400/40"><Star className="mr-1 h-3 w-3 fill-amber-400" /> Default</Badge>}
                  <Badge variant="outline" className="text-[10px]">📚 {personaMemories.length} memories</Badge>
                  {draft.parent_persona_id && (
                    <Badge variant="outline" className="text-[10px]">↳ inherits from {personasData.find((p) => p.id === draft.parent_persona_id)?.name || "parent"}</Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SaveIndicator state={saveState} lastSavedAt={lastSavedAt} />
              {!draft.is_default && (
                <Button variant="outline" size="sm" onClick={async () => { try { await setDefaultPersona(draft.id); refetchPersonas(); toast.success("Set as default") } catch (e) { toast.error(e instanceof Error ? e.message : "Failed") } }}>
                  <Star className="mr-1 h-3.5 w-3.5" /> Set default
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* System prompt */}
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <Brain className="h-4 w-4 text-amber-400" /> System prompt
          </h3>
          <Textarea
            value={draft.system_prompt}
            onChange={(e) => patch({ system_prompt: e.target.value })}
            placeholder="Prepended to every chat that uses this persona."
            className="min-h-[200px] font-mono text-xs"
          />
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{draft.system_prompt.length} chars · ~{Math.ceil(draft.system_prompt.length / 4)} tokens</span>
            <span>Markdown supported</span>
          </div>
        </Card>

        {/* Tone + inheritance */}
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4 text-amber-400" /> Tone settings
          </h3>
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs"><span>Verbose</span><span className="font-mono text-amber-300">{draft.tone_terse}</span><span>Terse</span></div>
              <Slider value={[draft.tone_terse]} min={0} max={100} step={5} onValueChange={(v) => patch({ tone_terse: v[0] })} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs"><span>Casual</span><span className="font-mono text-amber-300">{draft.tone_formal}</span><span>Formal</span></div>
              <Slider value={[draft.tone_formal]} min={0} max={100} step={5} onValueChange={(v) => patch({ tone_formal: v[0] })} />
            </div>
            <div>
              <Label className="text-xs">Emoji mode</Label>
              <Select value={draft.emoji_mode} onValueChange={(v) => patch({ emoji_mode: v as "off" | "auto" | "on" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off — never emoji</SelectItem>
                  <SelectItem value="auto">Auto — context dependent</SelectItem>
                  <SelectItem value="on">On — encouraged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Inherits from</Label>
              <Select value={draft.parent_persona_id || "__none__"} onValueChange={(v) => patch({ parent_persona_id: v === "__none__" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {otherPersonas.map((p) => <SelectItem key={p.id} value={p.id}>{p.emoji} {p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">When inheriting, the parent's system prompt and memories merge in below this persona's own.</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Memories — attached vs available */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">📚 Memories attached to this persona</h3>
          <Link href="/agency/memory" className="text-xs text-amber-300 hover:text-amber-200">Manage all →</Link>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Attached ({personaMemories.length})</p>
            <ul className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
              {personaMemories.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-lg border bg-card p-2">
                  <span className="text-lg">{m.emoji}</span>
                  <span className="flex-1 truncate text-sm">{m.title}</span>
                  <Badge variant="outline" className="text-[10px]">{m.type}</Badge>
                  <button onClick={() => handleDetach(m.id)} className="rounded p-1 text-xs text-muted-foreground hover:text-foreground">Detach</button>
                </li>
              ))}
              {personaMemories.length === 0 && (
                <li className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No memories yet — attach from the right or create new from Memory HQ.</li>
              )}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Available global memories (click to attach)</p>
            <ul className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
              {globalMemories.map((m: Memory) => (
                <li key={m.id} className="flex items-center gap-2 rounded-lg border border-dashed bg-card/50 p-2">
                  <span className="text-lg">{m.emoji}</span>
                  <span className="flex-1 truncate text-sm">{m.title}</span>
                  <Badge variant="outline" className="text-[10px]">{m.type}</Badge>
                  <button onClick={() => handleAttach(m.id)} className="rounded p-1 text-xs text-amber-300 hover:text-amber-200">+ Attach</button>
                </li>
              ))}
              {globalMemories.length === 0 && (
                <li className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No global memories — every memory is already scoped to a persona.</li>
              )}
            </ul>
          </div>
        </div>
      </Card>

      {/* Test sandbox */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><Beaker className="h-4 w-4 text-amber-400" /> Test sandbox</h3>
        <p className="mb-3 text-xs text-muted-foreground">Send a message through this persona's full memory pack to see how it'd respond.</p>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <Textarea
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder="Try something like: 'Write me a follow-up DM for a lead who hasn't responded.'"
              className="min-h-[120px]"
            />
            <Button onClick={handleTest} disabled={testing || !testInput.trim()} className="bg-amber-500 hover:bg-amber-600 text-amber-950">
              {testing ? <><RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> Running…</> : <><Beaker className="mr-1 h-3.5 w-3.5" /> Run test</>}
            </Button>
          </div>
          <div className="rounded-lg border bg-card/40 p-3 text-sm">
            <div className="mb-1 text-[10px] uppercase text-muted-foreground">Reply</div>
            {testOutput ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{testOutput}</ReactMarkdown>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">No reply yet.</div>
            )}
            {injectionPreview && (
              <div className="mt-3 border-t pt-2 text-[10px] text-muted-foreground">
                ~{injectionPreview.tokens_used} tokens of memory injected · {injectionPreview.memory_ids.length} memories
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
