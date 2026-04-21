# Vision Fallback — Implementation Plan

Last-resort click target picker for the self-heal agent. Called only when
every stored selector (CSS / XPath / aria-label / data-testid / text / class
list / id) has failed AND raw-coord fallback is either stale or blocked.

Currently shipped as a stub at `POST /api/ai-agent/vision-fallback` that
returns HTTP 501. This doc is the checklist for wiring the real thing.

---

## Model

Primary: `claude-opus-4-7` (Anthropic) — highest vision accuracy we have access
to, worth the cost on the last-resort path. One call per failed run, max.

Cost fallback: `claude-sonnet-4-6` for high-volume debug mode only (never for
production self-heal).

---

## Input

Request body passes two things plus context loaded server-side:

```
{
  "screenshot_url": "https://.../step-07-before.png",
  "instruction":    "click the Send button in the active DM thread"
}
```

Server also loads, from the `ai_agent_log` row that spawned this call:

- `selectors_snapshot` — the selectors that already failed (feeds the prompt as
  negative context: "these didn't work, find a different anchor")
- Original target description captured at recording time (step.description)
- Parent automation's platform (affects the system prompt — Instagram/LinkedIn
  have different DOM idioms we can nudge the model about)

System prompt skeleton:

> You are a visual UI locator for browser automations. Given a screenshot
> and a human instruction, return the pixel (x, y) of the exact element to
> click. Coordinates are from the top-left of the screenshot. If you are not
> confident (< 0.7), refuse and explain.

User prompt wraps the screenshot (base64 or URL), the instruction, the
platform name, and the list of already-failed selectors.

---

## Output

Expected JSON (enforced via tool-use or structured-output):

```
{ "x": 1208, "y": 642, "confidence": 0.87, "rationale": "…" }
```

Or a structured refusal:

```
{ "x": null, "y": null, "confidence": 0.0, "refusal": "element not visible" }
```

---

## Failure mode

If `confidence < 0.7`:

1. Do NOT click. Clicking wrong on a real account burns trust we cannot afford.
2. Flip the parent automation's `status` to `needs_rerecording`.
3. Telegram-alert Dylan at chat id `6546592939` with:
   - automation name + platform
   - failed_step_index + description
   - the screenshot URL
   - the model's refusal reason (if any)
4. Write a row to `ai_agent_log` with `proposed_fix = { confidence, refusal }`
   and status `rejected` so the scan loop doesn't re-queue the same run.

---

## Rate limit

Max **1 call per failed run per minute**. Keyed on `run_id` in Redis (or the
`ai_agent_log.run_id` column if Redis isn't available yet). Stacked requests
for the same run return the cached response from the first call — prevents
rapid-retry loops from billing the vision model 10x.

Global ceiling: 60 vision calls per hour per project. Beyond that → force
`needs_rerecording` without calling the model.

---

## Testing plan (before flipping off the stub)

1. Unit: mock the Anthropic client, verify output schema validation catches
   malformed responses.
2. Integration: curated set of 20 historical failure screenshots + known-good
   targets → assert ≥ 18/20 clicks within 24px of ground truth.
3. Staging E2E: record a real Instagram DM, manually break the primary
   selector, run maintenance cron, verify the vision fallback heals the run
   and applies the new selector.
4. Load: hammer 100 requests in parallel, verify rate-limit cap kicks in.

---

## Open questions (for Dylan before shipping)

- Auto-apply on high confidence (> 0.95) vs always require Dylan's review?
  Leaning auto-apply for production self-heal to keep real leads unblocked.
- Retention: keep vision calls forever for audit, or purge after 30d?
