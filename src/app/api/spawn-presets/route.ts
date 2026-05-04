/**
 * /api/spawn-presets — list (GET) + create (POST).
 *
 * Backs Phase 4 #13 of the terminals overhaul: the New-terminal dialog reads
 * this list to render "Bug fix / Build feature / Investigate" quick-spawn
 * buttons. Each preset bundles a label, an icon name (lucide-react), a default
 * first prompt, and a suggested cost cap.
 *
 * The default 3 rows are seeded by the migration; users can add more later
 * (POST writes a fresh row). RLS is off on the table — single-tenant for now.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export interface SpawnPreset {
  id: string
  label: string
  icon: string
  prompt: string
  cost_cap_usd: number
  is_default: boolean
  sort_order: number
  created_at: string
}

export async function GET(): Promise<NextResponse> {
  try {
    const { data, error } = await db()
      .from("spawn_presets")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
    if (error) {
      // Table missing? Return empty list rather than 500 — the UI degrades to
      // "no presets yet" and the user can still spawn the legacy way.
      return NextResponse.json({ presets: [] })
    }
    return NextResponse.json({ presets: (data as SpawnPreset[]) || [] })
  } catch (e) {
    return NextResponse.json({ presets: [], error: (e as Error).message })
  }
}

interface CreateBody {
  label?: string
  icon?: string
  prompt?: string
  cost_cap_usd?: number
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: CreateBody = {}
  try { body = await req.json() } catch { /* */ }
  const label = (body.label || "").trim()
  const prompt = (body.prompt || "").trim()
  if (!label || !prompt) {
    return NextResponse.json({ error: "label and prompt are required" }, { status: 400 })
  }
  const { data, error } = await db()
    .from("spawn_presets")
    .insert({
      label,
      icon: body.icon || "terminal",
      prompt,
      cost_cap_usd: body.cost_cap_usd ?? 5.00,
      is_default: false,
      sort_order: 100,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ preset: data })
}
