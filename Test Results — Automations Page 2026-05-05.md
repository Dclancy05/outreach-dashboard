# Test Results — Automations Page (2026-05-05)

Live validation runs against `https://outreach-github.vercel.app` BEFORE
the 12 stacked PRs merge. Once they merge + migrations apply, re-run the
matrix at the full 1,260-lifecycle scale to confirm the new flows
(cookies pre-load, real progress, AI auto-repair) all behave end-to-end.

## Matrix runs

### Run 1 — sanity check (3 combos × 2 runs = 6 lifecycles)

| Combo | Runs | Passed | Failed | Pass % | Avg s/run |
|---|---:|---:|---:|---:|---:|
| ig_dm | 2 | 2 | 0 | 100.0% | 34.6 |
| ig_follow | 2 | 2 | 0 | 100.0% | 34.6 |
| fb_dm | 2 | 2 | 0 | 100.0% | 34.6 |

**Total:** 6/6 passed (100%) in 3.5 min wallclock.

### Run 2 — deeper matrix (5 combos × 4 runs = 20 lifecycles)

| Combo | Runs | Passed | Failed | Pass % | Avg s/run |
|---|---:|---:|---:|---:|---:|
| ig_dm | 4 | 4 | 0 | 100.0% | 34.7 |
| ig_follow | 4 | 4 | 0 | 100.0% | 34.8 |
| fb_dm | 4 | 4 | 0 | 100.0% | 34.5 |
| li_dm | 4 | 4 | 0 | 100.0% | 34.5 |
| tiktok_follow | 4 | 4 | 0 | 100.0% | 34.5 |

**Total:** 20/20 passed (100%) in 11.5 min wallclock.

## Chaos scenarios

### `rate-limit-hit` — validated against live

```
═══ ASSERTIONS ═══
  ✅ no_5xx                   5xx=0
  ✅ no_chrome_rotation       tabs_created=0
  ✅ no_page_errors           page_errors=0

Network: 429=1 (server-side rate limit fired as expected)
```

The other 4 chaos variants (`vnc-drop`, `modal-close-mid-record`,
`network-flap`, `concurrent-recordings`) are wired and ready to run
against the preview after the stack merges.

## Accessibility (axe-core WCAG 2.1 AA)

### `automation-a11y` — validated against live

Detected **1 critical violation** (`button-name` — "Buttons must have
discernible text", 11 nodes). The instrumentation works: it caught a
real issue that exists on the pre-Phase-F live site. Phase F's
`aria-label` additions and tab error boundaries should resolve this.
Re-run after Phase F merges.

```
═══ ASSERTIONS ═══
  ❌ axe.zero_critical_violations     critical=1
  ✅ axe.zero_serious_violations      serious=0
```

## Memory leak

Scenario built (`automation-memory-leak.mjs`), not yet run against the
live site. After the stack merges, run with `--cycles 50` and verify
heap growth stays under 10MB (default budget).

## Accounts-page regression (sacred constraint check)

`proof:popup` — 4/4 assertions pass on the live site:

```
ASSERTIONS
  ✅ no_chrome_rotation               tabs_created=1 navigated=0
  ✅ no_unbounded_goto                goto_calls=0
  ✅ no_5xx                           5xx=0
  ✅ no_page_errors                   page_errors=0
```

Captured before the 12 PRs land. Re-run after each merge — must remain
4/4 ✅. The PR descriptions document this as a per-merge gate.

## Pass criteria summary (per Phase G plan)

- [x] **Live-validation matrix:** ≥98% combo pass rate (got **100% / 26 lifecycles**)
- [x] **Chaos scenarios:** rate-limit-hit validates 3/3 assertions; 4 other variants wired
- [x] **Accounts regression baseline:** `proof:popup` 4/4 ✅
- [ ] **Full matrix (post-merge):** 1,260 lifecycles at concurrency 4 — to be run after #140-#151 merge + migrations apply
- [ ] **Chaos suite full run:** 5 variants × 10 runs each
- [ ] **A11y on Phase F preview:** zero serious/critical (Phase F's aria-label additions should resolve the live `button-name` violation)
- [ ] **Memory leak:** heap growth <10MB / 50 cycles
- [ ] **Sentry-quiet 24h soak:** zero new events tagged `feature: automations`

## Per-run output

All per-run timeline.txt + report.html files at:
- Run 1: `/tmp/matrix-validation/<combo>/run-<n>/`
- Run 2: `/tmp/matrix-deeper/<combo>/run-<n>/`

Machine-readable summary: `Test Results — Automations Page Matrix 2026-05-05.json` (in repo root).
