import { NextRequest, NextResponse } from "next/server"
import { appendNote, markDone, addSection } from "@/lib/google-docs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Action = "appendNote" | "markDone" | "addSection"

interface DocsRequestBody {
  action?: Action
  docId?: string
  text?: string
  taskText?: string
  heading?: string
  body?: string
}

function isAction(value: unknown): value is Action {
  return value === "appendNote" || value === "markDone" || value === "addSection"
}

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET || ""
  if (!expected) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 500 })
  }
  const auth = req.headers.get("authorization") || ""
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  let body: DocsRequestBody
  try {
    body = (await req.json()) as DocsRequestBody
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 })
  }

  if (!isAction(body.action)) {
    return NextResponse.json(
      { ok: false, error: "action must be appendNote, markDone, or addSection" },
      { status: 400 },
    )
  }

  const docId = body.docId || process.env.PROJECT_DOC_ID || ""
  if (!docId) {
    return NextResponse.json(
      { ok: false, error: "docId not provided and PROJECT_DOC_ID not configured" },
      { status: 400 },
    )
  }

  try {
    if (body.action === "appendNote") {
      if (typeof body.text !== "string" || body.text.length === 0) {
        return NextResponse.json({ ok: false, error: "text is required for appendNote" }, { status: 400 })
      }
      await appendNote(docId, body.text)
    } else if (body.action === "markDone") {
      if (typeof body.taskText !== "string" || body.taskText.length === 0) {
        return NextResponse.json({ ok: false, error: "taskText is required for markDone" }, { status: 400 })
      }
      await markDone(docId, body.taskText)
    } else {
      if (typeof body.heading !== "string" || body.heading.length === 0) {
        return NextResponse.json({ ok: false, error: "heading is required for addSection" }, { status: 400 })
      }
      if (typeof body.body !== "string") {
        return NextResponse.json({ ok: false, error: "body is required for addSection" }, { status: 400 })
      }
      await addSection(docId, body.heading, body.body)
    }

    return NextResponse.json({ ok: true, action: body.action, docId })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
