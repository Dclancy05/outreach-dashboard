import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = "uploads"

async function ensureBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (!data) {
    await supabase.storage.createBucket(BUCKET, { public: true })
  }
}

function parseCSV(text: string): { columns: string[]; rowCount: number; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return { columns: [], rowCount: 0, rows: [] }

  function parseLine(line: string): string[] {
    const result: string[] = []
    let current = ""
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim())
        current = ""
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const columns = parseLine(lines[0])
  const dataLines = lines.slice(1)
  const previewRows = dataLines.slice(0, 10).map(parseLine)
  return { columns, rowCount: dataLines.length, rows: previewRows }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const { name, size, type } = file
    const buffer = Buffer.from(await file.arrayBuffer())

    // Store to Supabase Storage
    await ensureBucket()
    const ts = Date.now()
    const storagePath = `${ts}-${name}`
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: type || "application/octet-stream", upsert: true })

    const storageUrl = uploadErr
      ? null
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`

    // Also log to a table so George can see what was uploaded
    try {
      await supabase.from("file_uploads").insert({
        filename: name,
        size,
        content_type: type || "application/octet-stream",
        storage_path: storagePath,
        storage_url: storageUrl,
      })
    } catch { /* table might not exist yet */ }

    // CSV files
    if (type === "text/csv" || name.endsWith(".csv")) {
      const text = buffer.toString("utf-8")
      const parsed = parseCSV(text)
      return NextResponse.json({
        filename: name, size, type: type || "text/csv",
        storageUrl,
        preview: { kind: "csv", columns: parsed.columns, rowCount: parsed.rowCount, rows: parsed.rows },
      })
    }

    // Images
    if (type.startsWith("image/")) {
      if (buffer.byteLength > 2 * 1024 * 1024) {
        return NextResponse.json({
          filename: name, size, type, storageUrl,
          preview: { kind: "generic", message: `Image uploaded (${formatSize(size)}) — too large for inline preview` },
        })
      }
      const base64 = buffer.toString("base64")
      const dataUrl = `data:${type};base64,${base64}`
      return NextResponse.json({
        filename: name, size, type, storageUrl,
        preview: { kind: "image", dataUrl },
      })
    }

    // Other files
    return NextResponse.json({
      filename: name, size, type: type || "application/octet-stream", storageUrl,
      preview: { kind: "generic", message: `File saved (${formatSize(size)})` },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// List recent uploads
export async function GET() {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).list("", {
      limit: 50, sortBy: { column: "created_at", order: "desc" },
    })
    if (error) return NextResponse.json({ files: [] })
    const files = (data || []).map(f => ({
      name: f.name,
      size: f.metadata?.size,
      created: f.created_at,
      url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${f.name}`,
    }))
    return NextResponse.json({ files })
  } catch {
    return NextResponse.json({ files: [] })
  }
}
