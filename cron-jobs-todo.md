# Cron Jobs — Build List

Staging file. These cron jobs are **not yet live**. We'll activate them once the full app is built. Each entry is a separate scheduled agent.

---

## 0. Automation Maintenance (Dylan's explicit ask 2026-04-18/19)
**Schedule:** Daily at 6:00 AM Eastern Standard Time (America/New_York) — confirmed by Dylan 2026-04-19
**Purpose:** SECOND layer of self-healing (the 24/7 reactive production heal is the first layer). Daily cron runs every automation against the dummy group even when nothing has visibly failed, as a preventative safety net. Overwrites each automation's stored screenshots with fresh captures on every run — no screenshot history accumulates.
**What it does:**
- For every row in `automations` where `status != 'draft'`:
  1. Spin up VNC session on the designated dummy group
  2. Replay the automation end-to-end against the dummy
  3. If all steps succeed → `status = active`, bump `last_tested_at`
  4. If a step fails → invoke self-heal agent:
     - Try fallback selectors stored in the step
     - Try text/aria/data-testid match
     - Try visual-AI match (screenshot → "find this button" → click)
     - Last resort: click raw screen coords
     - If healed → persist the new primary selector, mark `auto_fixed`
     - If not healed → `status = needs_rerecording`, Telegram-alert Dylan
  5. Write a row to `automation_runs` (run_type = maintenance)
**Dependencies:** dummy group must exist + be logged in on all platforms. Automations page live-view tab selects which dummy account to use.

---

## 1. Account Health Monitor
**Schedule:** Daily, rolling (stagger across 24h so not all fire at once)
**Purpose:** Catch shadowbans, challenges, logged-out accounts before Dylan finds out.
**What it does:**
- For every active account in `accounts` table: spin up a VNC session, navigate to the platform home URL, capture: current URL, screenshot, DOM signals (presence of login form, captcha, "action blocked" modal, follower count discrepancy)
- Write result to new `account_health_checks` table (account_id, checked_at, status, screenshot_url, signals_json)
- If status = "needs_reauth" or "challenged" or "suspended" → update `accounts.status` + alert via Telegram
- If everything's fine → update `accounts.last_health_check_at`
**MVP output:** A green/yellow/red dot on the accounts page + a "last checked" timestamp.

---

## 2. Rate-Limit Reset
**Schedule:** Daily at 00:00 UTC (or configurable per business)
**Purpose:** Reset `sends_today`, `replies_today` counters on accounts + groups so the day starts fresh.
**What it does:**
- `UPDATE accounts SET sends_today = 0, replies_today = 0 WHERE business_id = X`
- Write a row to `rate_limit_resets` for audit

---

## 3. Daily Task Dispatcher
**Schedule:** Every X minutes (tunable — maybe 10min) during active hours per group
**Purpose:** Execute the day's outreach tasks per group following safety settings.
**What it does:**
- For each group: check `group.safety_settings` (max sends per day, active hours, min delay between sends)
- Pull next lead from queue
- Spawn VNC session for group → run send-DM automation → close session
- Respect warm-pool (if group finished for the day, park session 12h not kill)

---

## 4. Response Poller
**Schedule:** Every 5 minutes during active hours
**Purpose:** Check each account's inbox for new replies to our DMs.
**What it does:**
- Spawn/reuse VNC session per group
- Navigate to Instagram/LinkedIn/etc. inbox
- Capture new messages, match against `sent_dms` to link responses
- Insert into `responses` table
- Notify Dylan if response matches "hot lead" criteria

---

## 5. Session Warm-Up / Warm-Down
**Schedule:** Top of each hour
**Purpose:** Pre-warm sessions for groups about to hit their active window; cool down groups done for the day.
**What it does:**
- Query groups with active tasks coming in next 15 min → spin up Chrome so they're ready
- Query groups that completed daily quota → gracefully close Chrome (but keep profile dir)

---

## 6. Proxy Health Check
**Schedule:** Every 6 hours
**Purpose:** Detect dead/blocked proxies before they screw up automations.
**What it does:**
- For each proxy: send a request through it to a test endpoint
- Mark dead proxies `status = "failed"` → pause groups using them → alert Dylan

---

## 7. Profile Backup to Supabase
**Schedule:** Daily at 03:00 UTC
**Purpose:** Snapshot Chrome profile state (cookies, localStorage) to Supabase so we can restore if VPS dies.
**What it does:**
- For each active group's profile dir: extract cookies SQLite + Local Storage folder + IndexedDB → base64 blob
- Upsert into `account_sessions.backup_blob`

---

## 8. Stale Session Reaper
**Schedule:** Every 30 minutes
**Purpose:** Kill zombie VNC sessions that didn't shut down cleanly.
**What it does:**
- Query `vnc_sessions` where `status = "in_use"` and `updated_at > 2 hours ago`
- Kill the processes (Xvfb, x11vnc, chrome) by PID
- Mark `status = "killed"`

---

## 9. Lead Enrichment (optional, later)
**Schedule:** Hourly
**Purpose:** Enrich incoming leads with public signals (follower count, bio keywords, recent posts) so we can prioritize who to DM first.

---

## 10. Metrics Rollup
**Schedule:** Nightly at 04:00 UTC
**Purpose:** Aggregate daily sends/replies/response-rate per group and business for the dashboard.

---

## Activation checklist (when app is ready)
- [ ] Create Supabase functions or Vercel cron routes for each
- [ ] Add to `/schedule` (Claude Code scheduled agents) OR to Vercel `vercel.json` cron
- [ ] Test each one manually first
- [ ] Activate one at a time, monitor for 24h
- [ ] Document failure-alert path (Telegram → Dylan)
