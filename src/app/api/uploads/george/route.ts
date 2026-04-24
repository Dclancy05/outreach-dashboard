import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/uploads/george
 *   ?since_hours=24  — only uploads from the last N hours (default: 24)
 */
export async function GET(req: NextRequest) {
  const hoursStr = new URL(req.url).searchParams.get("since_hours")
  const hours = hoursStr ? Math.max(1, parseInt(hoursStr)) : 24
  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from("george_uploads")
    .select("*")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/**
 * POST /api/uploads/george
 *   Body: { filename, path, size, mime_type }
 *
 *   File itself must already be uploaded to the `uploads` storage bucket
 *   (that part still happens client-side using anon + storage policy, which
 *   is fine even after RLS DB lockdown).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { filename, path, size, mime_type } = body
  if (!filename || !path) {
    return NextResponse.json({ error: "Missing filename or path" }, { status: 400 })
  }
  const { data, error } = await supabase
    .from("george_uploads")
    .insert({
      filename,
      path,
      size: size || 0,
      mime_type: mime_type || "application/octet-stream",
    })
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
