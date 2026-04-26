# Session — 2026-04-26 — AI Base Bootstrap

**Operator:** Dylan
**Agent:** Claude Code (Opus 4.7) on AI VPS srv1378286
**Duration:** ~one continuous session
**Mode:** auto / continuous build

## Goal

Set up the "best-of-everything" AI infrastructure on top of the existing Outreach OS — without touching production behavior. AI lives on a separate VPS, talks to Dylan via terminal, has persistent memory, knows the project, and is ready for the AI workers Dylan plans to add later.

## What I built (everything ship-ready unless flagged)

| # | Thing | Where | Status |
|---|---|---|---|
| 1 | Audited the existing app — found `/agency/memory` is already a sophisticated memory system with personas, version history, MCP scaffolding, same 4 types as Claude auto-memory | repo | done |
| 2 | Locked credentials into `/root/.config/social-saas/.env` (chmod 600) with `load-env.sh` auto-source on shell start and `add-key.sh` for safe paste | VPS | done |
| 3 | Wrote `CLAUDE.md` at repo root — full AI briefing (stack, two-VPS split, existing memory system, cron map, principles, ban-risk policy) | repo (PR #11) | done |
| 4 | Built `memory-hq/` tree — vision, technical, decisions, agents, sessions. Bootstrapped with mission, architecture, memory-system, this session, ai-base-stack decision, workers-roster, runbook | repo (PR #11) | done |
| 5 | `.claude/settings.json` — Opus 4.7, allow-list for safe ops, deny-list for destructive + .env reads | repo (PR #11) | done |
| 6 | Installed MCP servers: Vercel (HTTP, needs OAuth), GitHub (stdio with PAT, ✓), Filesystem (✓), **outreach-memory custom** (✓) | global Claude config | done — OAuth pending |
| 7 | Helicone AI Gateway compose at `/root/services/helicone/` — boots when ANTHROPIC_API_KEY arrives | VPS | scaffolded, awaiting key |
| 8 | Langfuse self-hosted (postgres + clickhouse + redis + minio + worker + web) at http://127.0.0.1:3300 | VPS | running, all healthy |
| 9 | FalkorDB Docker (Redis-protocol graph DB) at 127.0.0.1:6379 | VPS | running |
| 10 | Codebase semantic search — deferred until embedding model key | — | pending |
| 11 | VPS hardening: 4 GB swap, UFW (SSH + Tailscale only), fail2ban (sshd jail, 24h ban), unattended-upgrades enabled | VPS | done |
| 12 | This runbook + session summary | `/memory-hq/technical/ai-vps-runbook.md` + here | done |

## Key technical decisions

1. **Two-VPS architecture confirmed:** AI tooling lives on `srv1378286`, production on `srv1197943` (Tailscale-reachable at `100.70.3.3`). Different blast radius.
2. **Don't rebuild memory:** the app already has it. Built a custom Memory MCP server at `/root/services/memory-mcp/` that bridges Claude Code → `/api/memories` + `/api/memories/inject` endpoints. Their middleware already supports an `x-mcp-key` header (line 24 of `src/middleware.ts`), so the path was clean.
3. **Memory HQ as narrative layer:** the markdown tree complements the per-fact DB memory. Files for vision, architecture, decisions, sessions; per-fact items go in the DB.
4. **Helicone deferred:** boots the moment Anthropic key is added. Compose file ready.
5. **Graphiti deferred:** needs an LLM for entity extraction. FalkorDB is up, Graphiti install waits for the same key.

## Pull request

PR #11 — `ai-base/memory-hq-bootstrap`: https://github.com/Dclancy05/outreach-dashboard/pull/11
- Adds CLAUDE.md, memory-hq/, .claude/settings.json
- Zero runtime changes — pure documentation + AI tooling
- Safe to merge

## What Dylan needs to do

See `/memory-hq/technical/ai-vps-runbook.md` "What you need to do (one-time setup left)" — there are 6 items:

1. Add `ANTHROPIC_API_KEY` (unblocks Helicone + Graphiti + future workers)
2. Add `OUTREACH_MEMORY_MCP_KEY` to Vercel env vars (unblocks Memory MCP → live API)
3. Authenticate Vercel MCP via interactive `/mcp`
4. (Optional) Add Supabase service-role key for direct DB path
5. (Optional) Install daily backup cron (script ready, install needs explicit auth)
6. Rotate exposed creds: GitHub PAT, Supabase DB pw, GHL token, admin PIN

## Things I noticed but didn't change

- `SYSTEM.md` contains live credentials in plain text (Supabase pw, GHL token, admin PIN, IPRoyal IP) — flagged for rotation
- `vercel.json` has 8 cron jobs, but per `cron-jobs-todo.md` several priority items aren't built yet (response detection, midnight reset, janitor, account health monitor)
- The deployed `/api/memories*` endpoints return 401 currently — they're behind PIN auth or the MCP key needs to be set in Vercel env

## Next session priorities (suggested)

When Dylan next opens a session, the highest-leverage moves are:
1. Once `ANTHROPIC_API_KEY` is set: boot Helicone, install Graphiti, do a smoke test where I save and recall a memory across sessions
2. Pull the live memory context via the MCP and confirm the round trip works
3. Start tackling the #1 missing feature from SYSTEM.md: **response detection** (IG/FB/LI/email inbox polling) — without it deals don't close
