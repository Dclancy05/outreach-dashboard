/**
 * /api/api-keys/test-all — POST → run probes against every key in parallel.
 *
 * Returns `{ results: { [id]: { ok, detail?, error? } } }`. Keys are tested
 * concurrently so the whole sweep takes about as long as the slowest probe
 * (capped at 7 s per probe).
 *
 * Auth: middleware enforces admin_session.
 */
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { runKeyProbe } from "@/lib/key-probes"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

interface ProbeResult {
  ok: boolean
  detail?: string
  error?: string
}

export async function POST() {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, env_var, value")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data as Array<{ id: string; env_var: string; value: string }>) || []
  const entries = await Promise.all(
    rows.map(async (r) => {
      if (!r.value) {
        return [r.id, { ok: false, error: "value is empty" } as ProbeResult] as const
      }
      try {
        const result = await runKeyProbe(r.env_var, r.value)
        return [r.id, result as ProbeResult] as const
      } catch (e) {
        return [r.id, { ok: false, error: e instanceof Error ? e.message : "probe failed" } as ProbeResult] as const
      }
    }),
  )

  const results: Record<string, ProbeResult> = {}
  for (const [id, res] of entries) results[id] = res
  return NextResponse.json({ results, tested_at: new Date().toISOString() })
}
