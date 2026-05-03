# Testing Skill v2 — What It Is and How To Use It

> **Read this first if you've never seen the testing skill before.** Everything else (the agent file, the harness scripts, the assertions) makes more sense after this.

---

## What it is, in one sentence

A robot that drives the app like a real human, captures everything that happens behind the scenes, and tells me in numbers whether the app is smooth or janky.

That's it. No magic.

---

## Why it exists

On 2026-05-02 we shipped a "fix" for the Sign In Now popup. The fix tested green. Then Dylan opened the popup and Chrome was rotating through Instagram → Facebook → LinkedIn → TikTok every 30 seconds while just sitting on the page. That's a ban-risk pattern that almost cost us real social accounts.

The fix had been "verified" because the test was blind. It only checked the dashboard's own network tab, not what the production Chrome on the VPS was actually doing.

This testing skill is the layer that makes sure that never happens again.

**The rule:** "popup looks fine" is not a passing test. "Popup looks fine AND zero unexpected `/goto` calls AND every navigation appears in the audit log AND lag p50 < 50ms" is.

---

## What it measures, and why each number matters

When the harness runs a scenario, it produces a report with these numbers:

### Lag numbers
| Number | What it means | Bad if… |
|---|---|---|
| **median frame interval** (p50) | How long, on average, between screen redraws. Smaller = smoother. | > 33ms (means below 30 FPS) |
| **p95 frame interval** | The 95th percentile. 5 out of every 100 frames are at least this slow. | > 50ms (means a fifth of a second hiccup, every 20 frames) |
| **p99 frame interval** | The 99th percentile. The worst hiccups. | > 200ms (a freeze the user definitely notices) |
| **jank count** | How many frames took longer than 50ms. | > 5 in a 60s test |
| **longest stall** | The single worst freeze. | > 500ms |
| **freeze windows** (VNC only) | Times the VNC canvas didn't change for >1s. | > 0 |

### Ban-risk numbers
| Number | What it means | Bad if… |
|---|---|---|
| **/goto calls** | How many times the dashboard told the VPS Chrome to navigate. | More than the user clicked. Idle = zero. |
| **/login-status calls** | How many times we asked Chrome "are you logged in?" | More than 1 per minute. |
| **tabs created** (CDP) | How many new tabs opened in the production Chrome. | More than the user opened. |
| **tabs navigated** | How many times an existing tab changed URL. | More than 3 in any test (= rotation pattern) |

### Reliability numbers
| Number | What it means | Bad if… |
|---|---|---|
| **5xx responses** | Server errors during the run. | > 0 |
| **page errors** | JavaScript exceptions that crashed something. | > 0 |
| **429 responses** | Rate-limit triggers. | > 1 unintentional |
| **WebSocket closes** | How often the noVNC connection dropped. | More than expected for the test duration |

If any of those go red, the test fails. No "looks fine" pass.

---

## The 4 layers of capture, explained as a flight recorder

The harness records FOUR things at once and merges them into one timeline you can read top-to-bottom like a flight recorder:

1. **CDP target events** — every tab opened, closed, or navigated in the production Chrome on the VPS.
   *Like:* every door opening on the plane.

2. **Network requests** — every `/api/*` call from the dashboard, with status codes.
   *Like:* every radio call between the cockpit and ground.

3. **Console + page errors** — silent JavaScript exceptions that prod-mode never logs.
   *Like:* every dashboard warning light that flickered.

4. **Visual stream** — a screenshot every 500ms.
   *Like:* the cockpit camera.

Plus, after the run finishes:

5. **Audit log scrape** — query `/api/observability/chrome-goto` to confirm what the VPS audit log actually recorded matches what the network monitor saw.
6. **Frame-rate analyzer** — read every `requestAnimationFrame` timestamp the page produced and compute the lag numbers.
7. **Visual diff** — perceptual hashing on the screenshots to find "stutter signatures" (UI froze and then snapped).

Five inputs. One merged timeline. One pass/fail.

---

## The 7 assertions every test must pass

Every scenario passes only if all 7 are true:

1. **Bounded request count.** The number of `/api/platforms/goto` calls is at most the number explicitly triggered by the user action. Idle = zero.
2. **No 500s.** Any 500 response from the dashboard during the run = fail.
3. **No unhandled console errors.** Any `pageerror` event = fail.
4. **No zombie tabs.** Any tab opened during the run is either still open at the end OR closed cleanly. No leaks.
5. **Frame stats meet budget.** Median frame interval ≤ 33ms (30 FPS). p95 ≤ 50ms.
6. **Audit log matches.** The `/api/observability/chrome-goto` log shows exactly the navigations the network monitor saw.
7. **Sentry quiet.** Zero new Sentry events fingerprinted during the run.

If any of those fail, the harness exits non-zero and prints the merged timeline pointing at the failing event.

---

## How to run it

Every scenario takes one command:

```bash
# The popup login flow — reproduces the 2026-05-02 incident
node scripts/harness/run.mjs --scenario popup-login --duration 80

# Sit idle on /automations for 90s, assert no Chrome navigation
node scripts/harness/run.mjs --scenario idle-smoke --duration 90

# Mount the VNC viewer for 2 min, measure lag + freezes
node scripts/harness/run.mjs --scenario observability-vnc --duration 120

# Open /automations and try to start a recording session
node scripts/harness/run.mjs --scenario automation-record --duration 60
```

Every run writes to `/tmp/harness/<scenario>-<timestamp>/`:

- `timeline.txt` — merged human-readable, one line per event
- `claude-readable.json` — structured for AI ingestion
- `report.html` — clickable timeline you can open in a browser
- `screenshots/*.png` — flipbook of the run
- `lag-report.json` — frame stats (the numbers Dylan reads)

Exit code:
- `0` — all assertions passed
- `1` — at least one assertion failed
- `2` — the scenario crashed

---

## How to add a new scenario

1. Create `scripts/harness/scenarios/<name>.mjs`. Copy `popup-login.mjs` as a template.
2. Export 3 things:
   - `meta` — name, description, default duration
   - `assertions` — array of `{ name, check(events, ctx) → { ok, detail } }`
   - `run({ page, ev, log, dashboardUrl, pin, opts, scenarioCtx })` — drive the user flow
3. Use `ev("flow.<step>")` to mark significant moments. The harness wraps you with all instruments automatically.
4. Run it: `node scripts/harness/run.mjs --scenario <name>`.

That's the whole API. Don't manage CDP subscriptions, don't wire screenshot timers, don't write reporters. The harness does that.

---

## What this skill never does

- Never claim "looks fine" without numbers. The phrase "looks fine" is **banned** in any output.
- Never run only the happy path. Every scenario has at least one negative case (cancel, network fail, no-op).
- Never run from headless Chrome alone for VNC tests — use the real VPS Chrome session through CDP so we see what Dylan sees.
- Never mock the API for what's testable end-to-end. Hit the live preview deploy.
- Never delete a scenario because it's flaky. Flaky scenario = flaky feature. That's the bug.

---

## The rule, written once so we don't forget

> "popup looks fine" is not a passing test.
>
> "popup looks fine AND zero `/goto` calls during idle AND every navigation appears in the audit log AND the rate limiter fires when expected AND median frame interval ≤ 33ms" is.
>
> — `~/.claude/projects/-root/memory/feedback_test_backend_not_just_ui.md`, after the 2026-05-02 incident where a popup test passed while Chrome rotated through 4 platforms every 30 seconds, ban-risking real Instagram sessions.
