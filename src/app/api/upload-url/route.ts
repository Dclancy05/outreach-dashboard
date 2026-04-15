import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType } = await req.json()
    if (!filename) {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 })
    }

    // Generate unique path
    const timestamp = Date.now()
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_")
    const path = `${timestamp}_${safeName}`

    // Create signed upload URL (valid for 10 minutes)
    const { data, error } = await supabase.storage
      .from("uploads")
      .createSignedUploadUrl(path)

    if (error) {
      // If bucket doesn't exist, try to create it
      if (error.message?.includes("not found") || error.message?.includes("Bucket")) {
        await supabase.storage.createBucket("uploads", {
          public: false,
          fileSizeLimit: 52428800, // 50MB
        })
        const retry = await supabase.storage.from("uploads").createSignedUploadUrl(path)
        if (retry.error) {
          return NextResponse.json({ error: retry.error.message }, { status: 500 })
        }
        return NextResponse.json({ signedUrl: retry.data.signedUrl, token: retry.data.token, path })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate upload URL"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
