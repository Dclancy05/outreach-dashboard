# Workflow tick (per-minute scheduler)

Vercel Hobby crons are daily-only — too coarse for "fire this workflow at 3am." This systemd timer hits the dashboard's `/api/cron/workflow-tick` endpoint every minute from `srv1197943` instead, giving us minute-level scheduling resolution.

## How it works

```
+---------------------+       +-------------------------+      +----------+
| systemd timer       |       | dashboard endpoint       |      | Inngest  |
| every :00 of a min  | ----> | /api/cron/workflow-tick  | ---> | run      |
| (workflow-tick.sh)  |  HTTP | accepts CRON_SECRET OR   |      | workflow |
|                     |       | WORKFLOW_TICK_VPS_TOKEN  |      |          |
+---------------------+       +-------------------------+      +----------+
```

The endpoint:
1. Backfills any schedule with `next_fire_at IS NULL`
2. Selects rows where `enabled=true AND next_fire_at <= now()`
3. For each, inserts a `workflow_runs` row + sends Inngest event
4. Advances `next_fire_at` using cron-parser

## Auth

The token is in the dashboard's `api_keys` table (`env_var=WORKFLOW_TICK_VPS_TOKEN`). The endpoint calls `getSecret("WORKFLOW_TICK_VPS_TOKEN")` and constant-time compares.

The endpoint also still accepts `CRON_SECRET` (the original Vercel-cron auth path), so the daily Vercel cron continues to fire as a backstop.

## Install

```bash
sudo WORKFLOW_TICK_VPS_TOKEN='<token>' bash install.sh
```

Where `<token>` is the value of the `WORKFLOW_TICK_VPS_TOKEN` row in the `api_keys` table.

## Verify

```bash
systemctl list-timers workflow-tick
journalctl -u workflow-tick -n 20 --no-pager
```

Expected output: lines like `[workflow-tick] {"ok":true,"ran_at":"...","fired_count":0,"fired":[]}` once a minute. `fired_count > 0` when a schedule was actually due.
