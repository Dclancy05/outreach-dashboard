/**
 * Phase E — AI auto-repair for failed automation steps.
 *
 * When the self-test runner has tried all 5 deterministic strategies
 * (original, text_based, shadow_dom, xpath, coordinates) and none of
 * them found the target element, this helper spawns a Claude Code
 * subagent on the VPS via the **agent-runner** (NOT a direct Anthropic
 * API call — per memory `feedback_no_anthropic_api_key.md`, that env
 * var is banned on this project; everything goes through the user's
 * Claude Code subscription via the agent-runner).
 *
 * The subagent receives:
 *   - the recorded step description ("click the Message button")
 *   - the visible target text on screen
 *   - the chain of selectors that already failed
 *   - a screenshot of the current page
 *   - the URL the test was running against
 *
 * It returns:
 *   - up to 3 candidate CSS selectors to try
 *   - optional click coordinates as a last resort
 *   - a short "reasoning" string for the audit log
 *   - a confidence 0..1
 *
 * Cost cap (Phase E-2): each call is metered. Per-automation aggregate
 * cap of $2 is enforced before invoking the runner — a busted automation
 * can't drain the subscription budget by re-triggering repair on every
 * test cycle. The cap reads from automation_test_log.cost_cents
 * (migration 20260506_repair_cost_tracking.sql).
 */

import { createClient } from "@supabase/supabase-js"
import { getSecret } from "@/lib/secrets"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const PER_AUTOMATION_COST_CAP_CENTS = 200 // $2.00

export interface RepairInput {
  /** uuid of the automation row being repaired (for audit log + per-automation cost cap) */
  automationId: string | null
  /** Failed step description for the agent prompt */
  stepDescription: string
  /** Visible text the user clicked / typed (often the most reliable hint) */
  targetText?: string | null
  /** Selectors that were tried and failed, in order */
  attemptedSelectors: string[]
  /** URL Chrome was on when the test ran */
  targetUrl: string
  /**
   * Path on the VPS where the screenshot is saved (sibling-readable, e.g.
   * /dev/shm/automation-repair/<run_id>/<step>.png). The agent reads it.
   *
   * @deprecated Vercel routes can't write to the VPS filesystem. Kept for
   * backward compat — new callers should pass `screenshotUrl` instead.
   */
  screenshotPath?: string | null
  /**
   * Bug #25 fix: Supabase storage signed URL (5-min TTL) the subagent can
   * `curl` and then Read off the local /tmp path. When present, the prompt
   * tells the agent exactly how to fetch + view the screenshot. When null,
   * the agent degrades to text-only reasoning (same as before).
   */
  screenshotUrl?: string | null
  /** Platform key — gives the agent additional context */
  platform?: string | null
  /** Action key — gives the agent additional context */
  actionType?: string | null
}

export interface RepairResult {
  /** Up to 3 candidate selectors, ranked best-first */
  selectors: string[]
  /** Last-resort click coordinates if the agent couldn't find a selector */
  coordinates?: { x: number; y: number }
  /** Short explanation for the audit log */
  reasoning: string
  /** 0..1 — agent's stated confidence in the suggestion */
  confidence: number
  /** Cost of this call in USD (for the per-automation cap). */
  costUsd: number
  /** Whether the agent-runner was reachable + actually replied. */
  ok: boolean
  /** When ok=false: reason ("not_configured", "timeout", "agent_error", etc.). */
  error?: string
}

const REPAIR_TIMEOUT_MS = 90_000

async function getRunnerUrl(): Promise<string> {
  return (await getSecret("AGENT_RUNNER_URL")) || ""
}
async function getRunnerToken(): Promise<string> {
  return (await getSecret("AGENT_RUNNER_TOKEN")) || ""
}

const REPAIR_AGENT_SLUG = "automation-selector-repair"

function buildPrompt(input: RepairInput): string {
  const selList =
    input.attemptedSelectors.length > 0
      ? input.attemptedSelectors.map((s, i) => `  ${i + 1}. ${s}`).join("\n")
      : "  (none)"
  return `An automated browser test failed to find an element. You're being asked to propose a new way to find it.

CONTEXT:
- Platform: ${input.platform ?? "unknown"}
- Action being recorded: ${input.actionType ?? "unknown"}
- Page URL: ${input.targetUrl}
- Step description: ${input.stepDescription}
- Visible target text the user clicked/typed: ${input.targetText ?? "(not captured)"}

SELECTORS WE ALREADY TRIED (all failed):
${selList}

${
  input.screenshotUrl
    ? `SCREENSHOT: A signed URL is available below (Supabase storage, 5-minute TTL). Download it locally first, then Read the local file:

  curl -s -o /tmp/repair-screenshot.png "${input.screenshotUrl}"
  Read /tmp/repair-screenshot.png

The signed URL: ${input.screenshotUrl}`
    : input.screenshotPath
      ? `SCREENSHOT: ${input.screenshotPath} — read this file with the Read tool to see exactly what the page looked like.`
      : "SCREENSHOT: (not available)"
}

YOUR JOB:
Look at the screenshot (if available). Identify the element the user wanted to interact with. Return strict JSON in this exact shape:

{
  "selectors": ["css selector 1", "css selector 2", "css selector 3"],
  "coordinates": { "x": 123, "y": 456 },
  "reasoning": "one sentence about why these will work where the others didn't",
  "confidence": 0.85
}

RULES:
- Return up to 3 selectors, ranked best-first. Prefer aria-labels, data-testid, and text-based matchers (e.g., button:has-text("Message")) — avoid brittle nth-child / generated class names.
- "coordinates" is optional — only include it as a true last resort if no selector will be reliable.
- "confidence" must reflect honest belief; do not pad.
- DO NOT suggest clicks that bypass safety dialogs, dismiss "report this account" prompts, or otherwise move the test toward ban-risk behavior.
- DO NOT suggest "send faster" or "skip warmup" — irrelevant to selector repair.
- Output JSON only, no prose around it.`
}

/**
 * Best-effort sum of cost_cents in automation_test_log for this automation
 * (only repaired_by_ai rows). Returns 0 when the column doesn't exist
 * (pre-migration), so the cap is implicitly disabled until the migration
 * applies — the runner will still get called once per attempt then.
 */
async function sumRepairCostCentsForAutomation(
  automationId: string | null | undefined
): Promise<number> {
  if (!automationId) return 0
  try {
    const { data, error } = await supabase
      .from("automation_test_log")
      .select("cost_cents")
      .eq("automation_id", automationId)
      .eq("repaired_by_ai", true)
    if (error) return 0
    return (data || []).reduce(
      (sum, r) => sum + (typeof r.cost_cents === "number" ? r.cost_cents : 0),
      0
    )
  } catch {
    return 0
  }
}

/**
 * Calls the agent-runner. Returns ok:false with a structured error when
 * the runner isn't configured, times out, or crashes — never throws so
 * the self-test loop can treat it as just another failed strategy.
 *
 * Phase E-2: enforces a per-automation $2 (200¢) aggregate cost cap
 * BEFORE invoking the runner. If prior repair attempts on this
 * automation already total ≥ cap, returns `ok:false` with
 * `error: "per_automation_cost_cap"` so the operator sees a clear signal
 * that the automation is too far gone to keep paying for AI fixes.
 */
export async function repairFailedStep(
  input: RepairInput
): Promise<RepairResult> {
  const runnerUrl = await getRunnerUrl()
  if (!runnerUrl) {
    return {
      ok: false,
      error: "agent_runner_not_configured",
      selectors: [],
      reasoning:
        "AGENT_RUNNER_URL is not set — set it in /agency/keys to enable AI auto-repair.",
      confidence: 0,
      costUsd: 0,
    }
  }

  // Phase E-2 — cost cap pre-check.
  const priorCents = await sumRepairCostCentsForAutomation(input.automationId)
  if (priorCents >= PER_AUTOMATION_COST_CAP_CENTS) {
    return {
      ok: false,
      error: "per_automation_cost_cap",
      selectors: [],
      reasoning: `This automation has already used $${(priorCents / 100).toFixed(2)} of AI repair budget (cap: $${(PER_AUTOMATION_COST_CAP_CENTS / 100).toFixed(2)}). Re-record manually or raise PER_AUTOMATION_COST_CAP_CENTS.`,
      confidence: 0,
      costUsd: 0,
    }
  }

  const runnerToken = await getRunnerToken()
  const prompt = buildPrompt(input)

  try {
    const res = await fetch(`${runnerUrl.replace(/\/+$/, "")}/agents/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(runnerToken ? { Authorization: `Bearer ${runnerToken}` } : {}),
      },
      body: JSON.stringify({
        agent_slug: REPAIR_AGENT_SLUG,
        prompt,
        vars: {
          automation_id: input.automationId,
          screenshot_path: input.screenshotPath || null,
          // Bug #25 fix: signed URL (Supabase storage, 5-min TTL) the agent
          // can curl + Read. Replaces the legacy filesystem path that could
          // never work from Vercel.
          screenshot_url: input.screenshotUrl || null,
          target_url: input.targetUrl,
          platform: input.platform || null,
          action_type: input.actionType || null,
        },
        // No parent_run_id — this isn't tied to a workflow.
        parent_run_id: null,
      }),
      signal: AbortSignal.timeout(REPAIR_TIMEOUT_MS),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return {
        ok: false,
        error: `agent_runner_${res.status}`,
        selectors: [],
        reasoning: body.slice(0, 200) || "agent runner returned non-OK status",
        confidence: 0,
        costUsd: 0,
      }
    }

    const data = (await res.json()) as {
      output?: {
        selectors?: string[]
        coordinates?: { x: number; y: number }
        reasoning?: string
        confidence?: number
      }
      cost_usd?: number
    }

    const out = data.output || {}
    const selectors = Array.isArray(out.selectors)
      ? out.selectors.filter((s) => typeof s === "string").slice(0, 3)
      : []

    // Bug #28 — validate coordinates are finite + in a sane range.
    // typeof === "number" allows NaN/Infinity which would crash CDP
    // Input.dispatchMouseEvent. Cap at 10000×10000 (larger than any
    // realistic viewport) to reject garbage.
    const coordsOk =
      out.coordinates &&
      Number.isFinite(out.coordinates.x) &&
      Number.isFinite(out.coordinates.y) &&
      out.coordinates.x >= 0 &&
      out.coordinates.x <= 10000 &&
      out.coordinates.y >= 0 &&
      out.coordinates.y <= 10000

    return {
      ok: true,
      selectors,
      coordinates: coordsOk ? out.coordinates : undefined,
      reasoning:
        typeof out.reasoning === "string" ? out.reasoning : "(no reasoning supplied)",
      confidence:
        typeof out.confidence === "number"
          ? Math.max(0, Math.min(1, out.confidence))
          : 0.5,
      costUsd: Number(data.cost_usd) || 0,
    }
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return {
        ok: false,
        error: "timeout",
        selectors: [],
        reasoning: `agent-runner did not respond within ${REPAIR_TIMEOUT_MS / 1000}s`,
        confidence: 0,
        costUsd: 0,
      }
    }
    return {
      ok: false,
      error: "agent_runner_exception",
      selectors: [],
      reasoning: e?.message || "unknown error calling agent-runner",
      confidence: 0,
      costUsd: 0,
    }
  }
}
