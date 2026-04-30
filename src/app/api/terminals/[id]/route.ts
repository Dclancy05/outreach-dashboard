/**
 * Per-session ops:
 *   DELETE /api/terminals/:id          → kill tmux + remove worktree
 *   PATCH  /api/terminals/:id          → rename
 *   POST   /api/terminals/:id/resize   → tell VPS the new viewport size (handled in [id]/resize)
 */
import { NextRequest, NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function proxy(
  method: string,
  pathSuffix: string,
  bodyText: string | null,
): Promise<NextResponse> {
  const url = ((await getSecret("TERMINAL_RUNNER_URL")) || "").replace(/\/+$/, "")
  const token = (await getSecret("TERMINAL_RUNNER_TOKEN")) || ""
  if (!url || !token) {
    return NextResponse.json({ error: "TERMINAL_RUNNER_URL / TOKEN not configured" }, { status: 503 })
  }
  try {
    const res = await fetch(`${url}${pathSuffix}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: bodyText,
      signal: AbortSignal.timeout(10_000),
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return proxy("DELETE", `/sessions/${params.id}`, null)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const body = await req.text()
  return proxy("PATCH", `/sessions/${params.id}`, body || "{}")
}
