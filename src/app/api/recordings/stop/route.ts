import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const VPS_URL = process.env.VPS_URL || process.env.RECORDING_SERVER_URL || "http://srv1197943.hstgr.cloud:3848"

// Get the base URL for internal API calls
function getBaseUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https"
  const host = req.headers.get("host") || "localhost:3000"
  return `${proto}://${host}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionId, name, platform, action_type, tags } = body

    // Stop recording on VPS
    const res = await fetch(`${VPS_URL}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
    const vpsData = await res.json()

    if (!res.ok) return NextResponse.json(vpsData, { status: res.status })

    // Insert into Supabase
    const { data, error } = await supabase.from("recordings").insert({
      name: name || "Untitled Recording",
      platform: platform || "ig",
      action_type: action_type || "custom",
      duration_seconds: vpsData.durationSeconds || null,
      video_path: vpsData.videoPath || null,
      status: "new",
      tags: tags || [],
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const recordingId = data.id
    const baseUrl = getBaseUrl(req)

    // Kick off the async pipeline (don't await — let it run in background)
    // We fire-and-forget so the user gets immediate feedback
    runPipelineAsync(baseUrl, recordingId, platform, action_type).catch(e =>
      console.error("Pipeline error for recording", recordingId, e)
    )

    return NextResponse.json({
      success: true,
      recording: data,
      pipeline_status: "started",
    })
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to stop recording", details: e.message }, { status: 502 })
  }
}

async function runPipelineAsync(baseUrl: string, recordingId: string, platform: string, actionType: string) {
  try {
    // Step 1: Analyze the recording
    console.log(`[Pipeline] Analyzing recording ${recordingId}...`)
    const analyzeRes = await fetch(`${baseUrl}/api/recordings/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recording_id: recordingId }),
    })
    const analyzeData = await analyzeRes.json()

    if (!analyzeData.success || !analyzeData.steps?.length) {
      console.log(`[Pipeline] No steps found for ${recordingId}, skipping automation build`)
      await supabase.from("automation_scripts").insert({
        recording_id: recordingId,
        platform: platform || "ig",
        action_type: actionType || "custom",
        script_json: [],
        selectors: {},
        status: "failed",
        last_error: "No actionable steps detected in recording",
      })
      return
    }

    // Step 2: Build automation script
    console.log(`[Pipeline] Building automation for ${recordingId} (${analyzeData.step_count} steps)...`)
    const buildRes = await fetch(`${baseUrl}/api/recordings/build-automation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recording_id: recordingId,
        steps: analyzeData.steps,
        platform,
        action_type: actionType,
      }),
    })
    const buildData = await buildRes.json()

    if (!buildData.success || !buildData.script_id) {
      console.log(`[Pipeline] Failed to build automation for ${recordingId}`)
      return
    }

    // Step 3: Run self-test (this is the slow part — tries up to 5 strategies)
    console.log(`[Pipeline] Self-testing script ${buildData.script_id}...`)
    const testRes = await fetch(`${baseUrl}/api/recordings/self-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script_id: buildData.script_id }),
    })
    const testData = await testRes.json()

    console.log(`[Pipeline] Self-test result for ${recordingId}:`, testData.success ? "SUCCESS" : "FAILED", testData.winning_strategy || testData.last_error)
  } catch (e) {
    console.error(`[Pipeline] Error for recording ${recordingId}:`, e)
    // Insert a failure notification
    try {
      await supabase.from("notifications").insert({
        type: "automation_error",
        message: `Something went wrong setting up the automation. Please try recording again.`,
        metadata: { recording_id: recordingId, error: String(e) },
        read: false,
      })
    } catch {}
  }
}
