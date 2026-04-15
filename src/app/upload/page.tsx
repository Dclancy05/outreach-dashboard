"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useState, useRef, useCallback } from "react"
import Link from "next/link"
import { Upload, X, FileText, Image, File, CheckCircle2, AlertCircle, ArrowLeft, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  status: "uploading" | "processing" | "done" | "error"
  progress: number
  preview?: CsvPreview | ImagePreview | GenericPreview
  error?: string
}

interface CsvPreview {
  kind: "csv"
  columns: string[]
  rowCount: number
  rows: string[][]
}

interface ImagePreview {
  kind: "image"
  dataUrl: string
  width?: number
  height?: number
}

interface GenericPreview {
  kind: "generic"
  message: string
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ type }: { type: string }) {
  if (type.startsWith("image/")) return <Image className="h-5 w-5 text-pink-400" />
  if (type === "text/csv" || type.includes("spreadsheet") || type.includes("excel") || type.includes("sheet"))
    return <FileText className="h-5 w-5 text-green-400" />
  return <File className="h-5 w-5 text-blue-400" />
}

export default function UploadPage() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: globalThis.File) => {
    const id = Math.random().toString(36).slice(2)
    const entry: UploadedFile = {
      id,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      status: "uploading",
      progress: 0,
    }
    setFiles(prev => [...prev, entry])

    try {
      const urlRes = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      })
      if (!urlRes.ok) {
        const err = await urlRes.json()
        throw new Error(err.error || "Failed to get upload URL")
      }
      const { signedUrl, token, path } = await urlRes.json()

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("PUT", signedUrl)
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 95)
            setFiles(prev => prev.map(f => f.id === id ? { ...f, progress } : f))
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            reject(new Error(`Upload failed (${xhr.status})`))
          }
        }
        xhr.onerror = () => reject(new Error("Network error during upload"))
        xhr.send(file)
      })

      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: "processing", progress: 97 } : f))

      const processRes = await fetch("/api/upload-process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          filename: file.name,
          size: file.size,
          contentType: file.type,
        }),
      })

      if (!processRes.ok) {
        const err = await processRes.json()
        throw new Error(err.error || "Processing failed")
      }

      const result = await processRes.json()

      setFiles(prev =>
        prev.map(f => f.id === id ? { ...f, status: "done", progress: 100, preview: result.preview } : f)
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed"
      setFiles(prev =>
        prev.map(f => f.id === id ? { ...f, status: "error", error: message } : f)
      )
    }
  }, [])

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return
    Array.from(fileList).forEach(uploadFile)
  }, [uploadFile])

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex items-center gap-3 mb-6">
          <Link
            href="/agency"
            className="rounded-xl p-2 hover:bg-muted/30 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <div className="rounded-xl p-2.5 bg-blue-500/20">
                <Upload className="h-6 w-6 text-blue-400" />
              </div>
              Upload Files
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Drop files here to preview and process them · Supports files up to 50MB
            </p>
          </div>
        </motion.div>

        {/* Drop Zone */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all backdrop-blur-xl",
              dragOver
                ? "border-primary bg-primary/5 scale-[1.02]"
                : "border-border/50 hover:border-muted-foreground/50 hover:bg-card/30"
            )}
          >
            <Upload className={cn("h-10 w-10 mx-auto mb-3 transition-colors", dragOver ? "text-primary" : "text-muted-foreground")} />
            <p className="text-lg font-medium mb-1">
              {dragOver ? "Drop files here" : "Drag & drop files here"}
            </p>
            <p className="text-sm text-muted-foreground">
              or click to browse · CSV, XLSX, images, PDFs, anything up to 50MB
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        </motion.div>

        {/* File List */}
        {files.length > 0 && (
          <motion.div variants={container} initial="hidden" animate="show" className="mt-6 space-y-3">
            {files.map((file) => (
              <motion.div key={file.id} variants={item} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4 shadow-lg">
                <div className="flex items-start gap-3">
                  <FileIcon type={file.type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatSize(file.size)}
                      </span>
                      {file.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                      {file.status === "error" && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                      {(file.status === "uploading" || file.status === "processing") && <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {file.type}
                      {file.status === "processing" && " · Processing..."}
                    </p>

                    {(file.status === "uploading" || file.status === "processing") && (
                      <div className="mt-2 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                    )}

                    {file.status === "error" && (
                      <p className="mt-1 text-xs text-red-400">{file.error}</p>
                    )}

                    {file.preview?.kind === "csv" && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground mb-2">
                          {file.preview.columns.length} columns · {file.preview.rowCount.toLocaleString()} rows
                        </p>
                        <div className="overflow-x-auto rounded-xl border border-border/50">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/20">
                                {file.preview.columns.map((col, i) => (
                                  <th key={i} className="px-3 py-1.5 text-left font-medium whitespace-nowrap text-muted-foreground">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {file.preview.rows.map((row, ri) => (
                                <tr key={ri} className="border-t border-border/30 hover:bg-muted/10 transition-colors">
                                  {row.map((cell, ci) => (
                                    <td key={ci} className="px-3 py-1 whitespace-nowrap max-w-[200px] truncate">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {file.preview?.kind === "image" && (
                      <div className="mt-3">
                        <img
                          src={file.preview.dataUrl}
                          alt={file.name}
                          className="max-h-48 rounded-xl border border-border/50 object-contain"
                        />
                      </div>
                    )}

                    {file.preview?.kind === "generic" && (
                      <p className="mt-2 text-xs text-muted-foreground">{file.preview.message}</p>
                    )}
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(file.id) }}
                    className="rounded-xl p-1 hover:bg-muted/30 transition-colors"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
