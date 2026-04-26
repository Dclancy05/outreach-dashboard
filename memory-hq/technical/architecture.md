# Architecture (snapshot — keep current)

> Verify against current code before relying on this. Last fact-checked: 2026-04-26 by Claude Code.

## High-level

```
┌──────────────────────┐    push     ┌───────────────────┐
│  Dclancy05/outreach- │────────────▶│      Vercel       │  ← outreach-github.vercel.app
│      dashboard       │  webhook    │ (Next.js + crons) │     - dashboard UI
└──────────────────────┘             └─────────┬─────────┘     - 85+ API routes
            ▲                                  │                - 8 cron handlers
            │ git ops                          │
            │                                  ▼
┌───────────┴──────────┐             ┌───────────────────┐
│  AI command-center   │             │     Supabase      │  ← yfufocegjhxxffqtkvkr
│  VPS (srv1378286)    │             │  (~75 tables, RLS)│
│  - Claude Code       │             └─────────┬─────────┘
│  - MCP servers       │                       │
│  - Helicone gateway  │                       │ same DB
│  - Langfuse          │                       │
│  - FalkorDB/Graphiti │                       ▼
│  - /memory-hq mirror │             ┌───────────────────┐
└──────────────────────┘    SSH +    │  Production VPS   │
                            Tailscale│ (srv1197943,      │
                                     │  Tailscale        │
                                     │  100.70.3.3)      │
                                     │                   │
                                     │  - OpenClaw       │
                                     │  - george-gateway │
                                     │  - rtrvr-sender   │
                                     │  - Cookie service │
                                     │  - Chrome + CDP   │
                                     │  - noVNC + x11vnc │
                                     │  - n8n + Caddy    │
                                     │  - Chroma vec DB  │
                                     └───────────────────┘
                                              ▲
                                              │ proxied
                                              │
                                     ┌───────────────────┐
                                     │  IPRoyal Proxy    │
                                     │  63.88.217.120    │
                                     │  (NYC residential)│
                                     └───────────────────┘
                                              │
                                              ▼
                                     Instagram / Facebook /
                                     LinkedIn / Email / SMS
```

## Frontend

- Next.js 14 App Router
- Route groups: `src/app/(dashboard)/<page>/page.tsx`
- ~40 dashboard pages
- shadcn/ui + Radix + Tailwind + Framer Motion + Sonner
- SWR for data fetching, server actions where applicable

## Backend

- All API routes under `src/app/api/<group>/<action>/route.ts`
- Server Supabase client uses `SUPABASE_SERVICE_ROLE_KEY` (falls back to anon if absent)
- Cron handlers gate with `Authorization: Bearer ${CRON_SECRET}`

## Data

- Supabase Postgres, ~75 tables
- See `/SYSTEM.md` §22 for the table catalog
- Vector search via Chroma (port 8500 on production VPS) — used for memory/observability
- pgvector available in Supabase if/when we want it

## Browser automation

- Real Chrome on production VPS (port 18800 CDP)
- noVNC viewer (6080) embedded in dashboard for live observability + setup wizard
- Cookies captured via `/cookies/dump` endpoint, stored encrypted in Supabase, re-injected on Chrome restart
- CDP-based recording planned for the Automations page (per `/automations-page-spec.md`)

## AI agents

- **OpenClaw** on production VPS — Telegram-driven 24/7 background agent, runs cron tasks
- **Claude Code** (this session) — interactive coding from the AI VPS
- **AI agent scan** — `/api/ai-agent/scan` cron at 10:30 UTC daily
- **Memory system** — full CRUD + persona + injection at `/agency/memory` and `/api/memories/*` (see `/memory-hq/technical/memory-system.md` once written)

## Deploy paths

- **Dashboard / API / cron:** push to `main` → Vercel auto-deploys
- **Production VPS services:** scp + systemctl restart (per `/DEPLOY_VPS_PART_B.md`)
- **DB migrations:** Supabase dashboard or SQL files in `/supabase/migrations/`

## What lives where (cheatsheet)

| Concern | Lives in |
|---|---|
| Customer-facing UI | Vercel |
| API + cron | Vercel |
| DB | Supabase |
| Browser automation | Production VPS |
| Cookies, sessions | Production VPS + Supabase |
| Long-running outreach loops | Production VPS systemd units |
| AI dev tooling | AI VPS (this one) |
| Persistent memory | Supabase + `/memory-hq/` in repo + Claude local files |
| Errors | Sentry |
| Chat / alerts to Dylan | Telegram bot |
| Email/SMS outreach | GoHighLevel |
