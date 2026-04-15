import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  try {
    switch (action) {
      case "get_streams": {
        const { data, error } = await supabase
          .from("revenue_streams")
          .select("*")
          .order("created_at", { ascending: false })
        if (error) throw new Error(error.message)
        return NextResponse.json({ success: true, data })
      }

      case "get_stream": {
        const { data, error } = await supabase
          .from("revenue_streams")
          .select("*")
          .eq("id", body.id)
          .single()
        if (error) throw new Error(error.message)
        return NextResponse.json({ success: true, data })
      }

      case "create_stream": {
        const { data, error } = await supabase
          .from("revenue_streams")
          .insert({
            name: body.name,
            category: body.category,
            platform: body.platform || null,
            description: body.description || "",
            status: body.status || "idea",
            listing_url: body.listing_url || null,
            notes: body.notes || null,
          })
          .select()
          .single()
        if (error) throw new Error(error.message)
        return NextResponse.json({ success: true, data })
      }

      case "update_stream": {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
        for (const k of ["name", "category", "platform", "description", "status", "listing_url", "notes"]) {
          if (body[k] !== undefined) updates[k] = body[k]
        }
        const { data, error } = await supabase
          .from("revenue_streams")
          .update(updates)
          .eq("id", body.id)
          .select()
          .single()
        if (error) throw new Error(error.message)
        return NextResponse.json({ success: true, data })
      }

      case "delete_stream": {
        const { error } = await supabase.from("revenue_streams").delete().eq("id", body.id)
        if (error) throw new Error(error.message)
        return NextResponse.json({ success: true })
      }

      case "get_transactions": {
        let query = supabase
          .from("revenue_transactions")
          .select("*")
          .order("transaction_date", { ascending: false })
        if (body.stream_id) query = query.eq("stream_id", body.stream_id)
        const { data, error } = await query
        if (error) throw new Error(error.message)
        return NextResponse.json({ success: true, data })
      }

      case "add_transaction": {
        const net = (body.amount || 0) - (body.platform_fee || 0)
        const { data: tx, error: txErr } = await supabase
          .from("revenue_transactions")
          .insert({
            stream_id: body.stream_id,
            amount: body.amount,
            description: body.description || null,
            platform_fee: body.platform_fee || 0,
            net_amount: net,
            transaction_date: body.transaction_date || new Date().toISOString(),
          })
          .select()
          .single()
        if (txErr) throw new Error(txErr.message)

        // Update stream totals
        const { data: allTx } = await supabase
          .from("revenue_transactions")
          .select("net_amount")
          .eq("stream_id", body.stream_id)
        const totalRev = (allTx || []).reduce((s: number, t: { net_amount: number }) => s + Number(t.net_amount), 0)
        const totalSales = (allTx || []).length
        const avg = totalSales > 0 ? totalRev / totalSales : 0

        await supabase
          .from("revenue_streams")
          .update({
            total_revenue: totalRev,
            total_sales: totalSales,
            avg_sale_price: Math.round(avg * 100) / 100,
            status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.stream_id)

        return NextResponse.json({ success: true, data: tx })
      }

      case "get_stats": {
        const { data: streams } = await supabase.from("revenue_streams").select("*")
        const allStreams = streams || []
        const totalRevenue = allStreams.reduce((s, st) => s + Number(st.total_revenue || 0), 0)
        const activeStreams = allStreams.filter(s => s.status === "active").length
        const ideas = allStreams.filter(s => s.status === "idea").length

        // This month
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const { data: monthTx } = await supabase
          .from("revenue_transactions")
          .select("net_amount")
          .gte("transaction_date", monthStart)
        const thisMonth = (monthTx || []).reduce((s, t) => s + Number(t.net_amount), 0)

        return NextResponse.json({
          success: true,
          data: { totalRevenue, thisMonth, activeStreams, ideas },
        })
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 })
  }
}
