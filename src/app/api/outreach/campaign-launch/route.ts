import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

interface SequenceStep {
  id?: string
  day: number
  platform: string
  action: string
  message_template?: string
  delay_hours?: number
}

export async function POST(req: NextRequest) {
  try {
    const {
      name,
      accounts,
      lead_ids,
      sequence_id,
      safety_settings,
      business_id,
    } = await req.json()

    if (!name || !accounts?.length || !lead_ids?.length || !sequence_id) {
      return NextResponse.json({
        error: "name, accounts, lead_ids, and sequence_id required",
      }, { status: 400 })
    }

    const { data: sequence } = await supabase
      .from("sequences")
      .select("*")
      .eq("id", sequence_id)
      .single()

    if (!sequence) {
      return NextResponse.json({ error: "Sequence not found" }, { status: 404 })
    }

    const steps: SequenceStep[] = sequence.steps || []

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        name,
        business_id: business_id || "default",
        status: "active",
        accounts: accounts,
        lead_ids: lead_ids,
        lead_count: lead_ids.length,
        sequence_id,
        total_scheduled: lead_ids.length * steps.length,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (campaignError) {
      return NextResponse.json({ error: campaignError.message }, { status: 500 })
    }

    if (safety_settings) {
      const platforms = [...new Set(steps.map((s) => s.platform))]

      for (const platform of platforms) {
        const platformSettings = safety_settings[platform] || safety_settings.all || safety_settings
        await supabase.from("campaign_safety_settings").insert({
          campaign_id: campaign.id,
          platform,
          ...platformSettings,
        })
      }
    }

    const scheduleEntries: any[] = []
    const today = new Date()

    const { data: existingAffinity } = await supabase
      .from("account_lead_affinity")
      .select("*")
      .in("lead_id", lead_ids)

    const affinityMap = new Map<string, string>()
    if (existingAffinity) {
      for (const a of existingAffinity) {
        affinityMap.set(`${a.lead_id}:${a.platform}`, a.account_id)
      }
    }

    const newAffinities: any[] = []

    for (let li = 0; li < lead_ids.length; li++) {
      const leadId = lead_ids[li]

      for (const step of steps) {
        const schedDate = new Date(today)
        schedDate.setDate(schedDate.getDate() + (step.day - 1))

        const affinityKey = `${leadId}:${step.platform}`
        let assignedAccount: string | undefined = affinityMap.get(affinityKey)

        if (!assignedAccount) {
          const platformAccounts = accounts.filter(
            (a: any) => a.platform === step.platform
          )
          if (platformAccounts.length > 0) {
            assignedAccount = platformAccounts[li % platformAccounts.length].account_id as string
            affinityMap.set(affinityKey, assignedAccount)
            newAffinities.push({
              account_id: assignedAccount,
              lead_id: leadId,
              platform: step.platform,
            })
          }
        }

        if (!assignedAccount) continue

        scheduleEntries.push({
          campaign_id: campaign.id,
          account_id: assignedAccount,
          lead_id: leadId,
          sequence_step_id: step.id || null,
          platform: step.platform,
          scheduled_date: schedDate.toISOString().split("T")[0],
          status: "pending",
        })
      }
    }

    if (newAffinities.length > 0) {
      await supabase
        .from("account_lead_affinity")
        .upsert(newAffinities, { onConflict: "account_id,lead_id,platform" })
    }

    const batchSize = 500
    for (let i = 0; i < scheduleEntries.length; i += batchSize) {
      const batch = scheduleEntries.slice(i, i + batchSize)
      await supabase.from("campaign_schedule").insert(batch)
    }

    const queueEntries = scheduleEntries
      .filter((e) => e.scheduled_date === today.toISOString().split("T")[0])
      .map((e) => ({
        lead_id: e.lead_id,
        account_id: e.account_id,
        platform: e.platform,
        campaign_id: campaign.id,
        message_text: "",
        status: "queued",
      }))

    if (queueEntries.length > 0) {
      await supabase.from("send_queue").insert(queueEntries)
    }

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
      },
      stats: {
        total_leads: lead_ids.length,
        total_scheduled: scheduleEntries.length,
        today_queued: queueEntries.length,
        days_span: steps.length > 0 ? Math.max(...steps.map((s) => s.day)) : 0,
        accounts_used: accounts.length,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
