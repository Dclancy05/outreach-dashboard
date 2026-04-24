<!--
  Updated 2026-04-24 by George (Claude) — reconciled this planning file
  against what's actually live in vercel.json + /api/cron/* routes.
  Original file is preserved below in spirit; items have been re-tagged
  with real status and a "Planned but not built" section was split out.
-->

# Cron Jobs — Reality Check (updated 2026-04-24)

This file started as Dylan's pure wishlist. It's now been reconciled against
what's deployed to `outreach-github.vercel.app`. Anything marked LIVE is
actually running on Vercel cron; anything NOT LIVE is still a todo.

Legend:
- LIVE + WORKING — scheduled in `vercel.json` AND the route does real work
- LIVE but STUB — wired but returns 501 / placeholder
- NOT LIVE — still a todo, never got built
- IDEA — flavor note from the old plan; worth keeping but not an action item

---

## Currently live (reality)

Pulled from `vercel.json` on 2026-04-24. All seven entries are scheduled and
the handlers exist at the matching `/api/cron/*` or equivalent paths.

### LIVE + WORKING — `/api/cron/warmup-tick` — daily 08:00 UTC
Advances each active account's `warmup_day` by one if they sent >=1 DM the
prior day. Accounts that didn't send get held back so a downtime day doesn't
fake progress.

### LIVE + WORKING — `/api/retry-queue/process` — daily 09:00 UTC
Drains the retry queue — items that failed the first pass get re-attempted
on schedule.

### LIVE + WORKING — `/api/cron/automations-maintenance` — daily 10:00 UTC
THIS IS Dylan's section 0 from the old plan, and it IS built. For every
automation with `status in ('active','needs_rerecording','fixing')` it:
- inserts an `automation_runs` row (run_type = maintenance)
- POSTs steps to `VPS_URL/replay`
- marks the run `passed` / `failed`
- auto-heals: a previously `needs_rerecording` automation that now passes
  flips back to `active`; an `active` one that fails flips to
  `needs_rerecording` with `last_error` set
- stamps `last_tested_at`

Caveat: the schedule is 10:00 UTC not 6am ET like Dylan originally asked.
If he still wants 6am America/New_York that's a one-line cron change
(`0 10 * * *` -> `0 11 * * *` in winter, `0 10 * * *` in summer — or just
leave it at 10 UTC which is roughly 6am ET during DST).

### LIVE + WORKING — `/api/ai-agent/scan` — daily 10:30 UTC
Background AI scan agent — runs after maintenance so it sees fresh status.

### LIVE + WORKING — `/api/cron/deadman-check` — daily 11:00 UTC
Reads `system_settings.deadman_switch` and Telegram-alerts Dylan if the
watchdog hasn't checked in.

### LIVE + WORKING — `/api/cron/cookies-health-check` — daily 12:00 UTC
Scans every account, re-computes `cookies_health` against per-platform
critical-cookie lists, writes the cached value back so the dashboard badge
stays fast. 24h = stale, 14d = expired.

### LIVE + WORKING — `/api/cron/cookie-backup` — daily 07:00 UTC
Calls `VPS_URL/cookies/backup` so the VPS snapshots profiles to Supabase.

### LIVE but STUB — `/api/automations/maintenance/run`
Manual-trigger button on the Maintenance tab. Returns 501 with a "Coming
soon" message. The cron version above actually works, so this stub only
matters if Dylan wants a one-click "run maintenance now" from the UI.
Trivial to wire — just re-use the cron handler's logic behind the POST.

---

## Planned but not yet built

These are from the original wishlist and have no matching route or cron.

### NOT LIVE — Account Health Monitor (was section 1)
Rolling daily VNC sweep of every active account: home URL, screenshot, DOM
signals (login form, captcha, action-blocked modal, follower-count drift).
Writes to an `account_health_checks` table and flips `accounts.status` to
`needs_reauth` / `challenged` / `suspended` with a Telegram alert.
MVP output: green/yellow/red dot + "last checked" timestamp on the accounts
page. The cookies-health-check cron covers ~30% of this already — it catches
expired cookies but NOT live shadowbans or challenge walls. Still worth
building as a separate job.

### NOT LIVE — Rate-Limit Reset (was section 2)
Daily `UPDATE accounts SET sends_today=0, replies_today=0` at 00:00 UTC (or
per-business timezone). Audit row in `rate_limit_resets`. Should be a
15-minute job — no job currently zeroes these counters.

### NOT LIVE — Daily Task Dispatcher / Campaign Worker (was section 3)
**This is the big one — same gap as the "Campaign Worker Missing" memory note.**
For each group, honour `group.safety_settings` (max sends/day, active hours,
min delay), pull next lead from the send queue, spawn a VNC session, run the
send-DM automation, close out. Park sessions 12h instead of killing when a
group finishes for the day (warm-pool behaviour).
Nothing consumes `send_queue` right now, so queue fills but nothing sends.

### NOT LIVE — Response Poller (was section 4)
Every 5 min during active hours: reuse VNC session per group, poll inbox,
match new messages against `sent_dms`, insert into `responses`, Telegram on
hot-lead matches.

### NOT LIVE — Session Warm-Up / Warm-Down (was section 5)
Hourly: groups with tasks in the next 15 min -> pre-spawn Chrome; groups
that finished quota -> graceful Chrome close, keep profile dir.
Partially overlaps with the live `warmup-tick` cron, but that one is about
account warmup curves, not session warm-pooling — different thing, still a todo.

### NOT LIVE — Proxy Health Check (was section 6)
Every 6h: ping each proxy against a test endpoint, mark dead ones
`status = "failed"`, pause groups using them, alert Dylan.

### NOT LIVE — Stale Session Reaper (was section 8)
Every 30 min: kill Xvfb / x11vnc / chrome PIDs for `vnc_sessions` where
`status='in_use' AND updated_at > 2h ago`. Mark `status='killed'`.

### NOT LIVE — Metrics Rollup (was section 10)
Nightly 04:00 UTC: aggregate sends/replies/response-rate per group and
business so the dashboard can render daily charts without running heavy
aggregations on every page load.

---

## Notes / ideas

### Profile Backup to Supabase (was section 7) — partially covered
The old plan wanted a nightly 03:00 UTC cron that extracts cookies SQLite +
Local Storage + IndexedDB and upserts into `account_sessions.backup_blob`.
The live `cookie-backup` cron at 07:00 UTC already calls `VPS_URL/cookies/backup`
— if that endpoint covers LocalStorage + IndexedDB too, this item is DONE.
If it's only cookies, the richer profile-dir backup is still worth building.
(Action: probe `VPS_URL/cookies/backup` and see what it actually snapshots.)

### IDEA — Lead Enrichment (was section 9)
Hourly job to enrich incoming leads with public signals (follower count,
bio keywords, recent posts) so the sender prioritises who to DM first.
Nice-to-have; not urgent until volume justifies it.

### IDEA — Self-heal layers (from the original section 0)
Dylan's original plan for the maintenance cron listed a self-heal escalation
the live route doesn't fully implement yet:
  1. fallback selectors stored on the step
  2. text / aria / data-testid match
  3. visual-AI match (screenshot -> "find this button" -> click)
  4. last-resort raw screen coords
  5. persist the healed selector as the new primary, tag `auto_fixed`
Right now the cron just marks `needs_rerecording` on failure. Adding even
step 1 (fallback selectors) would be a big reliability win.

### IDEA — Timezone per business
Several of these ("rate-limit reset at 00:00 UTC", "6am ET maintenance")
should really run at midnight / 6am in the business's own timezone, not UTC.
Worth standardising on a `businesses.timezone` column and having each cron
fan out to businesses whose local clock matches.

---

## Activation checklist (when the remaining items get built)
- [ ] Create Vercel cron route at `/api/cron/<name>`
- [ ] Add the path + schedule to `vercel.json` crons array
- [ ] Gate with `Bearer ${CRON_SECRET}` like the existing crons do
- [ ] Test manually via `curl -H "authorization: Bearer $CRON_SECRET" ...`
- [ ] Activate one at a time, watch Vercel logs for 24h
- [ ] Wire failure alerts through Telegram (TELEGRAM_BOT_TOKEN)
