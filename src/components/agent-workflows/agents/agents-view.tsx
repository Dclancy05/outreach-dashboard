"use client"

/**
 * Agents subtab — list of agent .md files in Jarvis/agent-skills/, plus an
 * editor for the selected one. Reuses TreeView + FileEditor scoped to that
 * vault subpath. New agents are created via the dashboard form (which writes
 * the .md file via /api/agents) so the slug + frontmatter are validated.
 */

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Bot, Plus, Play, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { TreeView } from "@/components/memory-tree/tree-view"
import { FileEditor } from "@/components/memory-tree/file-editor"
import { listAgents, createAgent, testAgent, MODEL_OPTIONS, AVAILABLE_TOOLS, type Agent, type AgentModel } from "@/lib/api/agents"

const AGENT_DIR_PREFIX = "/Jarvis/agent-skills/"

export function AgentsView() {
  const { data: agents = [], mutate } = useSWR<Agent[]>("agents", () => listAgents({ include_archived: false }))
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  // Find the agent record (DB metadata) for the selected file path
  const selectedSlug = selectedPath?.startsWith(AGENT_DIR_PREFIX) ? selectedPath.slice(AGENT_DIR_PREFIX.length).replace(/\.md$/, "") : null
  const selectedAgent = selectedSlug ? agents.find(a => a.slug === selectedSlug) : null

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] h-full">
      {/* Left: scoped tree */}
      <div className="border-r border-zinc-800/60 flex flex-col">
        <div className="px-3 py-2 border-b border-zinc-800/60 flex items-center justify-between">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">Agents</span>
          <NewAgentDialog onCreated={() => mutate()} />
        </div>
        <div className="flex-1 overflow-auto">
          <TreeView
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
            rootPath="/Jarvis/agent-skills"
          />
        </div>
      </div>

      {/* Right: file editor + agent metadata */}
      <div className="flex flex-col min-h-0">
        {selectedAgent && (
          <div className="px-4 py-2 border-b border-zinc-800/60 flex items-center gap-2 flex-wrap shrink-0">
            <span className="text-base">{selectedAgent.emoji || "🤖"}</span>
            <span className="font-medium text-zinc-100">{selectedAgent.name}</span>
            <Badge variant="outline" className="text-[10px]">{selectedAgent.model}</Badge>
            {selectedAgent.tools.slice(0, 4).map(t => (
              <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
            ))}
            {selectedAgent.tools.length > 4 && (
              <Badge variant="secondary" className="text-[10px]">+{selectedAgent.tools.length - 4}</Badge>
            )}
            {selectedAgent.is_orchestrator && (
              <Badge className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">orchestrator</Badge>
            )}
            <span className="text-xs text-zinc-500 ml-auto">used {selectedAgent.use_count}×</span>
            <TestAgentDialog agent={selectedAgent} />
          </div>
        )}
        {selectedPath ? (
          selectedPath.startsWith(AGENT_DIR_PREFIX) && selectedPath.endsWith(".md") ? (
            <FileEditor key={selectedPath} path={selectedPath} onPathChange={setSelectedPath} />
          ) : (
            <EmptyHint message="Pick an agent .md file under Jarvis/agent-skills/" />
          )
        ) : (
          <EmptyHint message="Pick an agent on the left, or click + to make a new one." />
        )}
      </div>
    </div>
  )
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm">
      <Bot className="w-8 h-8 mb-3 text-zinc-700" />
      <div>{message}</div>
      <div className="text-xs text-zinc-600 mt-2 max-w-md text-center px-6">
        Each agent is a markdown file. The frontmatter is the recipe (model, tools, parent), the body is the system prompt. They auto-sync to Claude Code on the AI VPS too.
      </div>
    </div>
  )
}

// ─── New agent dialog ──────────────────────────────────────────────────────

function NewAgentDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [emoji, setEmoji] = useState("🤖")
  const [description, setDescription] = useState("")
  const [model, setModel] = useState<AgentModel>("sonnet")
  const [tools, setTools] = useState<string[]>(["Bash", "Read"])
  const [systemPrompt, setSystemPrompt] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")

  async function submit() {
    setSubmitting(true)
    try {
      await createAgent({
        name, slug: slug || slugify(name), emoji, description, model, tools,
        system_prompt: systemPrompt || undefined,
      })
      toast.success("Agent created")
      onCreated()
      setOpen(false)
      setName(""); setSlug(""); setDescription(""); setSystemPrompt("")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-zinc-400">
          <Plus className="w-3 h-3 mr-1" /> New
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bot className="w-4 h-4" /> New agent</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div>
              <Label>Emoji</Label>
              <Input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={4} />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={e => { setName(e.target.value); if (!slug) setSlug(slugify(e.target.value)) }} placeholder="Code tester" />
            </div>
          </div>
          <div>
            <Label>Slug <span className="text-zinc-500 text-xs ml-1">(filename, lowercase letters/digits/dashes)</span></Label>
            <Input value={slug} onChange={e => setSlug(slugify(e.target.value))} placeholder="code-tester" />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Runs the test suite and reports failures." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Model</Label>
              <Select value={model} onValueChange={v => setModel(v as AgentModel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label} <span className="text-xs text-zinc-500">{m.cost}</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tools</Label>
              <div className="flex flex-wrap gap-1 pt-1">
                {AVAILABLE_TOOLS.map(t => (
                  <button key={t}
                    onClick={() => setTools(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                    className={`text-[10px] px-2 py-0.5 rounded border ${tools.includes(t) ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-zinc-800/40 border-zinc-700 text-zinc-400"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <Label>System prompt <span className="text-zinc-500 text-xs ml-1">(optional — a stub is created if blank)</span></Label>
            <Textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={6}
              placeholder="You are the code-tester agent. Your job is to..." className="font-mono text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !name.trim()}>{submitting ? "Creating..." : "Create agent"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Test agent dialog ─────────────────────────────────────────────────────

function TestAgentDialog({ agent }: { agent: Agent }) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [result, setResult] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  async function run() {
    setRunning(true); setResult(null)
    try {
      const r = await testAgent(agent.id, { prompt })
      setResult(`Run #${r.run_id} queued. View in Runs subtab → it'll show up shortly.`)
      toast.success("Test queued — switch to the Runs subtab to watch it.")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
          <Play className="w-3 h-3 mr-1" /> Test
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="w-4 h-4" /> Test {agent.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Test prompt</Label>
            <Textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={6}
              placeholder="What input do you want to send to this agent?" className="text-sm" />
            <p className="text-xs text-zinc-500 mt-1">
              Sandbox run — capped at $1, 5 steps, 1 minute. Watch live in the Runs subtab.
            </p>
          </div>
          {result && (
            <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2 flex items-start gap-2">
              <FileText className="w-3 h-3 mt-0.5 shrink-0" /> {result}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          <Button onClick={run} disabled={running || !prompt.trim()}>{running ? "Queueing..." : "Run"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
