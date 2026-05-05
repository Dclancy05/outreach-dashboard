import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { setPipelinePhase } from "@/lib/automations/pipeline-status"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Platform-specific selector strategies
const PLATFORM_SELECTORS: Record<string, Record<string, string[]>> = {
  ig: {
    dm_button: [
      '[aria-label="Message"]',
      'div[role="button"]:has(svg[aria-label="Direct"])',
      'button:has-text("Message")',
    ],
    send_button: [
      'button[type="submit"]',
      '[aria-label="Send"]',
      'div[role="button"]:has-text("Send")',
    ],
    message_input: [
      'textarea[placeholder*="Message"]',
      'div[role="textbox"][contenteditable="true"]',
      'div[aria-label*="Message"]',
    ],
    follow_button: [
      'button:has-text("Follow")',
      'div[role="button"]:has-text("Follow")',
      'header button:has-text("Follow")',
    ],
    unfollow_button: [
      'button:has-text("Following")',
      'div[role="button"]:has-text("Following")',
      'button:has-text("Unfollow")',
    ],
  },
  fb: {
    dm_button: [
      '[aria-label="Send message"]',
      'a[href*="/messages/"]',
      'div[role="button"]:has-text("Message")',
    ],
    send_button: [
      '[aria-label="Press enter to send"]',
      'div[role="button"][aria-label="Send"]',
    ],
    message_input: [
      'div[role="textbox"][contenteditable="true"]',
      'p[data-placeholder]',
    ],
    follow_button: [
      'div[role="button"]:has-text("Follow")',
      'div[aria-label="Follow"]',
    ],
    unfollow_button: [
      'div[role="button"]:has-text("Following")',
      'div[aria-label="Unfollow"]',
    ],
  },
  li: {
    dm_button: [
      'button.message-anywhere-button',
      'button:has-text("Message")',
      'a[href*="/messaging/"]',
      // Shadow DOM deep search
      'artdeco-button:has-text("Message")',
    ],
    send_button: [
      'button.msg-form__send-button',
      'button[type="submit"]:has-text("Send")',
      'button:has(.msg-form__send-btn)',
    ],
    message_input: [
      'div.msg-form__contenteditable[contenteditable="true"]',
      'div[role="textbox"]',
      'div.msg-form__msg-content-container div[contenteditable]',
    ],
    connect_button: [
      'button:has-text("Connect")',
      'button[aria-label*="connect"]',
      'li-icon[type="connect"]',
    ],
    add_note_button: [
      'button:has-text("Add a note")',
      'button[aria-label*="Add a note"]',
    ],
    follow_button: [
      'button:has-text("Follow")',
      'button[aria-label*="Follow"]',
    ],
    unfollow_button: [
      'button:has-text("Following")',
      'button:has-text("Unfollow")',
    ],
  },
  tiktok: {
    dm_button: [
      'a[href*="/messages"]',
      'button:has-text("Message")',
    ],
    send_button: [
      'button[data-e2e="chat-send-btn"]',
      'button:has-text("Send")',
    ],
    message_input: [
      'div[contenteditable="true"]',
      'div[data-e2e="chat-input"]',
    ],
    follow_button: [
      'button[data-e2e="follow-button"]',
      'button:has-text("Follow")',
    ],
  },
  youtube: {
    subscribe_button: [
      '#subscribe-button button',
      'ytd-subscribe-button-renderer button',
      'tp-yt-paper-button#button',
    ],
  },
  // ─── Phase C — newly-supported platforms. Selectors are seed values
  // captured by hand from the live UIs as of 2026-05; the self-test +
  // auto-repair pipeline will refine these over time. ───
  x: {
    dm_button: [
      '[data-testid="DM_Button"]',
      'a[aria-label*="Message" i]',
      'div[role="button"][aria-label*="Send via Direct Message" i]',
    ],
    follow_button: [
      '[data-testid$="-follow"]',
      'div[role="button"]:has-text("Follow")',
      'button:has-text("Follow")',
    ],
    unfollow_button: [
      '[data-testid$="-unfollow"]',
      'div[role="button"]:has-text("Following")',
      'button:has-text("Unfollow")',
    ],
    reply_button: [
      '[data-testid="reply"]',
      'div[role="button"][aria-label*="Reply" i]',
    ],
    message_input: [
      '[data-testid="dmComposerTextInput"]',
      'div[role="textbox"][contenteditable="true"]',
      '[data-testid="tweetTextarea_0"]',
    ],
    send_button: [
      '[data-testid="dmComposerSendButton"]',
      '[data-testid="tweetButton"]',
      'div[role="button"][aria-label="Reply"]',
    ],
  },
  reddit: {
    chat_button: [
      'a[aria-label*="Open chat" i]',
      'button:has-text("Chat")',
      'a[href*="/chat/"]',
    ],
    follow_button: [
      'button:has-text("Follow")',
      'shreddit-async-loader button:has-text("Follow")',
    ],
    comment_box: [
      'shreddit-composer textarea',
      'div[role="textbox"][contenteditable="true"]',
      'textarea[name="comment"]',
    ],
    submit_comment_button: [
      'button:has-text("Comment")',
      'shreddit-composer button[type="submit"]',
    ],
    post_button: [
      'a[href*="/submit"]',
      'button:has-text("Create a post")',
    ],
    message_input: [
      'div[role="textbox"][contenteditable="true"]',
      'textarea[placeholder*="message" i]',
    ],
    send_button: [
      'button[aria-label="send" i]',
      'button:has-text("Send")',
    ],
  },
  snapchat: {
    chat_button: [
      'div[aria-label*="Chat" i]',
      'button[aria-label*="Send Chat" i]',
    ],
    add_friend_button: [
      'button:has-text("Add Friend")',
      'button:has-text("+ Add")',
      'div[role="button"]:has-text("Add Friend")',
    ],
    message_input: [
      'div[contenteditable="true"][role="textbox"]',
      'textarea[placeholder*="Send a chat" i]',
    ],
    send_button: [
      'button[aria-label="Send" i]',
      'div[role="button"][aria-label="Send"]',
    ],
  },
  pinterest: {
    follow_button: [
      'button[data-test-id="follow-button"]',
      'button:has-text("Follow")',
    ],
    save_pin_button: [
      'button[data-test-id="board-dropdown-save-button"]',
      'button:has-text("Save")',
    ],
    message_button: [
      'button[aria-label*="Message" i]',
      'a[href*="/inbox/"]',
    ],
    message_input: [
      'div[contenteditable="true"][role="textbox"]',
      'textarea[placeholder*="Send a message" i]',
    ],
    send_button: [
      'button[aria-label="Send" i]',
      'button:has-text("Send")',
    ],
  },
}

// Test targets for safe self-testing — backed by the single source of truth
// in `src/lib/automations/platform-action-targets.ts`. To add or change a
// safe target for any (platform, action) pair, edit that file, NOT here.
import { buildLegacySafeTestTargets } from "@/lib/automations/platform-action-targets"
const SAFE_TEST_TARGETS: Record<string, Record<string, string>> = buildLegacySafeTestTargets()

interface RecordingAction {
  step_number: number
  action_type: string
  target_selector: string | null
  target_text: string | null
  typed_text: string | null
  url: string | null
  coordinates: { x: number; y: number } | null
  timestamp_ms: number | null
}

function buildCDPScript(
  actions: RecordingAction[],
  platform: string,
  actionType: string
) {
  const cdpCommands: Array<{
    step: number
    type: string
    description: string
    cdp_method: string
    params: Record<string, unknown>
    selectors: string[]
    fallback_text?: string
    fallback_coordinates?: { x: number; y: number }
    wait_after_ms?: number
  }> = []

  const platformSelectors = PLATFORM_SELECTORS[platform] || {}
  let stepNum = 0

  for (const action of actions) {
    stepNum++

    if (action.action_type === "navigate") {
      cdpCommands.push({
        step: stepNum,
        type: "navigate",
        description: `Navigate to ${action.url}`,
        cdp_method: "Page.navigate",
        params: { url: action.url || "" },
        selectors: [],
        wait_after_ms: 3000,
      })
      continue
    }

    if (action.action_type === "click") {
      // Build selector list: recorded selector + platform-specific + text-based + coordinate fallback
      const selectors: string[] = []
      if (action.target_selector) selectors.push(action.target_selector)

      // Try to match against known platform selectors
      const textLower = (action.target_text || "").toLowerCase()
      for (const [key, sels] of Object.entries(platformSelectors)) {
        if (textLower.includes(key.replace(/_/g, " ")) || key.includes(textLower.replace(/\s/g, "_"))) {
          selectors.push(...sels)
        }
      }

      // Text-based fallback
      if (action.target_text) {
        selectors.push(`*:has-text("${action.target_text}")`)
        selectors.push(`[aria-label="${action.target_text}"]`)
        selectors.push(`button:has-text("${action.target_text}")`)
      }

      cdpCommands.push({
        step: stepNum,
        type: "click",
        description: `Click ${action.target_text || action.target_selector || "element"}`,
        cdp_method: "Runtime.evaluate",
        params: {},
        selectors: [...new Set(selectors)], // dedupe
        fallback_text: action.target_text || undefined,
        fallback_coordinates: action.coordinates || undefined,
        wait_after_ms: 1500,
      })
      continue
    }

    if (action.action_type === "type") {
      const selectors: string[] = []
      if (action.target_selector) selectors.push(action.target_selector)

      // Platform-specific input selectors
      if (platformSelectors.message_input) {
        selectors.push(...platformSelectors.message_input)
      }

      // Generic fallbacks
      selectors.push(
        'div[contenteditable="true"]',
        "textarea:focus",
        'input[type="text"]:focus',
        'div[role="textbox"]'
      )

      cdpCommands.push({
        step: stepNum,
        type: "type",
        description: `Type "${action.typed_text?.substring(0, 30)}${(action.typed_text?.length || 0) > 30 ? "..." : ""}"`,
        cdp_method: "Input.dispatchKeyEvent",
        params: { text: action.typed_text || "" },
        selectors: [...new Set(selectors)],
        wait_after_ms: 500,
      })
      continue
    }

    if (action.action_type === "press_enter") {
      cdpCommands.push({
        step: stepNum,
        type: "press_key",
        description: "Press Enter",
        cdp_method: "Input.dispatchKeyEvent",
        params: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
        selectors: [],
        wait_after_ms: 1000,
      })
      continue
    }

    if (action.action_type === "press_tab") {
      cdpCommands.push({
        step: stepNum,
        type: "press_key",
        description: "Press Tab",
        cdp_method: "Input.dispatchKeyEvent",
        params: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
        selectors: [],
        wait_after_ms: 500,
      })
      continue
    }

    if (action.action_type === "wait") {
      cdpCommands.push({
        step: stepNum,
        type: "wait",
        description: `Wait ${action.timestamp_ms || 1000}ms`,
        cdp_method: "wait",
        params: { duration: action.timestamp_ms || 1000 },
        selectors: [],
      })
      continue
    }
  }

  // Build comprehensive selector map for fallbacks
  const allSelectors: Record<string, string[]> = {}
  for (const cmd of cdpCommands) {
    if (cmd.selectors.length > 0) {
      allSelectors[`step_${cmd.step}`] = cmd.selectors
    }
  }

  return {
    script: cdpCommands,
    selectors: allSelectors,
    test_target: SAFE_TEST_TARGETS[platform]?.[actionType] || null,
    platform,
    action_type: actionType,
  }
}

export async function POST(req: Request) {
  try {
    const { recording_id, steps, platform, action_type } = await req.json()

    if (!recording_id) {
      return NextResponse.json({ error: "recording_id required" }, { status: 400 })
    }

    // Phase D — surface real progress to the RecordingModal poll.
    await setPipelinePhase(recording_id, "building")

    // If steps not provided, fetch from recording_actions
    let actions: RecordingAction[] = steps || []
    if (!actions.length) {
      const { data, error } = await supabase
        .from("recording_actions")
        .select("*")
        .eq("recording_id", recording_id)
        .order("step_number")

      if (error || !data?.length) {
        return NextResponse.json({ error: "No actions found for this recording" }, { status: 404 })
      }
      actions = data
    }

    // Determine platform/action from recording if not provided
    let plat = platform
    let act = action_type
    if (!plat || !act) {
      const { data: rec } = await supabase
        .from("recordings")
        .select("platform, action_type")
        .eq("id", recording_id)
        .single()
      if (rec) {
        plat = plat || rec.platform
        act = act || rec.action_type
      }
    }

    plat = plat || "ig"
    act = act || "dm"

    // Build the CDP automation script
    const result = buildCDPScript(actions, plat, act)

    // Save to automation_scripts table
    const { data: script, error: insertErr } = await supabase
      .from("automation_scripts")
      .insert({
        recording_id,
        platform: plat,
        action_type: act,
        script_json: result.script,
        selectors: result.selectors,
        status: "testing",
        test_attempts: 0,
      })
      .select()
      .single()

    if (insertErr) {
      console.error("Failed to save automation script:", insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      script_id: script.id,
      script: result.script,
      selectors: result.selectors,
      test_target: result.test_target,
      step_count: result.script.length,
    })
  } catch (e) {
    console.error("Build automation error:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
