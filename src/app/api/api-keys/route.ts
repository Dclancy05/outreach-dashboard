/**
 * /api/api-keys — CRUD for the central api_keys store.
 *
 * Auth: middleware (src/middleware.ts) gates all /api/* with the admin_session
 * cookie, so no extra check needed here.
 *
 * `value` is NEVER returned to the client — only `masked`. To change a value
 * the user must paste a new one. Same convention as the legacy
 * /api/system-settings/keys route.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { invalidateSecret } from "@/lib/secrets"
import { maskSecret, BOOTSTRAP_ENV_VARS } from "@/lib/secrets-catalog"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ApiKeyRow = {
  id: string
  name: string
  provider: string
  env_var: string
  value: string
  expires_at: string | null
  last_used_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function shape(row: ApiKeyRow) {
  const now = Date.now()
  const expMs = row.expires_at ? new Date(row.expires_at).getTime() : null
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    env_var: row.env_var,
    masked: maskSecret(row.value),
    expires_at: row.expires_at,
    last_used_at: row.last_used_at,
    notes: row.notes,
    is_expired: expMs !== null && expMs < now,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

// GET /api/api-keys?include_expired=false
export async function GET(req: NextRequest) {
  const includeExpired =
    new URL(req.url).searchParams.get("include_expired") === "true"

  let query = supabase
    .from("api_keys")
    .select("*")
    .order("updated_at", { ascending: false })

  if (!includeExpired) {
    const nowIso = new Date().toISOString()
    query = query.or(`expires_at.is.null,expires_at.gt.${nowIso}`)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: (data as ApiKeyRow[]).map(shape) })
}

// POST /api/api-keys
// Body: { action: "create" | "update" | "delete", ... }
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const action = String(body.action || "")

  if (action === "create") return create(body)
  if (action === "update") return update(body)
  if (action === "delete") return remove(body)

  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}

function validateEnvVar(envVar: unknown): string | null {
  if (typeof envVar !== "string") return null
  const trimmed = envVar.trim()
  if (!trimmed) return null
  if (!/^[A-Z][A-Z0-9_]*$/.test(trimmed)) return null
  if (BOOTSTRAP_ENV_VARS.has(trimmed)) return null // bootstrap secrets stay in env
  return trimmed
}

function validateExpiresAt(raw: unknown): string | null | undefined {
  if (raw === null || raw === undefined || raw === "") return null
  if (typeof raw !== "string") return undefined // invalid
  const t = Date.parse(raw)
  if (Number.isNaN(t)) return undefined
  return new Date(t).toISOString()
}

async function create(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const provider = typeof body.provider === "string" ? body.provider.trim() : ""
  const envVar = validateEnvVar(body.env_var)
  const value = typeof body.value === "string" ? body.value.trim() : ""
  const notes = typeof body.notes === "string" ? body.notes : null
  const expiresAt = validateExpiresAt(body.expires_at)

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })
  if (!provider) return NextResponse.json({ error: "provider required" }, { status: 400 })
  if (!envVar)
    return NextResponse.json(
      { error: "env_var required (must be UPPER_SNAKE_CASE; bootstrap secrets are not allowed)" },
      { status: 400 }
    )
  if (!value) return NextResponse.json({ error: "value required" }, { status: 400 })
  if (expiresAt === undefined)
    return NextResponse.json({ error: "expires_at must be ISO date or null" }, { status: 400 })

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      name,
      provider,
      env_var: envVar,
      value,
      notes,
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  invalidateSecret(envVar)
  return NextResponse.json({ data: shape(data as ApiKeyRow) })
}

async function update(body: Record<string, unknown>) {
  const id = typeof body.id === "string" ? body.id : ""
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof body.name === "string") patch.name = body.name.trim()
  if (typeof body.provider === "string") patch.provider = body.provider.trim()
  if (body.env_var !== undefined) {
    const envVar = validateEnvVar(body.env_var)
    if (!envVar)
      return NextResponse.json(
        { error: "env_var must be UPPER_SNAKE_CASE; bootstrap secrets are not allowed" },
        { status: 400 }
      )
    patch.env_var = envVar
  }
  if (typeof body.value === "string" && body.value.trim()) {
    patch.value = body.value.trim()
  }
  if (body.notes !== undefined) patch.notes = body.notes ?? null
  if (body.expires_at !== undefined) {
    const exp = validateExpiresAt(body.expires_at)
    if (exp === undefined)
      return NextResponse.json({ error: "expires_at must be ISO date or null" }, { status: 400 })
    patch.expires_at = exp
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("api_keys")
    .update(patch)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (data) invalidateSecret((data as ApiKeyRow).env_var)
  return NextResponse.json({ data: shape(data as ApiKeyRow) })
}

async function remove(body: Record<string, unknown>) {
  const id = typeof body.id === "string" ? body.id : ""
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Read env_var first so we can invalidate the cache after deletion.
  const { data: existing } = await supabase
    .from("api_keys")
    .select("env_var")
    .eq("id", id)
    .maybeSingle()

  const { error } = await supabase.from("api_keys").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (existing?.env_var) invalidateSecret(existing.env_var)
  return NextResponse.json({ success: true })
}
