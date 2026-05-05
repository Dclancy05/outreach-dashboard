import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function vpsUrl(): Promise<string> {
  const { getSecret } = await import("@/lib/secrets")
  return (
    (await getSecret("VPS_URL")) ||
    (await getSecret("RECORDING_SERVER_URL")) ||
    "http://srv1197943.hstgr.cloud:3848"
  )
}

// 5 selector strategies in order of preference
const STRATEGIES = [
  "original",       // 1. Recorded selectors as-is
  "text_based",     // 2. Find by visible text content
  "shadow_dom",     // 3. Deep shadow DOM traversal (like LinkedIn fix)
  "xpath",          // 4. XPath fallbacks
  "coordinates",    // 5. Last resort: click by coordinates
] as const

type Strategy = typeof STRATEGIES[number]

// Build CDP evaluate expression for different strategies
function buildFindExpression(strategy: Strategy, step: {
  type: string
  selectors: string[]
  fallback_text?: string
  fallback_coordinates?: { x: number; y: number }
  params: Record<string, unknown>
}): string | null {
  const selectors = step.selectors || []

  switch (strategy) {
    case "original":
      if (!selectors.length) return null
      // Try each selector in order
      return `
        (function() {
          const selectors = ${JSON.stringify(selectors.slice(0, 3))};
          for (const sel of selectors) {
            try {
              const el = document.querySelector(sel);
              if (el) { el.click(); return { found: true, selector: sel }; }
            } catch(e) {}
          }
          return { found: false };
        })()
      `

    case "text_based":
      if (!step.fallback_text) return null
      return `
        (function() {
          const searchText = ${JSON.stringify(step.fallback_text)}.toLowerCase();
          // Search buttons first, then links, then any clickable
          const candidates = [
            ...document.querySelectorAll('button'),
            ...document.querySelectorAll('a'),
            ...document.querySelectorAll('[role="button"]'),
            ...document.querySelectorAll('[tabindex="0"]'),
          ];
          for (const el of candidates) {
            const text = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase().trim();
            if (text === searchText || text.includes(searchText)) {
              el.click();
              return { found: true, text: el.textContent?.trim()?.substring(0, 50) };
            }
          }
          return { found: false };
        })()
      `

    case "shadow_dom":
      if (!step.fallback_text && !selectors.length) return null
      // Deep shadow DOM search — the approach that fixed LinkedIn
      return `
        (function() {
          function deepSearch(root, text, selectors) {
            const results = [];
            function walk(node) {
              if (!node) return;
              // Check regular children
              if (node.nodeType === 1) {
                // Try selectors on this element
                for (const sel of selectors) {
                  try {
                    const found = node.querySelector ? node.querySelector(sel) : null;
                    if (found) results.push(found);
                  } catch(e) {}
                }
                // Check text content
                if (text) {
                  const nodeText = (node.textContent || node.getAttribute?.('aria-label') || '').toLowerCase();
                  const tag = node.tagName?.toLowerCase() || '';
                  if ((tag === 'button' || tag === 'a' || node.getAttribute?.('role') === 'button') 
                      && nodeText.includes(text.toLowerCase())) {
                    results.push(node);
                  }
                }
                // Enter shadow DOM
                if (node.shadowRoot) walk(node.shadowRoot);
                // Walk children
                for (const child of (node.children || [])) walk(child);
              }
            }
            walk(root);
            return results;
          }
          const text = ${JSON.stringify(step.fallback_text || "")};
          const sels = ${JSON.stringify(selectors.slice(0, 5))};
          const found = deepSearch(document.body, text, sels);
          if (found.length > 0) {
            found[0].click();
            return { found: true, method: 'shadow_dom', text: found[0].textContent?.trim()?.substring(0, 50) };
          }
          return { found: false };
        })()
      `

    case "xpath":
      if (!step.fallback_text) return null
      return `
        (function() {
          const text = ${JSON.stringify(step.fallback_text)};
          const xpaths = [
            '//button[contains(text(),"' + text + '")]',
            '//a[contains(text(),"' + text + '")]',
            '//*[@role="button"][contains(text(),"' + text + '")]',
            '//*[contains(@aria-label,"' + text + '")]',
          ];
          for (const xpath of xpaths) {
            try {
              const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
              if (result.singleNodeValue) {
                result.singleNodeValue.click();
                return { found: true, xpath };
              }
            } catch(e) {}
          }
          return { found: false };
        })()
      `

    case "coordinates":
      if (!step.fallback_coordinates) return null
      // We'll handle this via CDP Input.dispatchMouseEvent, not evaluate
      return null
  }
}

// Safe test targets per (platform, action) — backed by the single source of
// truth in `src/lib/automations/platform-action-targets.ts`. Edit there, not
// here. The shape conversion preserves the legacy `{ url, name, skipSend? }`
// interface this route consumes.
import { buildLegacyTestTargets } from "@/lib/automations/platform-action-targets"
const TEST_TARGETS: Record<string, Record<string, { url: string; name: string; skipSend?: boolean }>> =
  buildLegacyTestTargets()

async function runCDPCommand(method: string, params: Record<string, unknown> = {}) {
  try {
    const VPS_URL = await vpsUrl()
    const res = await fetch(`${VPS_URL}/cdp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, params }),
    })
    return await res.json()
  } catch (e) {
    return { error: String(e) }
  }
}

async function runTestWithStrategy(
  strategy: Strategy,
  script: Array<{
    step: number; type: string; selectors: string[];
    fallback_text?: string; fallback_coordinates?: { x: number; y: number };
    params: Record<string, unknown>; cdp_method: string; wait_after_ms?: number;
    description: string
  }>,
  platform: string,
  actionType: string,
  testTarget: { url: string; name: string; skipSend?: boolean }
): Promise<{ success: boolean; error?: string; stepsCompleted: number }> {
  let stepsCompleted = 0

  for (const step of script) {
    try {
      // Navigate
      if (step.type === "navigate") {
        // Use test target URL instead of recorded URL for the first navigate
        const url = stepsCompleted === 0 ? testTarget.url : (step.params.url as string || testTarget.url)
        await runCDPCommand("Page.navigate", { url })
        await new Promise(r => setTimeout(r, step.wait_after_ms || 3000))
        stepsCompleted++
        continue
      }

      // Wait
      if (step.type === "wait") {
        await new Promise(r => setTimeout(r, (step.params.duration as number) || 1000))
        stepsCompleted++
        continue
      }

      // Press key
      if (step.type === "press_key") {
        // For DM tests, skip the actual send (Enter key at the end)
        if (testTarget.skipSend && step.params.key === "Enter" && stepsCompleted >= script.length - 2) {
          stepsCompleted++
          continue
        }
        await runCDPCommand("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: step.params.key,
          code: step.params.code,
          windowsVirtualKeyCode: step.params.windowsVirtualKeyCode,
        })
        await runCDPCommand("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: step.params.key,
          code: step.params.code,
        })
        await new Promise(r => setTimeout(r, step.wait_after_ms || 500))
        stepsCompleted++
        continue
      }

      // Type text
      if (step.type === "type") {
        const text = step.params.text as string || "Test message from George 🤖"

        // For DM test, use a safe test message
        const typeText = testTarget.skipSend ? "[TEST - not sending]" : text

        // First try to focus the input
        if (strategy === "original" || strategy === "text_based") {
          const selectors = step.selectors || []
          for (const sel of selectors) {
            try {
              await runCDPCommand("Runtime.evaluate", {
                expression: `document.querySelector('${sel.replace(/'/g, "\\'")}')?.focus()`,
              })
              break
            } catch {}
          }
        }

        // Type using insertText
        await runCDPCommand("Input.insertText", { text: typeText })
        await new Promise(r => setTimeout(r, step.wait_after_ms || 500))
        stepsCompleted++
        continue
      }

      // Click — this is where strategy matters
      if (step.type === "click") {
        if (strategy === "coordinates" && step.fallback_coordinates) {
          // Direct coordinate click
          await runCDPCommand("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x: step.fallback_coordinates.x,
            y: step.fallback_coordinates.y,
            button: "left",
            clickCount: 1,
          })
          await runCDPCommand("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x: step.fallback_coordinates.x,
            y: step.fallback_coordinates.y,
            button: "left",
          })
        } else {
          const expr = buildFindExpression(strategy, step)
          if (!expr) {
            // Strategy doesn't apply to this step, try basic selector
            if (step.selectors.length > 0) {
              const fallbackExpr = `document.querySelector('${step.selectors[0].replace(/'/g, "\\'")}')?.click()`
              const result = await runCDPCommand("Runtime.evaluate", { expression: fallbackExpr })
              if (result.error) throw new Error(`Click failed: ${result.error}`)
            }
          } else {
            const result = await runCDPCommand("Runtime.evaluate", {
              expression: expr,
              returnByValue: true,
            })
            const value = result?.result?.value
            if (!value?.found) {
              throw new Error(`Element not found with strategy '${strategy}' for: ${step.description}`)
            }
          }
        }

        await new Promise(r => setTimeout(r, step.wait_after_ms || 1500))
        stepsCompleted++
        continue
      }

      // Unknown step type — skip
      stepsCompleted++
    } catch (e) {
      return {
        success: false,
        error: `Step ${step.step} (${step.description}): ${String(e)}`,
        stepsCompleted,
      }
    }
  }

  return { success: true, stepsCompleted }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { script_id, automation_id } = body as { script_id?: string; automation_id?: string }

    if (!script_id && !automation_id) {
      return NextResponse.json({ error: "script_id or automation_id required" }, { status: 400 })
    }

    // Tier 1 path — automation_id loads from the `automations` table (new
    // ManualStepBuilder-fed flow). Map its `steps` JSONB into the same
    // shape the legacy strategy runner expects.
    let scriptRecord: any = null
    let isAutomationsTable = false
    if (automation_id) {
      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .eq("id", automation_id)
        .single()
      if (error || !data) {
        return NextResponse.json({ error: "Automation not found" }, { status: 404 })
      }
      scriptRecord = data
      isAutomationsTable = true
    } else {
      const { data, error } = await supabase
        .from("automation_scripts")
        .select("*")
        .eq("id", script_id)
        .single()
      if (error || !data) {
        return NextResponse.json({ error: "Script not found" }, { status: 404 })
      }
      scriptRecord = data
    }

    // Adapt automations.steps (Tier 1 wire format from toWireSteps) into
    // the legacy strategy runner shape. Drops fields the runner doesn't
    // need; supplies defaults for `step`, `cdp_method`, `description`.
    function adaptAutomationStepsToScript(steps: any[]): Array<{
      step: number; type: string; selectors: string[];
      fallback_text?: string; fallback_coordinates?: { x: number; y: number };
      params: Record<string, unknown>; cdp_method: string; wait_after_ms?: number;
      description: string;
    }> {
      return (Array.isArray(steps) ? steps : []).map((s, i) => {
        const type = String(s.type || "click").toLowerCase()
        const cdpMap: Record<string, string> = {
          navigate: "Page.navigate",
          click: "Input.dispatchMouseEvent",
          type: "Input.insertText",
          wait: "Page.waitForLoadState",
          press_key: "Input.dispatchKeyEvent",
          extract: "Runtime.evaluate",
        }
        return {
          step: i + 1,
          type,
          selectors: Array.isArray(s.selectors) ? s.selectors : [],
          fallback_text: s.fallback_text,
          fallback_coordinates: s.fallback_coordinates,
          params: s.params || {},
          cdp_method: cdpMap[type] || "Runtime.evaluate",
          wait_after_ms: type === "wait" ? Number(s.params?.ms) || 1000 : 250,
          description: s.params?.description || `${type} step`,
        }
      })
    }

    const platform = scriptRecord.platform as string
    const action_type = (scriptRecord.action_type ||
      (scriptRecord.tag === "outreach_action" ? "dm" : "test")) as string
    const script = isAutomationsTable
      ? adaptAutomationStepsToScript(scriptRecord.steps || [])
      : (scriptRecord.script_json as Array<{
          step: number; type: string; selectors: string[];
          fallback_text?: string; fallback_coordinates?: { x: number; y: number };
          params: Record<string, unknown>; cdp_method: string; wait_after_ms?: number;
          description: string
        }>)

    // Resolve which table + which id to write back to so the rest of the
    // route can update either the legacy automation_scripts row or the new
    // automations row that Tier 1 ManualStepBuilder creates.
    const recordTable = isAutomationsTable ? "automations" : "automation_scripts"
    const recordId = (script_id || automation_id) as string

    const testTarget = TEST_TARGETS[platform]?.[action_type]
    if (!testTarget) {
      // No safe test target — mark as active based on script generation alone
      await supabase.from(recordTable).update({
        status: "active",
        updated_at: new Date().toISOString(),
      }).eq("id", recordId)

      await insertNotification(
        "automation_success",
        `✅ ${platformLabel(platform)} ${action_type} automation is ready! (No auto-test available for this action)`,
        { [isAutomationsTable ? "automation_id" : "script_id"]: recordId, platform, action_type }
      )

      return NextResponse.json({
        success: true,
        status: "active",
        message: "No test target available, marked as active based on script generation",
      })
    }

    // Try each strategy
    let winningStrategy: Strategy | null = null
    let lastError = ""

    for (let i = 0; i < STRATEGIES.length; i++) {
      const strategy = STRATEGIES[i]
      const attemptNum = i + 1

      const startTime = Date.now()

      try {
        const result = await runTestWithStrategy(strategy, script, platform, action_type, testTarget)
        const duration = Date.now() - startTime

        // Log the attempt — automation_test_log only has script_id today;
        // for Tier 1 (automations table) leave it blank so the column
        // doesn't FK-fail. Future migration can add automation_id.
        await supabase.from("automation_test_log").insert({
          script_id: isAutomationsTable ? null : recordId,
          attempt_number: attemptNum,
          strategy,
          test_target: testTarget.url,
          success: result.success,
          error_message: result.error || null,
          duration_ms: duration,
        })

        if (result.success) {
          winningStrategy = strategy
          break
        }

        lastError = result.error || "Unknown error"
      } catch (e) {
        const duration = Date.now() - startTime
        lastError = String(e)

        await supabase.from("automation_test_log").insert({
          script_id: isAutomationsTable ? null : recordId,
          attempt_number: attemptNum,
          strategy,
          test_target: testTarget.url,
          success: false,
          error_message: lastError,
          duration_ms: duration,
        })
      }
    }

    // Update record status — `automations` table doesn't have all the
    // columns automation_scripts has (test_attempts, last_test_result,
    // selectors). Branch the update payload accordingly.
    const newStatus = winningStrategy ? "active" : "failed"
    if (isAutomationsTable) {
      await supabase.from("automations").update({
        status: winningStrategy ? "active" : "needs_rerecording",
        last_tested_at: new Date().toISOString(),
        last_error: winningStrategy ? null : lastError,
        updated_at: new Date().toISOString(),
      }).eq("id", recordId)
    } else {
      await supabase.from("automation_scripts").update({
        status: newStatus,
        test_attempts: STRATEGIES.length,
        last_test_at: new Date().toISOString(),
        last_test_result: winningStrategy
          ? { strategy: winningStrategy, test_target: testTarget.url }
          : { all_failed: true, last_error: lastError },
        last_error: winningStrategy ? null : lastError,
        ...(winningStrategy ? {
          selectors: {
            ...(scriptRecord.selectors || {}),
            _winning_strategy: winningStrategy,
          },
        } : {}),
        updated_at: new Date().toISOString(),
      }).eq("id", recordId)
    }

    // Send notification
    const idKey = isAutomationsTable ? "automation_id" : "script_id"
    const pLabel = platformLabel(platform)
    if (winningStrategy) {
      await insertNotification(
        "automation_success",
        `✅ ${pLabel} ${action_type} is now active! Tested successfully on ${testTarget.name}.`,
        { [idKey]: recordId, platform, action_type, strategy: winningStrategy, test_target: testTarget.name }
      )
    } else {
      await insertNotification(
        "automation_error",
        `${pLabel} ${action_type} needs attention — we couldn't get it working automatically. Tap to see what happened.`,
        { [idKey]: recordId, platform, action_type, last_error: lastError }
      )
    }

    return NextResponse.json({
      success: !!winningStrategy,
      status: newStatus,
      winning_strategy: winningStrategy,
      attempts: STRATEGIES.length,
      test_target: testTarget,
      last_error: winningStrategy ? null : lastError,
    })
  } catch (e) {
    console.error("Self-test error:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

function platformLabel(p: string): string {
  const labels: Record<string, string> = {
    ig: "Instagram", fb: "Facebook", li: "LinkedIn",
    tiktok: "TikTok", youtube: "YouTube"
  }
  return labels[p] || p
}

async function insertNotification(type: string, message: string, metadata: Record<string, unknown>) {
  try {
    await supabase.from("notifications").insert({
      type,
      message,
      metadata,
      read: false,
    })
  } catch (e) {
    console.error("Failed to insert notification:", e)
  }
}
