import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  ALLOWED_KEYS,
  KEY_PREFIX,
  READ_ONLY_KEYS,
  isAllowedKey,
  maskValue,
} from "@/lib/integration-keys"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/system-settings/keys
// Returns one masked entry per allowed key, plus metadata (set / read_only).
// Falls back to process.env when nothing's been saved yet so a freshly
// deployed instance doesn't lie about which keys are configured.
export async function GET(_req: NextRequest) {
  const result: Record<
    string,
    {
      masked: string
      is_set: boolean
      read_only: boolean
      updated_at: string | null
    }
  > = {}

  const { data: rows, error } = await supabase
    .from("system_settings")
    .select("key, value, updated_at")
    .like("key", `${KEY_PREFIX}%`)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const byKey = new Map<string, { value: any; updated_at: string | null }>()
  for (const row of rows || []) {
    byKey.set(row.key, { value: row.value, updated_at: row.updated_at || null })
  }

  for (const key of ALLOWED_KEYS) {
    const stored = byKey.get(`${KEY_PREFIX}${key}`)
    const storedVal =
      stored?.value && typeof stored.value === "object" && "value" in stored.value
        ? stored.value.value
        : stored?.value
    const envVal = process.env[key]
    const raw =
      typeof storedVal === "string" && storedVal
        ? storedVal
        : typeof envVal === "string" && envVal
        ? envVal
        : null
    result[key] = {
      masked: maskValue(raw),
      is_set: Boolean(raw),
      read_only: READ_ONLY_KEYS.has(key),
      updated_at: stored?.updated_at || null,
    }
  }

  return NextResponse.json({ keys: result })
}

// POST /api/system-settings/keys
// Body: { key, value }
// Saves a single key. Read-only keys are rejected. Empty value clears the row.
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { key, value } = body || {}
  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "key required" }, { status: 400 })
  }
  if (!isAllowedKey(key)) {
    return NextResponse.json({ error: "key not allowed" }, { status: 400 })
  }
  if (READ_ONLY_KEYS.has(key)) {
    return NextResponse.json(
      { error: "this key is read-only — rotate via Vercel env vars" },
      { status: 400 }
    )
  }
  if (typeof value !== "string") {
    return NextResponse.json({ error: "value must be a string" }, { status: 400 })
  }

  const trimmed = value.trim()
  if (!trimmed) {
    const { error } = await supabase
      .from("system_settings")
      .delete()
      .eq("key", `${KEY_PREFIX}${key}`)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, masked: "", is_set: false })
  }

  const { error } = await supabase.from("system_settings").upsert({
    key: `${KEY_PREFIX}${key}`,
    value: { value: trimmed },
    updated_at: new Date().toISOString(),
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    masked: maskValue(trimmed),
    is_set: true,
  })
}
