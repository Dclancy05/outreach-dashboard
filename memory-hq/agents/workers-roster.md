# AI Workers Roster

> The fleet of background AI agents serving the Outreach OS. Per Dylan (2026-04-26): "for now, let's just keep things how they are when I make workers." — i.e. Dylan will define and add new workers himself; this roster tracks what exists and proposes a structure for additions.

## Currently live

| Worker | Where | Trigger | Purpose |
|---|---|---|---|
| `automations-maintenance` cron | Vercel | Daily 10:00 UTC | Replays each automation against test target, flips status, partial self-heal |
| `ai-agent/scan` cron | Vercel | Daily 10:30 UTC | Background AI scan after maintenance |
| `cookies-health-check` cron | Vercel | Daily 12:00 UTC | Per-platform cookie freshness, dashboard badge cache |
| `cookie-backup` cron | Vercel | Daily 07:00 UTC | Calls VPS `/cookies/backup` — Supabase storage snapshot |
| `warmup-tick` cron | Vercel | Daily 08:00 UTC | Advances `warmup_day` for sending accounts |
| `retry-queue/process` cron | Vercel | Daily 09:00 UTC | Drains retry queue |
| `deadman-check` cron | Vercel | Daily 11:00 UTC | Watchdog → Telegram |
| `campaign-worker` cron | Vercel | Daily 13:00 UTC (wants per-min) | Drains `send_queue` |
| OpenClaw | Production VPS | Telegram-triggered + scheduled | 24/7 background agent (legacy) |

## Conventions for new workers

When Dylan adds a new worker, file its definition here as:

```markdown
### worker-name
- **Where:** Vercel cron / production VPS systemd / Trigger.dev
- **Trigger:** cron expression or event
- **Model:** Opus 4.7 / Sonnet 4.6 / Haiku 4.5 / Gemini 3.1 / none
- **Inputs:** what data it reads
- **Outputs:** what it writes/sends
- **Failure mode:** what happens if it errors, who gets paged
- **Prompt:** link to `/memory-hq/agents/prompts/worker-name.md` (one prompt file per AI worker)
```

## Future worker ideas (from SYSTEM.md §11+)

These are described in SYSTEM.md as "NOT BUILT" — when Dylan builds them, file them here.

- **Response Detection Poller** — IG/FB/LI/email inbox polling every 15 min during 9-9 EST → mark `responded`, pause sequence, alert Dylan, log text
- **Pipeline Auto-Mover** — response detected → kanban stage change
- **Account Health Monitor** — daily VNC sweep per active account → screenshot + DOM signals → flip status to `needs_reauth` / `challenged` / `suspended` + Telegram
- **Sends-Today Reset** — midnight `UPDATE accounts SET sends_today=0`
- **Janitor** — every 5 min, recover stuck `processing` rows in `send_queue`
- **Daily Task Dispatcher / Campaign Worker (full)** — per-group respects safety_settings, spawns VNC, runs send-DM automation, parks session
- **Stale Session Reaper** — 30-min cleanup of dead VNC/Chrome
- **Metrics Rollup** — nightly aggregation per group + business
- **Self-Heal Vision Layer** — screenshot + LLM coords on automation failure
- **Lead Enrichment** — hourly enrich incoming leads with public signals
- **Proxy Health Check** — every 6h ping each proxy
- **Profile Backup** — IndexedDB + LocalStorage snapshot beyond cookies

## Per-worker prompts

Each AI-powered worker should have its prompt at `/memory-hq/agents/prompts/<worker-name>.md`. That way Dylan can edit prompts in the Memory HQ page without touching code.
