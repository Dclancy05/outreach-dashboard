import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import * as XLSX from "xlsx"

export const runtime = "nodejs"
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
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
    const { path: filePath, filename, size, contentType } = await req.json()
    if (!filePath) {
      return NextResponse.json({ error: "Missing file path" }, { status: 400 })
    }

    const name = filename || filePath.split("/").pop() || filePath
    const type = contentType || "application/octet-stream"
    const fileSize = size || 0

    // CSV files
    if (type === "text/csv" || name.endsWith(".csv")) {
      const { data, error } = await supabase.storage.from("uploads").download(filePath)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const text = await data.text()
      const parsed = parseCSV(text)
      return NextResponse.json({
        filename: name, size: fileSize, type: type || "text/csv",
        preview: { kind: "csv", columns: parsed.columns, rowCount: parsed.rowCount, rows: parsed.rows },
      })
    }

    // XLSX/XLS files
    if (name.endsWith(".xlsx") || name.endsWith(".xls") || type.includes("spreadsheet") || type.includes("excel")) {
      const { data, error } = await supabase.storage.from("uploads").download(filePath)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const buffer = await data.arrayBuffer()
      const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }) as string[][]

      if (jsonData.length === 0) {
        return NextResponse.json({
          filename: name, size: fileSize, type,
          preview: { kind: "generic", message: "Empty spreadsheet" },
        })
      }

      const columns = jsonData[0].map(c => String(c ?? ""))
      const dataRows = jsonData.slice(1).filter(r => r.some(c => c != null && String(c).trim() !== ""))
      const previewRows = dataRows.slice(0, 10).map(r => columns.map((_, i) => String(r[i] ?? "")))

      return NextResponse.json({
        filename: name, size: fileSize, type,
        preview: { kind: "csv", columns, rowCount: dataRows.length, rows: previewRows },
      })
    }

    // Images - generate signed URL for preview
    if (type.startsWith("image/")) {
      const { data, error } = await supabase.storage.from("uploads").createSignedUrl(filePath, 3600)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({
        filename: name, size: fileSize, type,
        preview: { kind: "image", dataUrl: data.signedUrl },
      })
    }

    // Other files
    return NextResponse.json({
      filename: name, size: fileSize, type,
      preview: { kind: "generic", message: `File uploaded successfully (${formatSize(fileSize)})` },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Processing failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
