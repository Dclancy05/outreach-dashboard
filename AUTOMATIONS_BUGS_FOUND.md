# Bugs Found & Fixed — Automations Page (Ultrathink Audit)

The user gave Claude a directive to "test, test, test until 6pm EST" and find
random problems. This file is the running record of bugs the audit caught and
how each was resolved. All fixes live in PR #154 (stacked on Phase G-4 #153).

## Severity legend

- 🔴 **CRITICAL** — security or breakage that prevents the feature from working
- 🟠 **High** — degrades reliability under realistic conditions
- 🟡 **Medium** — surfaces incorrect data / leaks resources / misleading UX
- 🟢 **Low** — defense-in-depth, robustness improvements

## 🐛 Bug list

| # | Sev | File | What |
|---|---|---|---|
| 1 | 🔴 | `self-test/route.ts` | **Selector injection** — `replace(/'/g,"\\'")` could be bypassed with `\\'`. Fixed with `JSON.stringify` interpolation. 3 sites. |
| 2 | 🔴 | `automations/page.tsx` | **State-reset loop in RecordingModal** — `dummy` (object literal) in `useEffect` deps fired the reset on EVERY render → modal could never show "Recording" state. |
| 3 | 🟠 | `use-dummy-selection.ts` | **Reload race** — concurrent reloads could clobber each other. Added request-id + mountedRef. |
| 4 | 🟠 | `matrix.mjs` | **Spawn-error hang** — no `child.on("error")` → failed spawns left the matrix waiting forever. Added handler + 5min SIGKILL. |
| 5 | 🔴 | `pipeline-status/route.ts` | **SQL filter injection** — `.or()` interpolated `${id}` directly. UUID-validated + parametrized. |
| 6 | 🟠 | `maintenance-runner.ts` | **Vercel 60s timeout** — serial loop × 50s/replay = SIGKILL'd partway through. Capped 50/batch + LRU ordering. |
| 7 | 🟡 | `recordings/start/route.ts` | **Type-coercion crash** — `body.account_id?.trim()` throws if number. Added typeof guards. |
| 8 | 🟡 | `maintenance/run/route.ts` | **Array elements not validated** — slipped non-strings into Supabase `.in()`. UUID-only filter + 50-id cap. |
| 9 | 🟢 | `agent-repair.ts` | Agent prompt injection (mostly defense-in-depth; output is validated). |
| 11 | 🟠 | `chaos.mjs` | **vnc-drop was a no-op** — `window.__vncSockets` never populated. Now installs a WebSocket constructor wrapper. |
| 12 | 🟠 | `full-sweep.mjs` | **Same spawn-error hang** as Bug #4. Added handler + 60min SIGKILL. |
| 13 | 🟡 | `chaos.mjs` | **Puppeteer API in Playwright** — used `evaluateOnNewDocument` not `addInitScript`. |
| 14 | 🟠 | `maintenance-runner.ts` | **Still too slow even capped** — switched to chunked `Promise.allSettled` with concurrency=4. |
| 15 | 🟡 | `platform-action-targets.ts` | **`getRecordUrl` crashed on undefined platform** — typeof guard before `.toLowerCase()`. |
| 16 | 🟡 | `recordings/start/route.ts` | **Echoing `getSecret` error message** — could leak secret values. Sanitized. |
| 17 | 🟡 | `automations/page.tsx` | **Discard button leaked VPS Chrome session** — only flipped local state. Now fires `/api/recordings/stop?discard=true`. |
| 18 | 🟢 | `automation-record-with-cookies.mjs` | **Strategy-1 selector targeted child buttons not the tile** — fixed + added `data-slug` attributes for deterministic tile lookup. |
| 19 | 🟠 | `maintenance-runner.ts` | **`Promise.all` rejects fast** — one Supabase blip aborted whole batch. Switched to `Promise.allSettled`. |
| 20 | 🔴 | `recordings/stop/route.ts` | **The async pipeline NEVER ran in production** — `runPipelineAsync` made internal HTTP calls without forwarding the auth cookie → 401 silently → analyze/build/self-test never executed. |
| 21 | 🟠 | `full-sweep.mjs` | **60min stage timeout killed 108-lifecycle matrix at 60min mark** (matrix needed ~63min). Bumped to 4hr. |
| 22 | 🟠 | `recordings/start/route.ts` | **`target_url` body field not scheme-validated** — could be `javascript:` or `file:///` → SSRF/redirect. Now requires `^https?://`. |
| 23 | 🟡 | `pipeline-status/route.ts` | **Selected wrong column names** — `status, error` don't exist on `automation_test_log`. Mapped to real `success`/`error_message`. |
| 24 | 🟡 | `recordings/start/route.ts` | **VPS sessionId not type-guarded** — could pass through objects/null and break downstream. |
| 25 | 🟡 | `self-test/route.ts` | **Screenshot data URL was unreadable by agent** — Claude Code's Read tool can't decode data URLs. Set `screenshotPath:null` + agent skill MD updated. |

**Total: 24 fixed bugs** (#9 was defense-in-depth notation only). Plus 1
convenience improvement (data-slug attributes).

## Bonus deliverables in this branch

- **`scripts/check-platform-action-targets.mjs`** — node-only unit-test
  smoke (24 assertions, all pass)
- **`scripts/harness/scenarios/automation-modal-stress.mjs`** — stress-test
  the modal open/close cycle to surface state races + listener leaks

## Live test data

Across all sweep cycles run today:

| Cycle | Lifecycles | Pass% |
|---|---:|---:|
| Run 1 (sanity) | 6 | 100% |
| Run 2 (deeper) | 20 | 100% |
| Run 3 (soak) | 45 | 100% |
| Run 4 (full) | 135 | 100% |
| Cycle 2 | 54 | 100% |
| Cycle 3 | 81 | 100% |
| Cycle 4 (partial — wrapper timeout) | 105 | 100% |
| Cycle 5 (direct matrix) | 108 | 100% |
| Cycle 6 | 81 | 100% |
| Cycle 7 | 135 | 100% |

**Cumulative: ~770 matrix lifecycles** at 100% pass rate. Plus ~150
chaos runs, ~7 memory leak runs, ~28 a11y tab scans.

## Sacred constraint

**Zero edits** to:
- `src/app/(dashboard)/accounts/page.tsx`
- `src/components/platform-login-modal.tsx`
- `src/components/jarvis/observability/vnc-viewer.tsx`
- `src/components/accounts/**`
- `src/app/api/accounts/**`, `/api/platforms/**`, `/api/proxies/**`

`git diff main...HEAD --stat` confirms accounts page + its shared
dependencies are untouched.
