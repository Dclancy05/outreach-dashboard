/**
 * Tell the VPS terminal-server the new viewport size after the user resizes
 * the terminal pane. tmux needs the dimensions to redraw correctly; xterm.js
 * gives us cols/rows from FitAddon.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const url = ((await getSecret("TERMINAL_RUNNER_URL")) || "").replace(/\/+$/, "")
  const token = (await getSecret("TERMINAL_RUNNER_TOKEN")) || ""
  if (!url || !token) {
    return NextResponse.json({ error: "TERMINAL_RUNNER_URL / TOKEN not configured" }, { status: 503 })
  }
  const body = await req.text()
  try {
    const res = await fetch(`${url}/sessions/${params.id}/resize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body || "{}",
      signal: AbortSignal.timeout(5_000),
    })
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json" },
    })
  } catch (e) {
    return NextResponse.json(
      { error: `terminal-server unreachable: ${(e as Error).message}` },
      { status: 502 },
    )
  }
}
