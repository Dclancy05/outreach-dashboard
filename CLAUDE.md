# CLAUDE.md — Briefing for Claude Code (and any AI agent) working on this repo

> If you're an AI agent reading this, **read it fully before doing anything**. It saves an hour of orientation per session.

## What this project is

**Outreach Operating System** — a fully automated multi-platform outreach machine for **DC Marketing Co** (Dylan Clancy's agency). Targets local NYC businesses across 10 niches via Instagram, Facebook, LinkedIn, Email, and SMS. Tracks responses, nurtures leads, closes deals — from one dashboard.

**Owner:** Dylan Clancy (Dclancy05 on GitHub) — non-technical founder, college student
**Live:** https://outreach-github.vercel.app
**Auth:** PIN `122436` (env: `ADMIN_PIN`)
**The bible:** `./SYSTEM.md` — the definitive product spec. Read it.

## Stack

- Next.js 14 (App Router, Pages mostly under `src/app/(dashboard)`), React 18, TypeScript, Radix UI / shadcn/ui, Tailwind, Framer Motion, Sonner toasts
- **DB:** Supabase Postgres (~75 tables) — project ref `yfufocegjhxxffqtkvkr`
- **Errors:** Sentry (`@sentry/nextjs`)
- **Browser automation:** Playwright + Chrome DevTools Protocol on production VPS
- **Cron:** Vercel cron (8 jobs in `vercel.json`)
- Notable libs: googleapis, imapflow (IMAP), apify-client, otplib (2FA), @xyflow/react (flow editor), grapesjs (page builder), @novnc/novnc (embedded VNC)

## Single-VPS architecture (consolidated 2026-04-27)

Everything runs on **`srv1197943.hstgr.cloud`** — public IP `93.127.215.29`, Tailscale `100.70.3.3`, hostname `srv1197943` (4 CPU / 16 GB / 193 GB).

What's on it:
- **Outreach machinery:** OpenClaw, george-gateway, rtrvr-sender (recording-service), Cookie service, Chrome+CDP, noVNC, x11vnc, n8n + Traefik, Caddy.
- **AI / memory:** Claude Code, MCP servers, Memory Vault file-server (`memory-vault-api` + syncer at `/root/services/memory-vault-{api,syncer}`), `/root/memory-vault` markdown tree, Graphiti MCP + FalkorDB-KG + Ollama, agent-runner source.
- **Cloned dashboard repo:** `/root/projects/outreach-dashboard`.

The previous AI sidecar `srv1378286` (Tailscale `outreach-vps-2`) was decommissioned 2026-04-27 — services stopped, data preserved as a snapshot tarball at `/root/services/backups/langfuse-snapshot-YYYYMMDD.tar.gz` on the keeper.

**Tailscale Funnel layout** (`srv1197943.taild42583.ts.net`, all three slots used):
- `:8443/` → openclaw-gateway (`localhost:18789`)
- `:8443/vault` → memory-vault-api (`localhost:8788`) — the file-server `/agency/memory` reads
- `:10000/` → recording-service (`localhost:3848`)

If you're working on outreach service code, you're editing files that get deployed to this VPS via `scp` + `systemctl restart` (see `DEPLOY_VPS_PART_B.md`). If you're working on the dashboard, you push to `main` and Vercel auto-deploys.

## Existing AI surface (don't rebuild)

- `/agency/memory` page — full memory + persona UI (memory-editor, version-history, voice-button, token-meter, persona-card, remember-palette, settings-panel)
- `/api/memories` — CRUD + pin/archive/reorder/duplicate/bulk_archive
- `/api/memories/inject?persona_id=X&business_id=Y&max_tokens=2000&q=Z` — returns markdown context, token-budgeted, persona-chained
- `/api/memories/suggest`, `/api/memories/health-scan`, `/api/memories/import|export`, `/api/memories/[id]/versions`
- `/api/memory-settings` — token_budget, mcp_enabled, mcp_api_key, local_sync, auto_suggest
- `/api/personas` — full persona CRUD with parent inheritance
- `/api/observability/vnc` — observability scaffolding
- `/api/ai-agent/scan` — daily AI scan cron at 10:30 UTC
- `/agency/memory#agent-workflows` — visual multi-agent system (Agents · Workflows · Schedules · Runs subtabs). Agent .md files in `Jarvis/agent-skills/` auto-sync to `~/.claude/agents/` so they double as Claude Code subagents in terminal sessions. Inngest powers durable execution (loops, approval gates, crash-resume). Spec: `SYSTEM.md §25`. Plan: `/root/.claude/plans/okay-so-just-a-polymorphic-stearns.md`.
- `/api/agents`, `/api/workflows`, `/api/schedules`, `/api/runs/*` — full CRUD + run control + SSE step logs
- `/api/cron/workflow-tick` — every-minute scheduler tick (drains schedules into Inngest)
- `/api/inngest` — Inngest function endpoint hosting `runWorkflow` and `summarizeRun`

**Memory types:** `user` / `feedback` / `project` / `reference` (same as Claude Code's auto-memory).

When the user asks for "context" or "memory" of past conversations, **use these endpoints, not a new system**. The custom MCP server at `/root/projects/outreach-dashboard/.../memory-mcp/` (when built) bridges Claude Code → these endpoints.

## Multi-terminal protocol

The `/agency/memory?mode=terminals` workspace runs up to 8 parallel Claude Code sessions on the VPS. They're not isolated — they're **siblings** that can see and coordinate with each other, all reading from the same dashboard repo.

**Sibling files** — every running terminal `<id>` has two coordination surfaces:
- `/dev/shm/terminal-siblings/<id>.md` — live status snippet, refreshed every ~30s by the siblings watcher (id, branch, "doing right now", last activity).
- `<worktree>/.claude/CLAUDE.md` — injected at spawn time. Tells the new session who it is, who its peers are, what cost cap it has, and how to reach Dylan.

**Telegram notify primitive** — to ping Dylan from a session, write a short markdown body to `/dev/shm/notify-out/<id>.md`. The dispatcher picks it up on its next tick. Reserve it for blockers, approval requests, cost-cap warnings, or "I'm done" — every message vibrates Dylan's phone.

**Coordination etiquette** — before any significant edit, glance at `/dev/shm/terminal-siblings/`. If a sibling is already touching the same files, drop a coordination note in `/dev/shm/sibling-handoff/<their-id>.md` rather than overwriting their work. Worktrees are isolated branches but the underlying repo and DB schema are shared.

**Lifecycle states** (`terminal_sessions.lifecycle_state`): `starting` → `running` → `awaiting-input` | `paused` | `errored` | `done`. The cost-cap guard hard-stops via Ctrl-C twice when `cost_usd >= cost_cap_usd`. Wallclock cap behaves the same. Both default to $5 / 24h. Self-throttle by reading `cost_usd` and `cost_cap_usd` off your row.

See `Jarvis/agent-skills/terminals-bulletproof-test.md` for the daily test plan.

## Cron jobs (live in `vercel.json`)

```
0 7  * * *   /api/cron/cookie-backup           # cookies → Supabase storage
0 8  * * *   /api/cron/warmup-tick             # advance warmup_day per account
0 9  * * *   /api/retry-queue/process          # drain retry queue
0 10 * * *   /api/cron/automations-maintenance # replay all automations vs test targets, self-heal
30 10 * * *  /api/ai-agent/scan                # AI agent daily scan
0 11 * * *   /api/cron/deadman-check           # watchdog → Telegram alert
0 12 * * *   /api/cron/cookies-health-check    # per-platform cookie freshness
0 13 * * *   /api/cron/campaign-worker         # drain send_queue (currently daily on Hobby — wants per-min)
```

Per `cron-jobs-todo.md`, **NOT YET BUILT:** account health monitor, sends_today midnight reset, response poller, session warm-up/down, proxy health, stale session reaper, metrics rollup, follow-up sequences, day-advance cron, janitor cron.

## Repo conventions

- App Router with route groups: `src/app/(dashboard)/<page>/page.tsx`
- API routes: `src/app/api/<group>/<action>/route.ts`
- Server-side Supabase client uses `SUPABASE_SERVICE_ROLE_KEY`; falls back to anon key if absent
- Shared API helpers in `src/lib/api/*.ts`
- UI components: `src/components/ui` (shadcn), `src/components/<feature>/*` per feature
- Cron handlers gate with `Bearer ${CRON_SECRET}`
- All env keys documented in `.env.example`

## Core principles (from SYSTEM.md §2 — these govern EVERY decision)

1. **Build As One** — every feature plugs into the unified system. No vacuums.
2. **Auto Convenience Overhaul** — if Dylan has to do it manually and it could be automated, it's not done yet.
3. **Fewer, Higher-Impact Pages** — one great page beats five mediocre ones.
4. **Think Smart About Resources** — caching, lazy-load, retention policies.
5. **Unified Views Over Split Sections** — inline status badges, not separate grids.
6. **Clickable CTAs That DO Something** — every button has a verb.
7. **Enterprise-Quality Everything** — no 404s, no half-built features. Sold to other people.
8. **No Corporate Language** — Dylan is a college student. Write like a real person, 5th-grader friendly.
9. **Document Everything** — running doc tracking decisions for content/posts later.
10. **Research Before Building** — build the BEST version, not the quickest.

## Current priorities (from SYSTEM.md §24)

1. **Response detection** (#1 missing feature — IG/FB/LI/email inbox polling) — without it, deals don't close
2. Reply auto-pause + account health auto-pause
3. Wait-as-first-class in sequence builder + conditional branches
4. Day-advance cron + midnight reset cron + janitor cron
5. Self-healing selector pipeline (text → vision AI → auto-repair → click-track)
6. Pipeline auto-movement on response
7. Setup wizard (full guided onboarding per §9)

## Ban-risk policy (READ THIS)

This system messages real social media accounts at scale. Meta and TikTok actively detect and ban automation. The system mitigates with: residential proxies, cookie persistence, warmup ramps, daily caps, send delays, send windows, account-lead affinity, reply auto-pause, account health auto-pause. **Don't bypass these.** Don't suggest "send faster" or "skip warmup." Per principle 2.10, build the BEST version — and the best version doesn't get banned.

### Chrome navigation is a regulated resource

Any endpoint that drives the VPS Chrome — `/api/platforms/goto`, `/api/platforms/login-status?refresh=1`, anything that calls the VPS's `/login-status*`, `/goto`, `/start`, `/replay` — counts. Rules:

1. **Every Chrome-driving endpoint is rate-limited.** Use `rateLimitDb` from `src/lib/rate-limit.ts`. Default `goto`-style: 5 per 30s per admin. Default cache-busting refresh: 1 per 60s per admin.
2. **Never poll a Chrome-driving endpoint on a tight timer.** Default cadence for any background `setInterval` that touches `/api/platforms/*` or `/api/recordings/*` is **5+ minutes**. Tighter requires explicit user approval.
3. **`/api/recordings/health` is infra-only.** It used to also pull `/login-status`, which silently rotated Chrome through every platform every cache-miss. That's been removed. Do not re-add it. Login state is queried explicitly via `/api/platforms/login-status` (user-initiated only).
4. **Tests must verify backend behavior.** A passing UI test is not enough. Every PR that touches Chrome-driving code must (a) count `/goto` calls during a 60s idle window — must be zero, (b) run `popup-e2e-runner.mjs` with the rotation assertions, (c) not introduce new `setInterval`s on `/api/platforms/*` or `/api/recordings/*` without rate-limit + audit-log integration.
5. **The audit log catches everything.** All non-GET API routes wrap `withAudit()` from `src/lib/audit.ts`, so `audit_log` already records every Chrome navigation. Use `/api/observability/chrome-goto` (when added) to read it back from a UI or test.

The 2026-05-02 incident — silent Chrome rotation through IG/FB/LI/TikTok every 30s for weeks because `system-pulse.tsx` polled `/api/recordings/health` and that endpoint pulled `/login-status` — is the canonical example of why these rules exist.

## When you start a session

1. Check `git status` — see what was in flight
2. Read `/memory-hq/sessions/` — last few session summaries
3. Pull memory context: `curl -s "$DASHBOARD_URL/api/memories/inject?max_tokens=4000&format=markdown"` (or use the MCP tool when wired)
4. Confirm with user what they want before changing code
5. When done, log the session: write `/memory-hq/sessions/$(date +%F).md`

## Proof gate — no more "done" without evidence

Dylan is non-technical. Do not make him remember to ask for deep testing. Every AI session must choose and run the right proof automatically before claiming work is done.

Default rule:
- If you changed UI, run a real browser check and capture console/network errors.
- If you touched Chrome-driving code, run `npm run proof:idle` and the relevant harness scenario.
- If you touched login/account/VNC/recording flows, run the matching `proof:*` script.
- If you touched terminals, verify `/jarvis/terminals` in Chromium and confirm there are no `pageerror` events.
- If you touched agents/workflows/runs, verify `/jarvis/agents`, `/api/jarvis/status`, and at least one workflow/run API path.
- If you cannot run the proof, say exactly why and mark the work as unverified.

Never say "done", "fixed", "working", or "verified" unless you can name the proof:
- command run
- pass/fail result
- screenshot/video/trace/report path when the harness produced one
- remaining risk

Never weaken, skip, delete, or rewrite a failing test just to get green. Fix the app first. Test changes require an explicit reason.

Existing proof commands:
- `npm run proof:idle` — catches silent Chrome navigation / ban-risk regressions.
- `npm run proof:login` — full account login badge-flip flow.
- `npm run proof:popup` — popup login behavior.
- `npm run proof:recording` — automation recording flow.
- `npm run proof:vnc` — observability VNC flow.
