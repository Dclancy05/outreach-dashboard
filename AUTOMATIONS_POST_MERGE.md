# Automations Page — Post-Merge Setup Guide

Read this once, **before** merging the 7 stacked PRs from the
`automations-finish` work to main. It tells you what to apply, in what
order, and how to verify nothing broke. The whole point of this work
was to finish the recording flow without breaking the accounts/proxies
page — so the verification steps are deliberate.

## What got built

7 stacked PRs (merge in order, top → bottom):

| # | Phase | Title |
|---|---|---|
| #140 | A | `fix(automations): swap broken VNC iframe for working VncViewer` |
| #141 | B | `feat(automations): account routing + cookie pre-load on Record` |
| #142 | C | `feat(automations): recording guides for X/Reddit/Snapchat/Pinterest` |
| #143 | D | `feat(automations): real pipeline progress + Maintenance Run-now + table unify` |
| #144 | E | `feat(automations): AI auto-repair via agent-runner subagent` |
| #145 | F | `feat(automations): tab error boundaries + partial-save + Sentry breadcrumbs` |
| #146 | G | `test(automations): combo-matrix runner + 6-run live validation` |

Each PR's `base` branch is the previous one — when you merge #140, GitHub
will auto-update #141's base and so on. **Do NOT squash-merge** — the
intermediate commits carry the migration order context.

## Step-by-step

### 1. Apply the SQL migrations FIRST (before merging Phase D / E)

Three migrations land across Phases D + E. Apply them to the production
Supabase **before** merging the corresponding PRs so the new code paths
have somewhere to write:

```bash
psql $DATABASE_URL < migrations/20260505_recordings_pipeline_state.sql
psql $DATABASE_URL < migrations/20260505_test_log_automation_id.sql
psql $DATABASE_URL < migrations/20260506_repair_attribution.sql
```

All three are **additive only** — they only add nullable columns / a view.
Rollback paths are documented inline in each `.sql` file.

The code is migration-tolerant: if you merge before applying, nothing
crashes — the new columns just stay NULL and the UI degrades to legacy
behavior. Applying the migrations is what unlocks the real progress bar
and the AI repair attribution badge.

### 2. Verify these env vars are set in Vercel (production env)

```
NEXT_PUBLIC_VNC_WS_BASE       # e.g. wss://srv1197943.taild42583.ts.net/websockify
NEXT_PUBLIC_VNC_PASSWORD      # the noVNC password (default fallback works)
VPS_URL                       # the recording-service URL on the VPS
AGENT_RUNNER_URL              # for Phase E auto-repair (optional — strategy fails fast if missing)
AGENT_RUNNER_TOKEN            # bearer token for agent-runner (optional)
```

Most of these are already set (the accounts page already uses them).
`AGENT_RUNNER_URL` is the only new one — without it, the AI auto-repair
strategy logs `"agent_runner_not_configured"` and falls through cleanly.

### 3. Merge order

Always wait for Vercel preview to go green before clicking Merge:

1. Merge #140 (Phase A — VNC swap). Verify on the production deploy
   that `/automations` opens, the Live View tab connects to VNC, and
   the Record button opens a modal that connects to VNC.
2. Merge #141 (Phase B — cookies). Verify clicking Record on a real
   tile shows the trust bar with account/proxy info, and the Chrome
   session inside VNC navigates to the platform's inbox/profile.
3. Merge #142 (Phase C — guides). Verify clicking Record on X / Reddit /
   Snapchat / Pinterest tiles shows step-by-step guides.
4. Merge #143 (Phase D — progress). Verify the processing bar shows
   real phase names ("Analyzing... → Building... → Testing...") and
   Maintenance "Run maintenance now" returns counts (not 501).
5. Merge #144 (Phase E — auto-repair). No visible UI change unless an
   automation fails self-test; behind the scenes, failures will now
   call the agent-runner.
6. Merge #145 (Phase F — polish). Verify clicking the X mid-recording
   prompts the partial-save confirm dialog.
7. Merge #146 (Phase G — matrix). No production behavior change; just
   ships the test harness.

### 4. Run the full test matrix (after all 7 merge)

```bash
# Quick sanity check (~10 min)
node scripts/harness/matrix.mjs --runs-per-combo 3

# Full sweep — the actual MAJOR MAJOR test pass (~16h wallclock with
# concurrency 4)
node scripts/harness/matrix.mjs --concurrency 4
```

Pass criteria:
- ≥98% per (platform, action) combo
- 0 5xx
- 0 page errors
- ≤2 Chrome tabs created per scenario (no rotation)

Output:
- `<output>/<combo>/<run-N>/timeline.txt` per-run trace
- `<output>/summary.json` machine-readable
- `<output>/Test Results — Automations Page <date>.md` markdown roll-up

## How to verify the accounts page wasn't broken

This is the sacred constraint. After every merge, run:

```bash
npm run proof:popup    # accounts sign-in flow
npm run proof:login    # accounts login probe
```

Both must exit 0 with all assertions passing. If either fails, **revert
the merge** — something in the PR slipped under the constraint and we
need to fix it before continuing.

A pre-merge baseline was captured during the build (Phase A): both
proof scripts pass cleanly against the live URL. That's your reference.

## What's intentionally NOT done

These are deferred to follow-on PRs to keep this work shippable:

- **Enrichment recording guides** (~17 scrape_* slugs) — the
  `scripts/check-guide-coverage.mjs --strict` flag will surface them
  when you're ready.
- **Maintenance "Repaired by AI" badge** — the
  `v_automation_last_repair` view exists; an `/api/automations/[id]/repair-history`
  endpoint + a row in MaintenanceTab will surface it.
- **Per-automation $2 cost cap on agent-repair** — current implementation
  caps each call independently via the 90s timeout.
- **Chaos test scenarios** (`vps-slow`, `vps-500`, `vnc-drop`,
  `network-flap`) — covered by the matrix infrastructure but the
  per-scenario `.mjs` files need to land.
- **Visual regression goldens** — the `visual-diff` instrument exists but
  needs `npm install sharp` (currently warns "sharp not installed" and
  skips).
- **axe-core a11y instrument** — referenced in the plan but not yet
  written. Recommended next.
- **Per-group VNC sessions** — Phase B keeps the shared `"main"` Chrome
  session id. The dashboard sends per-group ids to the VPS but the VPS
  may need to be updated to honor them (the cookie injection still works
  because that's session-id agnostic).

## If something goes wrong

- **VNC won't connect on /automations:** `NEXT_PUBLIC_VNC_WS_BASE` env
  var is wrong. Check it matches the URL the accounts page uses (which
  is working). Hard refresh the browser to bust the env-baked-in bundle.
- **Recording modal opens but Chrome doesn't navigate:** Phase B
  pre-navigation requires `VPS_URL/sessions/:id/goto` to be implemented
  on the VPS. Check the VPS logs; if the endpoint 404s, the user can
  navigate manually inside VNC and recording still works.
- **Cookies not injected:** check the user picked a dummy account on
  the Live View tab. The amber banner in RecordingModal warns when no
  account is picked.
- **Maintenance "Run now" returns 501 still:** PR #143 (Phase D) didn't
  merge. Check the deploy.
- **Real progress bar still fake:** migrations didn't apply. Run them.
- **Agent repair never triggers:** `AGENT_RUNNER_URL` env var not set
  OR the agent-runner service isn't deployed on the VPS. Check
  `/agency/keys` for the URL value.
- **Accounts page broken:** revert the most recent merge. Use
  `git revert <sha>` and push to a hotfix branch. The 7 PRs are
  designed to revert cleanly.

## Files Claude touched (zero accounts-page edits)

```
NEW:
  Jarvis/agent-skills/automation-selector-repair.md
  migrations/20260505_recordings_pipeline_state.sql
  migrations/20260505_test_log_automation_id.sql
  migrations/20260506_repair_attribution.sql
  scripts/check-guide-coverage.mjs
  scripts/harness/matrix.mjs
  scripts/harness/scenarios/automation-record-with-cookies.mjs
  src/app/api/recordings/[id]/pipeline-status/route.ts
  src/components/automations/tab-error-boundary.tsx
  src/lib/automations/agent-repair.ts
  src/lib/automations/maintenance-runner.ts
  src/lib/automations/pipeline-status.ts
  src/lib/automations/platform-action-targets.ts
  src/lib/hooks/use-dummy-selection.ts
  src/lib/vnc/cookie-injection.ts
  AUTOMATIONS_POST_MERGE.md (this file)

MODIFIED:
  src/app/(dashboard)/automations/page.tsx
  src/app/api/automations/maintenance/run/route.ts
  src/app/api/cron/automations-maintenance/route.ts
  src/app/api/recordings/analyze/route.ts
  src/app/api/recordings/build-automation/route.ts
  src/app/api/recordings/self-test/route.ts
  src/app/api/recordings/start/route.ts
  src/app/api/recordings/stop/route.ts
  src/app/api/vnc/inject-cookies/route.ts  ← refactored, external API unchanged

UNTOUCHED (sacred):
  src/app/(dashboard)/accounts/page.tsx
  src/components/platform-login-modal.tsx
  src/components/jarvis/observability/vnc-viewer.tsx
  src/components/accounts/**
  src/app/api/accounts/**
  src/app/api/platforms/**
  src/app/api/proxies/**
```
