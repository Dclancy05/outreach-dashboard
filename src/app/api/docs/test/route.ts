import { NextRequest, NextResponse } from "next/server"
import { appendNote } from "@/lib/google-docs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET || ""
  if (!expected) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 500 })
  }
  const auth = req.headers.get("authorization") || ""
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const docId = process.env.PROJECT_DOC_ID || ""
  if (!docId) {
    return NextResponse.json(
      { ok: false, error: "PROJECT_DOC_ID not configured" },
      { status: 400 },
    )
  }

  try {
    await appendNote(docId, "Test ping from /api/docs/test")
    return NextResponse.json({ ok: true, message: "Test note appended", docId })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
