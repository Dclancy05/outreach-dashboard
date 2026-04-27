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

## Two-VPS architecture (don't confuse them)

| VPS | Hostname | Purpose |
|---|---|---|
| **Production** | `srv1197943.hstgr.cloud` (Tailscale `100.70.3.3`) | OpenClaw, george-gateway, rtrvr-sender, Cookie service, Chrome+CDP, noVNC, n8n, Caddy, Chroma — all the outreach machinery |
| **AI command center** | `srv1378286` | Claude Code (me), MCP servers, Helicone, Langfuse, FalkorDB+Graphiti, persistent memory. Cloned repo lives at `/root/projects/outreach-dashboard` |

If you're working on outreach service code, you're editing files that get deployed to the production VPS via `scp` + `systemctl restart` (see `DEPLOY_VPS_PART_B.md` for the pattern). If you're working on the dashboard, you push to `main` and Vercel auto-deploys.

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

## When you start a session

1. Check `git status` — see what was in flight
2. Read `/memory-hq/sessions/` — last few session summaries
3. Pull memory context: `curl -s "$DASHBOARD_URL/api/memories/inject?max_tokens=4000&format=markdown"` (or use the MCP tool when wired)
4. Confirm with user what they want before changing code
5. When done, log the session: write `/memory-hq/sessions/$(date +%F).md`
