import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const VNC_MANAGER_URL = process.env.VNC_MANAGER_URL || "http://127.0.0.1:18790"
const VNC_API_KEY = process.env.VNC_API_KEY || "vnc-mgr-2026-dylan"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, proxy_config: rawProxy } = body
    let proxy_config = rawProxy

    if (!proxy_config && id) {
      const { data, error } = await supabase
        .from("proxy_groups")
        .select("ip, port, username, password, location_city, location_country")
        .eq("id", id)
        .maybeSingle()
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      if (!data) return NextResponse.json({ ok: false, error: "proxy group not found" }, { status: 404 })
      proxy_config = `${data.ip}:${data.port}:${data.username || ""}:${data.password || ""}`
    }

    if (!proxy_config) {
      return NextResponse.json({ ok: false, error: "proxy_config or id required" }, { status: 400 })
    }

    const started = Date.now()
    const res = await fetch(`${VNC_MANAGER_URL}/api/proxy/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": VNC_API_KEY },
      body: JSON.stringify({ proxy_config }),
    })
    const data = await res.json()
    const latency_ms = Date.now() - started

    if (id) {
      try {
        await supabase
          .from("proxy_groups")
          .update({
            health_check_at: new Date().toISOString(),
            status: data.ok ? "active" : "error",
          })
          .eq("id", id)
      } catch {}
    }

    return NextResponse.json({ ...data, latency_ms }, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "failed" }, { status: 500 })
  }
}
