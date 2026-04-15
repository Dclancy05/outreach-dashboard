import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface CDPEvent {
  method?: string
  params?: Record<string, unknown>
  timestamp?: number
  type?: string
  x?: number
  y?: number
  text?: string
  selector?: string
  url?: string
  value?: string
  key?: string
  targetText?: string
}

interface RecordingAction {
  recording_id: string
  step_number: number
  action_type: string
  target_selector: string | null
  target_text: string | null
  typed_text: string | null
  url: string | null
  coordinates: { x: number; y: number } | null
  timestamp_ms: number | null
}

export async function POST(req: Request) {
  try {
    const { recording_id } = await req.json()
    if (!recording_id) {
      return NextResponse.json({ error: "recording_id required" }, { status: 400 })
    }

    // Fetch recording
    const { data: recording, error: fetchErr } = await supabase
      .from("recordings")
      .select("*")
      .eq("id", recording_id)
      .single()

    if (fetchErr || !recording) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 })
    }

    const events: CDPEvent[] = Array.isArray(recording.cdp_events)
      ? recording.cdp_events
      : typeof recording.cdp_events === "string"
      ? JSON.parse(recording.cdp_events)
      : []

    // Parse events into structured steps
    const actions: RecordingAction[] = []
    let stepNumber = 0
    let currentUrl = ""
    let typingBuffer = ""
    let typingSelector = ""
    let typingStartTs = 0

    const flushTyping = () => {
      if (typingBuffer) {
        stepNumber++
        actions.push({
          recording_id,
          step_number: stepNumber,
          action_type: "type",
          target_selector: typingSelector || null,
          target_text: null,
          typed_text: typingBuffer,
          url: currentUrl || null,
          coordinates: null,
          timestamp_ms: typingStartTs || null,
        })
        typingBuffer = ""
        typingSelector = ""
        typingStartTs = 0
      }
    }

    for (const evt of events) {
      const method = evt.method || evt.type || ""
      const ts = evt.timestamp ? Math.round(evt.timestamp * 1000) : null

      // Navigation events
      if (
        method === "Page.navigatedWithinDocument" ||
        method === "Page.frameNavigated" ||
        method === "navigate"
      ) {
        flushTyping()
        const url = evt.params?.url as string || evt.url || ""
        if (url && url !== currentUrl) {
          currentUrl = url
          stepNumber++
          actions.push({
            recording_id,
            step_number: stepNumber,
            action_type: "navigate",
            target_selector: null,
            target_text: null,
            typed_text: null,
            url,
            coordinates: null,
            timestamp_ms: ts,
          })
        }
        continue
      }

      // Click events
      if (
        method === "Input.dispatchMouseEvent" ||
        method === "click"
      ) {
        const mtype = evt.params?.type as string || ""
        if (mtype === "mousePressed" || method === "click") {
          flushTyping()
          const x = (evt.params?.x as number) || evt.x || 0
          const y = (evt.params?.y as number) || evt.y || 0
          stepNumber++
          actions.push({
            recording_id,
            step_number: stepNumber,
            action_type: "click",
            target_selector: evt.selector || (evt.params?.selector as string) || null,
            target_text: evt.targetText || (evt.params?.targetText as string) || null,
            typed_text: null,
            url: currentUrl || null,
            coordinates: { x, y },
            timestamp_ms: ts,
          })
        }
        continue
      }

      // Keyboard / typing events
      if (
        method === "Input.dispatchKeyEvent" ||
        method === "keypress" ||
        method === "type"
      ) {
        const keyType = evt.params?.type as string || ""
        if (keyType === "keyDown" || method === "keypress" || method === "type") {
          const text = (evt.params?.text as string) || evt.text || evt.key || ""
          const key = (evt.params?.key as string) || evt.key || ""

          // Enter key = flush + separate action
          if (key === "Enter" || key === "Return") {
            flushTyping()
            stepNumber++
            actions.push({
              recording_id,
              step_number: stepNumber,
              action_type: "press_enter",
              target_selector: evt.selector || null,
              target_text: null,
              typed_text: null,
              url: currentUrl || null,
              coordinates: null,
              timestamp_ms: ts,
            })
            continue
          }

          // Tab key
          if (key === "Tab") {
            flushTyping()
            stepNumber++
            actions.push({
              recording_id,
              step_number: stepNumber,
              action_type: "press_tab",
              target_selector: null,
              target_text: null,
              typed_text: null,
              url: currentUrl || null,
              coordinates: null,
              timestamp_ms: ts,
            })
            continue
          }

          // Backspace
          if (key === "Backspace") {
            if (typingBuffer.length > 0) {
              typingBuffer = typingBuffer.slice(0, -1)
            }
            continue
          }

          // Regular character
          if (text && text.length === 1) {
            if (!typingStartTs) typingStartTs = ts || 0
            if (evt.selector) typingSelector = evt.selector
            typingBuffer += text
          }
        }
        continue
      }

      // Wait events (explicit)
      if (method === "wait") {
        flushTyping()
        stepNumber++
        actions.push({
          recording_id,
          step_number: stepNumber,
          action_type: "wait",
          target_selector: null,
          target_text: null,
          typed_text: null,
          url: currentUrl || null,
          coordinates: null,
          timestamp_ms: evt.params?.duration as number || 1000,
        })
        continue
      }
    }

    // Flush remaining typing
    flushTyping()

    // Add inter-step waits for large time gaps (>2s)
    const withWaits: RecordingAction[] = []
    for (let i = 0; i < actions.length; i++) {
      if (i > 0 && actions[i].timestamp_ms && actions[i - 1].timestamp_ms) {
        const gap = (actions[i].timestamp_ms! - actions[i - 1].timestamp_ms!)
        if (gap > 2000 && gap < 30000) {
          withWaits.push({
            recording_id,
            step_number: 0, // will renumber
            action_type: "wait",
            target_selector: null,
            target_text: null,
            typed_text: null,
            url: null,
            coordinates: null,
            timestamp_ms: Math.min(gap, 5000),
          })
        }
      }
      withWaits.push(actions[i])
    }

    // Renumber steps
    withWaits.forEach((a, i) => { a.step_number = i + 1 })

    // Save to recording_actions table
    if (withWaits.length > 0) {
      const { error: insertErr } = await supabase
        .from("recording_actions")
        .upsert(withWaits.map(a => ({
          id: `ra_${recording_id.slice(0, 6)}_${a.step_number}`,
          ...a,
        })), { onConflict: "id" })

      if (insertErr) {
        console.error("Failed to save recording_actions:", insertErr)
        // Don't fail — table might not exist yet, just return the parsed data
      }
    }

    return NextResponse.json({
      success: true,
      recording_id,
      steps: withWaits,
      step_count: withWaits.length,
    })
  } catch (e) {
    console.error("Analyze error:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
