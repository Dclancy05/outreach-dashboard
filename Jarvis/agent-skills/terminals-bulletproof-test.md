---
name: terminals-bulletproof-test
description: Daily smoke test for the multi-terminal workspace at /agency/memory?mode=terminals. Verifies spawn/kill, typing across reconnects, search overlay, click-to-open file links, mode switching, sibling injection, and the Telegram bridge. Use after every PR that touches src/components/terminals/ or src/app/api/webhooks/telegram/.
cadence: daily
---

# Terminals Bulletproof Test

The Phase-5 polish pass turned the multi-terminal workspace into a daily-use surface. This test plan keeps it that way — same cadence pattern as the other Testing Plans (see `bulletproof-tester.md` for the harness).

## Setup

- **URL:** `https://outreach-github.vercel.app/agency/memory?mode=terminals`
- **Auth:** PIN `122436` (env: `ADMIN_PIN`)
- **Test results dir:** `Jarvis/agent-skills/Test Results/terminals-YYYY-MM-DD-<env>.md`
- **Required services:**
  - VPS `terminal-server` healthy on `srv1197943.taild42583.ts.net:8443/terminals`
  - Telegram bot reachable (for T-09)
  - `TERMINAL_RUNNER_URL` + `TERMINAL_RUNNER_TOKEN` set in Vercel env

ID grammar: `T-<NN>`. IDs never get renumbered — retired tests stay listed with status `RETIRED`. Splits get `a` / `b` suffixes.

## Test cases

### T-01 — Spawn a session
**Status:** EXPECTED-PASS
**Steps:**
1. Open the workspace URL. Sign in with PIN.
2. Click "+ New terminal" in the top bar.
3. Watch the sidebar for a new card.

**Success criteria:**
- New session card appears in the sidebar within **10 seconds** of clicking.
- Card shows: green status dot, title (auto-generated), branch (`sess/<id8>`), age `< 30s`.
- The grid auto-focuses the new session (cyan ring on the card).

**Screenshot:** `Test Results/<run>/screenshots/T-01.png`

---

### T-02 — Type 50 chars across one forced reconnect
**Status:** EXPECTED-PASS
**Steps:**
1. Spawn a fresh session (or reuse one from T-01).
2. Click the terminal pane to focus.
3. Type the literal string `aaaaaaaaaaaaaaaaaaaaaaaaa` (25 a's), do NOT press Enter.
4. Open DevTools → Network → right-click the WS row → Block request URL → reload the WS by toggling.
   *Alternative:* in DevTools console run `[...document.querySelectorAll('canvas')]` to confirm xterm; then trigger the watchdog by waiting 50s with focus on another tab.
5. After "Reconnecting…" overlay clears, type 25 more `b`s.
6. Press Enter.

**Success criteria:**
- All 50 characters land in the PTY (verify by reading the visible scrollback or by `tmux capture-pane -p` on the VPS).
- No "lost keystrokes" warnings in DevTools console.
- Sentry fires breadcrumbs `terminal-ws / ws close` and `terminal-ws / ws open` (visible in the Sentry replay if Replay is on).

**Screenshot:** `Test Results/<run>/screenshots/T-02.png`

---

### T-03 — Cmd+F opens search overlay
**Status:** EXPECTED-PASS
**Steps:**
1. In a session with some scrollback, click into the terminal.
2. Press `Cmd+F` (Mac) or `Ctrl+F` (Win/Linux).
3. Type `echo` in the search input.
4. Press `Enter` — verify next match highlighted.
5. Press `Shift+Enter` — verify previous match highlighted.
6. Press `Esc`.

**Success criteria:**
- Search overlay appears top-right of the pane.
- Enter advances to the next match; Shift+Enter to the previous.
- Esc closes the overlay AND clears all decorations.
- Page-level `Cmd+F` is NOT intercepted when xterm doesn't have focus (regression check).

**Screenshot:** `Test Results/<run>/screenshots/T-03.png`

---

### T-04 — Click `path:line:col` in output → opens Code mode
**Status:** EXPECTED-PASS
**Steps:**
1. In any session, run `echo 'src/components/terminals/terminal-pane.tsx:200:5'`.
2. Hover the printed string — it should show as a clickable link.
3. Click the link.

**Success criteria:**
- URL becomes `/agency/memory?mode=code&path=src/components/terminals/terminal-pane.tsx` (or equivalent — line/col may go in hash or query).
- File viewer opens with the file's contents visible.
- Scroll position lands at or near line 200.

**Screenshot:** `Test Results/<run>/screenshots/T-04.png`

---

### T-05 — Spawn 4, switch focus
**Status:** EXPECTED-PASS
**Steps:**
1. In the layout selector, click "2x2".
2. Spawn 4 terminals (T-05-1 through T-05-4).
3. Click each card in turn (T-05-1 → T-05-4 → T-05-2 → T-05-3).
4. In each, type a unique marker: `echo "T-05-<n> alive" > /tmp/T-05-<n>`

**Success criteria:**
- All 4 panes mount without errors.
- Cyan ring follows the focused card.
- All 4 PTYs receive their commands distinctly (verify on VPS: `ls /tmp/T-05-*` returns 4 files, each with the matching contents).

**Screenshot:** `Test Results/<run>/screenshots/T-05.png`

---

### T-06 — Kill session, branch preserved
**Status:** EXPECTED-PASS
**Steps:**
1. Spawn a session; note the branch name from the card subtitle (e.g. `sess/a1b2c3d4`).
2. Click the `×` button on the session card.
3. Wait up to 5 seconds.
4. On VPS: `cd /root/projects/outreach-dashboard && git branch | grep sess/a1b2c3d4`

**Success criteria:**
- Card disappears from the sidebar within 5 seconds.
- A toast confirms "Terminal stopped".
- The branch STILL exists in the repo (transcript preserved on disk for later retrieval).

**Screenshot:** `Test Results/<run>/screenshots/T-06.png`

---

### T-07 — Worktree CLAUDE.md has identity + siblings
**Status:** EXPECTED-PASS
**Steps:**
1. Have at least 2 active sessions running.
2. SSH to the VPS.
3. `cat /root/projects/wt/sess-<id1>/.claude/CLAUDE.md`

**Success criteria:**
- File exists and is non-empty.
- Contains the literal phrase "You are terminal" (identity block).
- Contains a "Siblings:" or equivalent block listing at least one other session id (proof the siblings injection ran).

**Screenshot:** N/A (terminal output capture in test results doc)

---

### T-08 — `git status` does NOT show `.claude/`
**Status:** EXPECTED-PASS
**Steps:**
1. SSH to the VPS.
2. `cd /root/projects/wt/sess-<id> && git status --short`

**Success criteria:**
- Output is either empty or shows only files the user actually modified.
- No `.claude/` entries (must be gitignored at the worktree level — `.git/info/exclude` or worktree-local `.gitignore`).

**Screenshot:** N/A

---

### T-09 — Telegram /status returns formatted markdown
**Status:** EXPECTED-PASS
**Steps:**
1. With at least 1 active session, send `/status` to the Jarvis bot.
2. Wait up to 5 seconds.

**Success criteria:**
- Reply arrives within 5 seconds.
- Message format: header `🖥️ *N terminals* — _showing top M_`, then per-session blocks shaped:
  - `<emoji> <id8> *title* · $cost / $cap`
  - `└ branch · age · lifecycle [· "doing right now"]`
- Lifecycle emoji matches state (🟢 running, ⏸ paused, 💥 errored, ✅ done, 🌀 starting, ❓ awaiting-input).
- Footer line: "Open one with `/focus <nickname-or-id>`".

**Screenshot:** Telegram reply screenshot in test results.

---

### T-10 — Mode-switch hotkeys (g k / g c / g v / g a / g t)
**Status:** EXPECTED-PASS
**Steps:**
1. Open `/agency/memory` (any chip).
2. Press `g` then `k` → Knowledge mode.
3. Press `g` then `c` → Code mode.
4. Press `g` then `v` → Conversations mode.
5. Press `g` then `a` → Agents mode.
6. Press `g` then `t` → Terminals mode.

**Success criteria for each mode:**
- The active filter chip highlights.
- The sidebar swaps content (TreeView ↔ AgentList ↔ SessionList).
- The center pane swaps content (FileEditor ↔ AgentWorkflowsTabs ↔ TerminalsWorkspace).
- The right rail swaps content (Chat ↔ Run history ↔ ActivityFeed).
- URL updates to `?mode=<active>`.

**Screenshot:** One per mode in `Test Results/<run>/screenshots/T-10-<mode>.png`

---

## EXPECTED-FAIL bucket

These map to known gaps — the tester should NOT flag them as regressions:

| ID | Reason |
|----|--------|
| T-PA-XX | Plan-approval modal (Phase 4 #5) — not yet wired in this PR's scope. |
| T-SP-XX | `/spawn <preset>` against a real `spawn_presets` row — table seeded by parallel PR; current run only verifies the fall-through path. |

---

## Cadence

- **DAILY** smoke (5 min, prod): T-01, T-02, T-06, T-09. Scripted via the harness.
- **WEEKLY** regression (20 min, preview): full T-01..T-10.
- **MONTHLY** deep (1 hr): full suite + 24-hour soak (4 sessions running overnight, watch for memory growth, subscription leaks in Sentry, audio changelog arrival).
- **AFTER-INCIDENT**: full suite, attach merged timeline + screenshots to the incident doc.

## How to run

```bash
node scripts/harness/run.mjs --scenario terminals-bulletproof --duration 300
# results → /tmp/harness/terminals-bulletproof-<ts>/
```

The scenario file lives at `scripts/harness/scenarios/terminals-bulletproof.mjs` (out of scope for this PR — placeholder for the next polish round).

## Sentry signals to watch

After every run:
- Zero new fingerprinted errors in `terminal-ws` category.
- Breadcrumbs visible for `ws open`, `ws close`, `reconnect scheduled`, `watchdog force-close` — proves the instrumentation is wired.
- Replay: any T-02 fail should have a session replay showing the dropped keystroke region.

## Result log shape

`Test Results/terminals-YYYY-MM-DD-<env>.md`:

```markdown
# Terminals — YYYY-MM-DD — prod

| ID  | Result | Notes |
|-----|--------|-------|
| T-01 | PASS  | spawn took 4.2s |
| T-02 | PASS  | reconnect at 17:42:03, all 50 chars landed |
...

## Sentry summary
- ws open: 12
- ws close: 11
- reconnect scheduled: 3
- watchdog force-close: 0
- new errors: 0
```
