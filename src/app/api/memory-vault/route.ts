/**
 * Server-side proxy from the dashboard to the AI VPS memory-vault file-server.
 *
 * The vault token never leaves the server — Dylan's browser hits THIS route,
 * which forwards to the vault API with Bearer auth.
 *
 * Auth: relies on the existing admin_session middleware (only PIN-authed
 * dashboard users can call /api/memory-vault/*).
 *
 * Endpoints:
 *   GET    /api/memory-vault/tree                → vault API GET /tree
 *   GET    /api/memory-vault/file?path=X         → vault API GET /file?path=X
 *   PUT    /api/memory-vault/file                → vault API PUT /file
 *   DELETE /api/memory-vault/file?path=X         → vault API DELETE /file?path=X
 *   POST   /api/memory-vault/folder              → vault API POST /folder
 *   POST   /api/memory-vault/move                → vault API POST /move
 *
 * Env:
 *   MEMORY_VAULT_API_URL   e.g. https://memory-vault.<tailnet>.ts.net  (public via Funnel)
 *                          or   http://outreach-vps-2.taild42583.ts.net:8788 (Tailscale-only)
 *   MEMORY_VAULT_TOKEN     Bearer token (matches the AI VPS env)
 */
import { NextRequest, NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

function noConfig(): NextResponse {
  return NextResponse.json(
    {
      error: "memory-vault not configured",
      hint:
        "Set MEMORY_VAULT_API_URL and MEMORY_VAULT_TOKEN in the API Keys tab " +
        "(or as Vercel env vars). MEMORY_VAULT_API_URL must be a publicly " +
        "reachable HTTPS URL (Tailscale Funnel recommended).",
    },
    { status: 503 }
  )
}

async function proxy(req: NextRequest, vaultPath: string): Promise<Response> {
  const API_URL = ((await getSecret("MEMORY_VAULT_API_URL")) || "").replace(/\/+$/, "")
  const TOKEN = (await getSecret("MEMORY_VAULT_TOKEN")) || ""
  if (!API_URL || !TOKEN) return noConfig()
  const url = new URL(req.url)
  const search = url.search // includes leading '?'
  const target = `${API_URL}${vaultPath}${search}`
  try {
    const init: RequestInit = {
      method: req.method,
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": req.headers.get("content-type") || "application/json",
      },
    }
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "DELETE") {
      const body = await req.text()
      if (body) init.body = body
    }
    const res = await fetch(target, init)
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: "vault upstream unreachable", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}

// Catch-all: route incoming methods to the matching vault endpoint based on the URL path tail.
// Path layout: /api/memory-vault/<vaultEndpoint> where vaultEndpoint ∈ {tree, file, folder, move}
function vaultEndpoint(url: URL): string {
  // /api/memory-vault/<rest>
  const m = url.pathname.match(/^\/api\/memory-vault(\/.+)?$/)
  const rest = m?.[1] || "/"
  return rest // e.g. "/tree" or "/file" or "/folder" or "/move"
}

export async function GET(req: NextRequest)    { return proxy(req, vaultEndpoint(new URL(req.url))) }
export async function PUT(req: NextRequest)    { return proxy(req, vaultEndpoint(new URL(req.url))) }
export async function POST(req: NextRequest)   { return proxy(req, vaultEndpoint(new URL(req.url))) }
export async function DELETE(req: NextRequest) { return proxy(req, vaultEndpoint(new URL(req.url))) }
