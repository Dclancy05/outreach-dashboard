"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { createClient } from "@supabase/supabase-js"
import { motion } from "framer-motion"
import { Upload, FileCheck, Clock, AlertCircle } from "lucide-react"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MAX_FILE_SIZE = 50 * 1024 * 1024

interface UploadItem {
  id: string
  filename: string
  path: string
  size: number
  mime_type: string
  created_at: string
  processed: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  return (bytes / (1024 * 1024)).toFixed(1) + " MB"
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }

export default function DropPage() {
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState("")
  const [progress, setProgress] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchUploads = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from("george_uploads")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
    if (data) setUploads(data)
  }, [])

  useEffect(() => {
    fetchUploads()
  }, [fetchUploads])

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files)
    if (fileArr.length === 0) return

    const oversized = fileArr.filter(f => f.size > MAX_FILE_SIZE)
    if (oversized.length > 0) {
      setError(`Files too large (max 50MB): ${oversized.map(f => f.name).join(", ")}`)
      return
    }

    setError("")
    setUploading(true)
    setProgress([])

    for (const file of fileArr) {
      const ts = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const path = `george/${ts}_${safeName}`

      setProgress(p => [...p, `Uploading ${file.name}...`])

      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(path, file, { contentType: file.type, upsert: false })

      if (uploadError) {
        setProgress(p => [...p, `❌ ${file.name}: ${uploadError.message}`])
        continue
      }

      const { error: insertError } = await supabase
        .from("george_uploads")
        .insert({
          filename: file.name,
          path,
          size: file.size,
          mime_type: file.type || "application/octet-stream",
        })

      if (insertError) {
        setProgress(p => [...p, `❌ ${file.name}: ${insertError.message}`])
      } else {
        setProgress(p => [...p, `✅ ${file.name}`])
      }
    }

    setUploading(false)
    fetchUploads()
  }, [fetchUploads])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files)
  }, [uploadFiles])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-8 pb-8"
    >
      <div className="max-w-2xl mx-auto space-y-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-3xl font-bold tracking-tight">Drop for George</h1>
          <p className="text-muted-foreground mt-1">Upload files · max 50MB each</p>
        </motion.div>

        {/* Upload Zone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-300
            bg-card/60 backdrop-blur-xl
            ${dragOver
              ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
              : "border-border/50 hover:border-primary/50 hover:bg-muted/30"
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => e.target.files && uploadFiles(e.target.files)}
          />
          <Upload className={`h-12 w-12 mx-auto mb-3 transition-colors ${dragOver ? "text-primary" : "text-muted-foreground/40"}`} />
          <p className="text-lg font-medium">
            {uploading ? "Uploading..." : "Drag & drop files here"}
          </p>
          <p className="text-muted-foreground text-sm mt-1">or click to browse</p>
        </motion.div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-red-500/10 border border-red-500/20 backdrop-blur-xl px-4 py-3 text-red-400 text-sm flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </motion.div>
        )}

        {/* Progress */}
        {progress.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 px-4 py-3 space-y-1"
          >
            {progress.map((msg, i) => (
              <p key={i} className="text-sm text-foreground">{msg}</p>
            ))}
          </motion.div>
        )}

        {/* Recent Uploads */}
        <div>
          <h2 className="text-lg font-semibold mb-3 text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Recent uploads (24h)
          </h2>
          {uploads.length === 0 ? (
            <p className="text-muted-foreground text-sm">No uploads yet</p>
          ) : (
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
              {uploads.map(u => (
                <motion.div
                  key={u.id}
                  variants={item}
                  className="flex items-center justify-between rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 px-4 py-3 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{u.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSize(u.size)} · {u.mime_type} · {timeAgo(u.created_at)}
                    </p>
                  </div>
                  <div className={`text-xs px-2.5 py-1 rounded-full ml-3 flex items-center gap-1 ${
                    u.processed
                      ? "bg-green-500/10 text-green-400 border border-green-500/20"
                      : "bg-muted/50 text-muted-foreground border border-border/30"
                  }`}>
                    {u.processed ? <FileCheck className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {u.processed ? "Processed" : "Pending"}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
