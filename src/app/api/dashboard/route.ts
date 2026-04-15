import { NextResponse } from "next/server"
import { handleAction } from "@/lib/api/index"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const action = body.action as string

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 })
    }

    const result = await handleAction(action, body)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Dashboard API error:", error)
    return NextResponse.json(
      { error: `API error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
