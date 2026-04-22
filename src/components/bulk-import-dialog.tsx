"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { SOCIAL_PLATFORMS } from "@/lib/platforms"
import { Upload, Loader2, AlertCircle, CheckCircle2, Copy, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  open: boolean
  onClose: () => void
  onImported: () => void
  proxies: { id: string; ip: string; location_city: string }[]
}

interface Preview {
  total: number
  new: number
  duplicates: number
  accounts: Array<{
    username: string
    platform?: string
    email?: string
    duplicate: boolean
    password?: string
    email_password?: string
    twofa_secret?: string
  }>
}

const SAMPLES: Record<string, string> = {
  csv: `username,password,email,email_password,twofa_secret
john_doe_23,SuperSecret1!,john23@gmail.com,appPwd123,JBSWY3DPEHPK3PXP
jane_smith_85,Pa$$word99,jane85@outlook.com,outlookPwd,KRSXG5BAKRXWK3D7`,
  colon: `john_doe_23:SuperSecret1!:john23@gmail.com:appPwd123:JBSWY3DPEHPK3PXP
jane_smith_85:Pa$$word99:jane85@outlook.com:outlookPwd:KRSXG5BAKRXWK3D7`,
  tab: `john_doe_23\tSuperSecret1!\tjohn23@gmail.com\tappPwd123\tJBSWY3DPEHPK3PXP`,
}

export default function BulkImportDialog({ open, onClose, onImported, proxies }: Props) {
  const [text, setText] = useState("")
  const [platform, setPlatform] = useState("instagram")
  const [proxyGroupId, setProxyGroupId] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)

  const doPreview = async () => {
    if (!text.trim()) {
      toast.error("Paste some accounts first")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/accounts/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", text, platform, proxy_group_id: proxyGroupId }),
      })
      const json = await res.json()
      if (res.ok) setPreview(json)
      else toast.error(json.error || "Parse failed")
    } catch (e: any) {
      toast.error(e.message)
    }
    setLoading(false)
  }

  const doImport = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/accounts/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "commit", text, platform, proxy_group_id: proxyGroupId }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(`Imported ${json.imported}${json.skipped ? ` (${json.skipped} duplicates skipped)` : ""}`)
        setText("")
        setPreview(null)
        onImported()
        onClose()
      } else toast.error(json.error)
    } catch (e: any) {
      toast.error(e.message)
    }
    setLoading(false)
  }

  const loadSample = (k: keyof typeof SAMPLES) => {
    setText(SAMPLES[k])
    setPreview(null)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-emerald-400" />
            Bulk Import Accounts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Default Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOCIAL_PLATFORMS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Proxy Group (optional)</Label>
              <Select value={proxyGroupId || "none"} onValueChange={(v) => setProxyGroupId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="None (assign later)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {proxies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.location_city || p.ip}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">
                Paste Accounts{" "}
                <span className="text-[10px] text-muted-foreground font-normal">
                  (CSV, colon, or tab separated)
                </span>
              </Label>
              <div className="flex gap-1">
                <button
                  onClick={() => loadSample("csv")}
                  className="text-[10px] text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded border border-blue-500/30"
                >
                  CSV
                </button>
                <button
                  onClick={() => loadSample("colon")}
                  className="text-[10px] text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded border border-blue-500/30"
                >
                  Colon
                </button>
                <button
                  onClick={() => loadSample("tab")}
                  className="text-[10px] text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded border border-blue-500/30"
                >
                  Tab
                </button>
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setPreview(null)
              }}
              placeholder={`username,password,email,email_password,twofa_secret
or user:pass:email:emailpass:2fa (one per line)`}
              className="w-full h-48 rounded-lg bg-muted/20 border border-border/40 p-3 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500/50"
            />
            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Formats: <code>user,pass,email,emailpass,2fa</code> or <code>user:pass:email:emailpass:2fa</code>. First line
              can be headers. 2FA is optional.
            </p>
          </div>

          {!preview && (
            <Button
              onClick={doPreview}
              disabled={loading || !text.trim()}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Parsing...
                </>
              ) : (
                <>
                  Preview Import
                </>
              )}
            </Button>
          )}

          {preview && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                  Total: {preview.total}
                </Badge>
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> New: {preview.new}
                </Badge>
                {preview.duplicates > 0 && (
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                    <AlertCircle className="h-3 w-3 mr-1" /> Duplicates: {preview.duplicates}
                  </Badge>
                )}
              </div>

              <div className="rounded-xl bg-muted/20 border border-border/40 max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-card/60 sticky top-0">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1.5 font-medium">Username</th>
                      <th className="px-2 py-1.5 font-medium">Email</th>
                      <th className="px-2 py-1.5 font-medium">Password</th>
                      <th className="px-2 py-1.5 font-medium">2FA</th>
                      <th className="px-2 py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.accounts.map((a, i) => (
                      <tr
                        key={i}
                        className={cn(
                          "border-t border-border/20",
                          a.duplicate && "opacity-50",
                        )}
                      >
                        <td className="px-2 py-1 font-mono">@{a.username}</td>
                        <td className="px-2 py-1 font-mono text-muted-foreground truncate max-w-[120px]">
                          {a.email || "—"}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground">{a.password ? "✓" : "—"}</td>
                        <td className="px-2 py-1 text-muted-foreground">{a.twofa_secret ? "✓" : "—"}</td>
                        <td className="px-2 py-1">
                          {a.duplicate ? (
                            <span className="text-amber-400 text-[10px]">Duplicate</span>
                          ) : (
                            <span className="text-green-400 text-[10px]">New</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setPreview(null)} className="rounded-xl">
                  Edit
                </Button>
                <Button
                  onClick={doImport}
                  disabled={loading || preview.new === 0}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importing...
                    </>
                  ) : (
                    <>
                      Import {preview.new} new account{preview.new !== 1 ? "s" : ""}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
