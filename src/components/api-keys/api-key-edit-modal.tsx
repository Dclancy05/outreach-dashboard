"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Eye, EyeOff, Save, RefreshCw, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import { PROVIDERS, findProviderBySlug } from "@/lib/secrets-catalog"

export type ApiKeyForEdit = {
  id?: string
  name: string
  provider: string
  env_var: string
  notes: string | null
  expires_at: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: ApiKeyForEdit | null
  onSaved: () => void
}

export function ApiKeyEditModal({ open, onOpenChange, initial, onSaved }: Props) {
  const isEdit = Boolean(initial?.id)

  const [provider, setProvider] = useState<string>(initial?.provider || "openai")
  const [name, setName] = useState<string>(initial?.name || "")
  const [envVar, setEnvVar] = useState<string>(initial?.env_var || "")
  const [value, setValue] = useState<string>("")
  const [reveal, setReveal] = useState(false)
  const [expiresOn, setExpiresOn] = useState<string>(
    initial?.expires_at ? initial.expires_at.slice(0, 10) : ""
  )
  const [notes, setNotes] = useState<string>(initial?.notes || "")
  const [saving, setSaving] = useState(false)

  const providerEntry = useMemo(() => findProviderBySlug(provider), [provider])

  // When provider changes (and we're not editing) auto-fill name + canonical env var.
  useEffect(() => {
    if (isEdit) return
    if (!providerEntry) return
    if (providerEntry.slug === "custom") {
      if (!name) setName("Custom key")
    } else {
      const canonicalEnv = providerEntry.envVars[0] || ""
      if (canonicalEnv) setEnvVar(canonicalEnv)
      if (!name || name === "Custom key" || isAutoName(name)) {
        setName(`${providerEntry.label} key`)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  function isAutoName(n: string) {
    return PROVIDERS.some((p) => n === `${p.label} key`)
  }

  // Reset every time the modal opens with new `initial`.
  useEffect(() => {
    if (!open) return
    setProvider(initial?.provider || "openai")
    setName(initial?.name || "")
    setEnvVar(initial?.env_var || "")
    setValue("")
    setReveal(false)
    setExpiresOn(initial?.expires_at ? initial.expires_at.slice(0, 10) : "")
    setNotes(initial?.notes || "")
    setSaving(false)
  }, [open, initial])

  async function handleSave() {
    const cleanedEnvVar = envVar.trim().toUpperCase()
    if (!name.trim()) {
      toast.error("Give it a name so you remember which key this is.")
      return
    }
    if (!cleanedEnvVar || !/^[A-Z][A-Z0-9_]*$/.test(cleanedEnvVar)) {
      toast.error("Env var name must be UPPER_SNAKE_CASE.")
      return
    }
    if (!isEdit && !value.trim()) {
      toast.error("Paste the key value before saving.")
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        action: isEdit ? "update" : "create",
        name: name.trim(),
        provider,
        env_var: cleanedEnvVar,
        notes: notes.trim() ? notes.trim() : null,
        expires_at: expiresOn ? new Date(expiresOn).toISOString() : null,
      }
      if (isEdit) body.id = initial!.id
      if (value.trim()) body.value = value.trim()

      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) {
        throw new Error(j.error || `Save failed: ${res.status}`)
      }

      toast.success(isEdit ? "Key updated" : "Key added")
      onSaved()
      onOpenChange(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "save failed"
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit API key" : "Add API key"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-zinc-400">
              Source
            </Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a service" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.slug} value={p.slug}>
                    <span className="mr-2">{p.emoji ?? "🔑"}</span>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {providerEntry?.help && (
              <p className="text-[11px] text-zinc-500">
                {providerEntry.help}
                {providerEntry.href && (
                  <>
                    {" "}
                    <a
                      href={providerEntry.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline inline-flex items-center gap-0.5"
                    >
                      Get key <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                )}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-zinc-400">
              Name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="OpenAI prod"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-zinc-400">
              Env var name
            </Label>
            <Input
              value={envVar}
              onChange={(e) => setEnvVar(e.target.value.toUpperCase())}
              placeholder="OPENAI_API_KEY"
              disabled={providerEntry?.slug !== "custom" && !isEdit}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-zinc-500">
              The runtime asks for the secret by this exact name. Auto-filled
              from the chosen source — pick &ldquo;Custom&rdquo; to override.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-zinc-400">
              Value {isEdit && <span className="text-zinc-600">(leave blank to keep current)</span>}
            </Label>
            <div className="relative">
              <Input
                type={reveal ? "text" : "password"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={providerEntry?.placeholder ?? "Paste the key…"}
                className="pr-9 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
                aria-label={reveal ? "Hide" : "Show"}
              >
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-zinc-400">
              Expires (optional)
            </Label>
            <Input
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
            />
            <p className="text-[11px] text-zinc-500">
              We&apos;ll mark it expired and stop using it after this date.
              Leave blank if it never expires.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-zinc-400">
              Notes (optional)
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything to remember — e.g. which Vercel project this came from."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isEdit ? "Save changes" : "Add key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
