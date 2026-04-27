import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const VPS_URL =
    (await getSecret("VPS_URL")) ||
    (await getSecret("RECORDING_SERVER_URL")) ||
    "http://srv1197943.hstgr.cloud:3848"

  const { data: recording } = await supabase
    .from("recordings")
    .select("video_path")
    .eq("id", id)
    .single()

  if (!recording?.video_path) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const filename = recording.video_path.split("/").pop()
  try {
    const res = await fetch(`${VPS_URL}/video/${filename}`)
    if (!res.ok) return NextResponse.json({ error: "Video not found" }, { status: 404 })

    return new NextResponse(res.body, {
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch video" }, { status: 502 })
  }
}
