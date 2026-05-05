# SYSTEM.md — The Complete Outreach Operating System

> **Owner:** Dylan Clancy (Current Agency / DC Marketing Co)
> **Version:** Final Product Specification
> **Last updated:** 2026-05-05 (§5 Automations rewritten to match shipped reality after the Phase H ultrathink audit)
> **This document describes the FINISHED product — every feature at full completion, every idea integrated. Not an MVP. The whole thing.**

---

## Table of Contents

1. [What This System Is](#1-what-this-system-is)
2. [Core Principles](#2-core-principles)
3. [Infrastructure](#3-infrastructure)
4. [Page 1: Accounts & Proxies — The Mastermind](#4-accounts--proxies)
5. [Page 2: Automations & Recording — The Tools](#5-automations--recording)
6. [Page 3: Outreach Hub — The Sender](#6-outreach-hub)
7. [The Smart Queue](#7-the-smart-queue)
8. [Sequence Builder](#8-sequence-builder)
9. [Setup Wizard](#9-setup-wizard)
10. [Lead Scraper & Enrichment](#10-lead-scraper--enrichment)
11. [Pipeline & Response Detection](#11-pipeline--response-detection)
12. [Content Engine](#12-content-engine)
13. [Analytics & Revenue](#13-analytics--revenue)
14. [Manual Mode](#14-manual-mode)
15. [Cron Jobs & Self-Healing](#15-cron-jobs--self-healing)
16. [Notifications & Alerts](#16-notifications--alerts)
17. [Settings](#17-settings)
18. [Security & Auth](#18-security--auth)
19. [Free Tools & Lead Magnets](#19-free-tools--lead-magnets)
20. [The 50-Account Content Empire](#20-the-50-account-content-empire)
21. [GoHighLevel Integration](#21-gohighlevel-integration)
22. [Database Schema](#22-database-schema)
23. [API Routes](#23-api-routes)
24. [What's Done vs. What's Left](#24-whats-done-vs-whats-left)

---

## 1. What This System Is

A **fully automated multi-platform outreach machine** that finds local businesses, messages them across Instagram, Facebook, LinkedIn, Email, and SMS, tracks responses, nurtures leads through a pipeline, and closes deals — all from one dashboard.

Dylan opens the app. He sees what's happening. He tweaks what he wants. Everything else runs on its own.

**The business model:** Agency SaaS + done-for-you hybrid. Every angle monetized:
- **Services sold:** websites, review campaigns, DR (reactivation) campaigns, SEO, ads, content creation (done-for-you only), lead gen ("pay only for results"), GHL CRM setup
- **Packages + individual services** — bundled or à la carte
- **Free tools** (website roast, brochure creator, etc.) capture emails → nurture → sell services
- **Content distribution** across 50 accounts × 10 niches drives inbound
- **GHL portal** (portal.dcmarketingco.com) for client delivery

**Target niches (10):** restaurants, barbers, contractors, dentists, gyms, pet groomers, auto shops, nail salons, photographers, retail

**Target geography:** NYC only

**Brand:** Current (not "marketing agency" — more of a collaboration/partnership agency). College student angle is a strength, not a weakness.

---

## 2. Core Principles

These govern EVERY feature, EVERY page, EVERY decision.

### 2.1 Build As One
Every feature works as part of a unified system. Accounts connect to proxies, which connect to campaigns, which connect to sequences, which connect to leads. Nothing exists in a vacuum. The app IS the integration.

### 2.2 Auto Convenience Overhaul
If Dylan has to do something manually that could be automated or embedded, it's not done yet. Minimal clicks, prefilled inputs, smart defaults, no separate tabs/windows. Every time a feature is built, ask: "what would Dylan have to do manually here? How do I eliminate that?"

### 2.3 Fewer, Higher-Impact Pages
Don't create a page for every feature. One great page with smart sections beats five mediocre pages. Each page = a command center for its domain.

### 2.4 Think Smart About Resources
- Storage: controlled galleries with retention policies, auto-cleanup old assets
- Processing: don't run heavy operations unnecessarily, cache smartly, lazy-load
- Screenshots: on-demand, cache 24h, keep only latest, compress, auto-delete old

### 2.5 Unified Views Over Split Sections
Don't separate related concepts. Automations and recordings = one list with status tags, not two grids. Use inline badges (Active/Needs Recording/etc.) on each item.

### 2.6 Clickable CTAs That DO Something
If something needs action (like recording), clicking it should START that action, not just show info. Every button has a verb.

### 2.7 Enterprise-Quality Everything
This will be sold to other people. No 404s, no broken pages, no half-built features. Error handling everywhere. UI must be top-of-the-line.

### 2.8 No Corporate Language
Dylan is a college student. No "leverage," "synergy," "optimize." Write like a real person. 5th-grader language for customer-facing copy.

### 2.9 Document Everything
Running doc tracking how apps are built — for future content (videos, posts, case studies). Every major decision, architecture choice, lesson learned.

### 2.10 Research Before Building
Don't half-ass features. Research what the best version looks like. Build the best version, not the quickest.

---

## 3. Infrastructure

### 3.1 VPS (Hostinger)
- **Host:** srv1197943.hstgr.cloud (Ubuntu 24.04, 2 CPU / 8GB / 100GB)
- **Tailscale IP:** 100.70.3.3
- **Services running:**
  - OpenClaw gateway (port 18789) — AI agent backbone
  - george-gateway (port 3001) — outreach API proxy
  - rtrvr-sender (port 3847) — outreach execution
  - Cookie service (port 3848) — session persistence
  - Chrome automation (CDP port 18800) — browser control
  - noVNC (6080) + x11vnc (5900) — live browser view
  - n8n + Traefik (Docker, port 5678) — workflow automation
  - Caddy (8080, 2019) — reverse proxy
  - Chroma (8500) — vector DB for memory
  - Tailscale serve on 443/8443/8444/10000

### 3.2 Dashboard (Vercel)
- **Live URL:** https://outreach-github.vercel.app
- **Repo:** Dclancy05/outreach-dashboard → GitHub → auto-deploy on push
- **Stack:** Next.js 14, React 18, TypeScript, Radix UI / shadcn
- **Auth:** PIN 122436 (set via ADMIN_PIN env var)

### 3.3 Database (Supabase)
- **~75 tables, 85+ API routes, 40+ frontend pages**
- Connection: stored in env vars (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and managed in `/agency/memory#api-keys`. Never paste the connection string into docs.
- All data is live in Supabase — single source of truth

### 3.4 Proxy
- **IPRoyal residential proxy:** 63.88.217.120 (NYC, Verizon Business, 10001 zip)
- Local proxy chain: 127.0.0.1:18080 → IPRoyal SOCKS5
- ⚠️ NEVER change proxy IP after accounts are logged in — invalidates all sessions
- Bright Data ISP proxies BLOCKED Instagram (compliance/KYC) — don't use for IG

### 3.5 Mac Node (Dylan's Mac)
- Connected 24/7 via launchd service
- Capabilities: browser.proxy, system.run, system.which
- BridgeSpace installed — SSH mount to VPS workspace at ~/Outreach

### 3.6 AI Agent Stack
- **OpenClaw** on VPS — Telegram 24/7, cron jobs, background agents, memory, automation
- **Claude Code** (Opus 4) — interactive coding, big builds, hands-on development via BridgeSpace
- **BridgeMind MCP** — shared knowledge store, project tasks, cross-agent sync
- **Hostinger MCP** — VPS control (118 tools: reboot, snapshot, SSH keys, firewall)

---

## 4. Accounts & Proxies — The Mastermind

**Route:** `/accounts`
**Role:** This page is the BRAIN of the system. Every account, every proxy, every browser session, every warmup — managed here. If this page isn't right, nothing else works.

### 4.1 The Group Model

A **Group** = 1 proxy + 1 persistent Chrome browser on the VPS.

- You drop multiple accounts (IG, FB, LinkedIn, etc.) into the SAME group
- They all share that one browser → looks like a real person on one device
- More groups = more "personas" running in parallel
- One group can be flagged "dummy" — used for recording automations

**Connection types per account (user chooses):**
- **Chrome Direct** — current approach: real Chrome on VPS, CDP automation
- **API Session** — lightweight Python client (instagrapi for IG, linkedin-api for LI). No browser needed. 100 accounts = ~100MB RAM
- **GoLogin Profile** — isolated browser with unique fingerprint. For platforms that need it (FB, TikTok, YouTube)

### 4.2 Proxy Management

**Add Proxy:**
- Provider (IPRoyal, BrightData, custom), IP, port, username, password
- Location (city, state, country)
- Monthly cost tracking
- Protocol: SOCKS5 or HTTP

**Health monitoring:**
- Auto health check cron (ping + IP verification)
- Status badges: Active / Expired / Blocked / Slow
- Speed test results (latency, bandwidth)
- Last checked timestamp

**Rules:**
- 1 static residential IP per account — NEVER change after login
- Same proxy for all accounts in a group
- IP change = session invalidation for all accounts in that group

### 4.3 Account Management

**Add Account:**
- Platform (IG, FB, LI, TikTok, YouTube, Twitter, Email)
- Username, display name, profile URL
- Assign to group (inherits proxy)
- Connection type (Chrome Direct / API Session / GoLogin)

**Per-account data:**
- Status: Active / Warming / Paused / Banned / Cooldown / Pending Setup
- Warmup sequence assignment + current day
- Daily limit (calculated from warmup OR manual override)
- Health score (0-100)
- Last activity timestamp
- Profile screenshot (on-demand, cached 24h)
- Cookie health: Fresh / Stale / Expired
- `sends_today` counter (resets at midnight via cron)
- `last_send_at` timestamp (for safety delay enforcement)
- Branding notes (avatar, bio, etc.)

**Cookie Persistence (the keystone):**
- Login once via embedded noVNC viewer in the dashboard
- Cookies captured automatically via VPS `/cookies/dump` endpoint
- Stored encrypted in Supabase
- Cookie health cron checks freshness daily
- Cookie backup cron archives to Supabase storage
- Re-inject via `/cookies/inject` when Chrome restarts
- "Connected" badge flips live when cookies are captured
- **Goal: log in ONCE, cookies persist forever across reboots**

### 4.4 Warmup Sequences

**Pre-built presets:**
- **Conservative:** Day 1-5 = 5/day, Day 6-10 = 7/day, Day 11-15 = 15/day, Day 16+ = 40/day
- **Standard:** Day 1-3 = 10/day, Day 4-7 = 20/day, Day 8+ = 40/day
- **Aggressive:** Day 1-2 = 15/day, Day 3-5 = 30/day, Day 6+ = 50/day

**Custom warmup builder:**
- Define any ramp: [{day_start, day_end, daily_limit}]
- Assign any warmup to any account
- A/B test different warmup strategies
- Visual progress: "IG_03 is on Day 8 of 'Slow Ramp' — sending 7/day"
- Warmup limits feed into the Smart Queue (warmup cap overrides daily_limit during ramp)
- `warmup_paused` flag — pause warmup without pausing account

### 4.5 Account-Lead Affinity

Once an account messages a lead, that account "owns" the relationship:
- All follow-ups on that platform go through the same account
- Visible in UI: lead card shows "Assigned: IG_03"
- Enforced by Smart Queue: never assigns a lead to a different account on the same platform
- Cross-platform is separate: IG_03 owns IG relationship, LI_01 can own LinkedIn

### 4.6 Quality Control Grid

- On-demand screenshots (not stored forever)
- Generated when user views the QC grid, cached 24h
- Max 1 screenshot per account stored (latest only)
- Thumbnails (200px) for grid view, full-size on click
- Total storage: ~50KB × accounts. 100 accounts = 5MB

### 4.7 The 90-Account Inventory

- 90 accounts bought (~$120 via AccsMarket): 30 IG, 30 FB, 30 LinkedIn
- 3 currently active (IG, FB, LI — one of each, all logged in via NYC proxy)
- 28 still need login
- Plan: 10 more TikTok + 10 YouTube accounts (buying later)
- Total vision: 50 accounts across 5 platforms × 10 niches

---

## 5. Automations & Recording — The Tools

**Route:** `/automations`
**Role:** The library of "how to do stuff." Every DM send, every follow, every connect — is a recorded sequence of browser clicks. No AI on the hot path. Deterministic, cheap, reliable. AI = the mechanic on standby for when something breaks.

**Shipped state (2026-05-05).** The page rebuild landed in PRs #140–#154. Backed by a 16-hour ultrathink audit that found and fixed **28 bugs** (5 critical) across **1,445+ live recording-flow lifecycles** in **14 sweep cycles** at 100% pass rate. Per-bug detail in `AUTOMATIONS_BUGS_FOUND.md`. Sign-off report in `Test Results — Automations Page FINAL 2026-05-05.md`. Plain-English walkthrough in `AUTOMATIONS_PAGE_WALKTHROUGH.md`.

### 5.1 The Recording Model — what shipping looks like

A **Recording** = you walk through an action once (e.g., "send an IG DM"), the system records every click, type, and navigation. Then it replays that exact sequence for every lead.

**Recording flow (live, shipped):**
1. Pick a **dummy group** in the Overview header (the system pre-fills the recommended one — `useDummySelection()` hook handles the data, race-safe with request-id versioning)
2. Click any **platform × action tile** (e.g. "Instagram → Send DM"). 27 combos covered across IG / FB / LI / TikTok / YouTube / X / Reddit / Snapchat / Pinterest. Tiles carry `data-slug` / `data-platform` / `data-action` for deterministic selectors
3. The **Recording Modal** opens with the embedded **noVNC viewer live** — no popup, no separate tab. Cookies for the chosen account get pre-injected into the VPS Chrome session before the URL loads
4. You perform the action manually on the test target. The recording-service captures every click, keystroke, navigation, and verification
5. Click **Stop**. The async pipeline (Phase D) takes over: **analyze → build → self-test**
6. Modal shows live progress per phase (pipeline-status route polled every ~2s with attribution to which step is running)
7. **Self-test passes** → confetti → automation flips to **active** in the catalog
8. **Self-test fails** → Phase E **AI auto-repair** kicks in (agent-repair.ts proposes a new selector, tests it, auto-applies if it works). If repair fails, the modal surfaces the failure card with screenshot + a "Re-record" CTA. Cost + attribution tracked per repair attempt

**What gets saved per recording:**
- Platform + action type (tag: `outreach_action` / `lead_enrichment` / `utility`)
- Step-by-step selector chain (click → type → wait → click → verify)
- 5-layer selector fallback per step (ID → aria → text → CSS → XPath)
- Test target for maintenance validation (Starbucks for IG, Microsoft for LI, etc.)
- `composed_from` lineage if built from the drag-drop composer
- Pipeline state row + repair attempts + cost in cents — backing 4 migrations from 2026-05-05/06

### 5.2 Tabs (shipped)

**Overview tab:**
- 27-tile platform-grouped catalog (IG Send DM, FB Follow, LI Connect + Note, TikTok DM, X Follow, Reddit Comment, etc. — see `src/lib/automations/platform-action-targets.ts` for the full registry)
- Inline status badges: **Active / Needs Recording / Broken / Testing**
- Dummy group selector at the top (smart-default to the recommended group)
- Click any tile → opens the Recording Modal pre-targeted at that platform × action
- Today's stats (runs, successes, failures)
- "Pause All" / "Resume All" master switch
- Per-tab error boundary so one broken tab can't crash the others

**Your Automations tab:**
- Custom recordings you've made
- Import/Export JSON
- Inline rename
- Replay dialog (watch the recording play back step-by-step)
- Per-automation Test button → opens VNC, runs against test targets

**Live View tab:**
- Real-time stream of what's happening on the VPS Chrome
- Embedded noVNC — no iframe-bounce, no popup

**Maintenance tab:**
- Daily cron (`/api/cron/automations-maintenance`, 10 AM UTC) replays each automation against its test target
- Flags broken automations as `needs_rerecording`
- Shows failure logs + screenshots of what the browser saw
- AI healer is **shipped**: agent-repair.ts proposes a selector fix → tests it → auto-applies if it works → flags for re-record if the fix doesn't pass self-test
- Maintenance batch is parallelized with concurrency=4 + `Promise.allSettled` (one Supabase blip can't abort the whole batch)
- 50-id batch cap + LRU ordering keeps it under Vercel's 60s function timeout

### 5.3 Workflow Composer

**Route:** `/automations/selectors`

A drag-and-drop canvas to compose NEW automations from existing steps:
- Left panel = every recorded step across all automations (searchable, filterable by platform)
- Right panel = drag-and-drop canvas
- Reorder steps, combine steps from different recordings
- Save as new automation with `composed_from` lineage tracking
- Example: take "open IG profile" from Recording A + "click Message" from Recording B + "type and send" from Recording C → new combined automation

### 5.4 Self-Healing Pipeline

When a recorded step breaks (Instagram moves a button):

1. **Text matching** — try alternative text selectors (case-insensitive, partial match) ✅ shipped
2. **Vision AI fallback** — screenshot the page, ask AI "where is the Message button?" → get coordinates ✅ shipped (text-only reasoning meanwhile; signed-URL screenshot path deferred — see Bug #25)
3. **Auto-repair** — AI proposes a new selector → tests it → if it works, saves as the new selector ✅ shipped (`agent-repair.ts`, attribution + cost-tracking migrations applied)
4. **Click-track fallback** — if AI can't fix it, system records WHERE you click next time and learns the new path 🟡 partial
5. **Notify Dylan** — if all else fails, sends Telegram alert: "IG Send DM automation is broken, needs re-recording" ✅ shipped via maintenance cron

Vision AI only fires on failures — not every DM. Minimal cost. Cost is tracked per repair attempt in cents (`20260506_repair_cost_tracking.sql`) so we can see the real $ spent on healing per platform.

**Audit reference.** All 5 stages were exercised across 14 sweep cycles + 250+ chaos runs in the 2026-05-05 ultrathink audit. Selector injection in the self-test step (Bug #1, 3 sites) and SQL filter injection in pipeline-status (Bug #5) were both caught and patched in this same pass. See `AUTOMATIONS_AUDIT_SUMMARY.md`.

### 5.5 What's Already Built (CDP Senders)

These are the working action scripts on the VPS:

- **IG DM** (`smart-dm-sender.js`) — navigate to profile → click Message → type char-by-char → verify → send. Tested on @starbucks ✅
- **IG Follow/Unfollow** — tested on @google, @nike ✅
- **FB DM** — Messenger URL approach, tested on 4/4 business pages ✅
- **FB Follow/Unfollow** — tested on Starbucks ✅
- **LI Connect + Note** — shadow DOM piercing via CDP `DOM.performSearch`. 300 char notes. Company pages auto-fall back to Follow. Tested on Satya Nadella ✅
- **LI DM** — NOT WORKING (compose area doesn't render in VPS Chrome). Low priority since Connect + Note handles cold outreach.

---

## 6. Outreach Hub — The Sender

**Route:** `/outreach`
**Role:** The conductor. It ties leads + sequences + accounts + automations together and actually sends messages. This page is "just the sender" — Accounts is the mastermind, Automations are the tools.

### 6.1 Tabs

**Overview / Dashboard tab (NEW — first tab, default view):**
- Today's sends per platform per account
- Cap usage bars (visual: "IG_03: 15/40 today")
- Active cooldowns (which accounts are paused and why)
- Retry log + recent failures
- Cron health (all green? any stale?)
- Account/cookie health
- Upcoming sends in next 1hr / 24hr
- Red alert badges when stuff needs attention ("3 accounts cooling, 1 cookie unhealthy")
- Auto-refresh every 5 seconds
- Plain English for non-technical users — no backend jargon

**Campaigns tab:**
- Create / manage / pause / archive campaigns
- Each campaign = sequence + leads + accounts + safety settings
- Campaign status: Draft / Active / Paused / Complete
- Per-campaign stats (sent, delivered, replied, booked)

**Calendar tab:**
- Account × day matrix showing everything scheduled
- Color coding: green = ok, yellow = at-cap, red = over-cap
- Per-account capacity visible
- Click any cell → see exactly what's queued
- Upcoming 1hr and 24hr views

**Live Feed tab:**
- Real-time stream of sends: sent / failed / skipped / retried
- Filterable by account, platform, campaign
- Click any row → see the full send details + lead info

### 6.2 Campaign Builder (6-Step Wizard)

**Step 1: Select Leads**
- Filter by niche, tags, platform availability, pipeline stage, score tier
- Bulk select or smart list
- Shows lead count + platform breakdown

**Step 2: Select Sequence**
- Pick from sequence library
- Preview all steps + timing
- Shows which platforms the sequence uses

**Step 3: Select Accounts**
- Pick which accounts will send
- Shows capacity per account per day
- **Clash detection:** if an account is already in another active campaign that overlaps dates, BLOCK + clear error: "IG_03 is already committed to 'Pizza Outreach' for March 15-20. Remove it from that campaign first."

**Step 4: Safety Settings**
- Send window (required input): start time, end time, timezone
- Day-of-week filter (optional): Mon-Fri only, skip weekends
- Multiple windows per day (optional): 9-12 then 14-18, lunch gap
- Delay between sends (per-platform defaults, overridable)
- Reply auto-pause toggle (default: ON) — lead replies → freeze that lead across ALL campaigns
- Account health auto-pause (default: ON) — challenge screen → auto-cooldown + notify
- Distribute evenly across send window (not burst)
- Cross-platform same-lead pacing: controlled by wait steps in the Sequence Builder, not hardcoded

**Step 5: Review**
- Full preview: which leads × which accounts × which days × which messages
- Capacity check: any accounts over-committed?
- Clash check: any leads already in overlapping campaigns?
- Estimated completion date

**Step 6: Launch**
- Writes to `campaigns` table + `campaign_schedule` + `send_queue`
- Day 1 rows go into queue immediately
- Day 2+ rows sit in `campaign_schedule` → day-advance cron promotes them
- Live monitoring link

### 6.3 Templates

**Route:** `/templates`
- 47+ active templates across groups: solo_student, group_project, partnership, follow_up, follow_up_cross
- A/B tracking: logs template_id per send, shows response rate per template
- NICHE auto-replace: swaps "NICHE" in template text with lead's business_type
- No dashes in template text. Never say "free." Templates should be vague — just enough to land a call.
- Dylan creates his own templates — system doesn't auto-generate

---

## 7. The Smart Queue

**The brain of the sending system.** This is the algorithm that decides WHAT to send, WHEN, and from WHICH account. No AI involved — pure math + rules.

### 7.1 How It Works

Every 60 seconds, the campaign worker runs. For each account on each platform:

1. ⛔ Skip if `cooldown_until > now` or `warmup_paused`
2. 📊 Calculate effective cap = `min(daily_cap, warmup_ramp[current_day])`
3. ⛔ Skip if `sends_today >= effective_cap`
4. ⏱️ Skip if `(now - last_send_at) < safety.delay_min`
5. 🌙 Skip if outside active hours (account's timezone OR campaign's timezone)
6. ⛔ Skip if outside day-of-week filter
7. ✅ Eligible → score = oldest queued row + least-recently-used account

### 7.2 Cross-Platform Interleaving (Emerges Naturally)

The queue doesn't have a special "interleave" mode. It emerges from the delay rules:
- IG just sent → blocked by 10min platform delay → tick picks FB or LI for same account
- OR picks a different account on IG
- The Sequence Builder's wait steps control cross-platform pacing per lead: "DM IG → wait 4hr → DM FB"
- Some sequences won't have cross-platform waits (fire when cap allows)

### 7.3 Per-Account Daily Caps

- `accounts.sends_today` — incremented on every successful send
- Reset at midnight by nightly cron (`0 0 * * *` EST)
- Cap = `min(manual_daily_limit, warmup_ramp_limit_for_current_day)`
- Each platform on each account has its own cap
- Distribute sends evenly across the send window, not burst

### 7.4 Failure Retry

- 5 retries with exponential backoff (1min, 5min, 15min, 30min, 60min)
- After 5 failures → mark as `dead`, surface in Overview tab
- Stuck `processing` rows recovered by janitor cron (*/5 min): back to `queued`

### 7.5 Reply Auto-Pause

When toggle is ON in campaign safety settings:
- Lead replies on ANY platform → freeze that lead across ALL campaigns
- `lead_reply_pause` table: lead_id PK, paused_at, resumed_at
- Default state: ON (most campaigns should have this)

### 7.6 Account Health Auto-Pause

Trigger signals (any of these):
- Challenge screen on login
- 2FA prompt
- Account restricted screen
- Too many send failures in a window (e.g., 5 fails in 10 min)

Behavior:
- Auto-pause for 24 hours, then auto-resume
- Send notification to Dylan via Telegram + in-app red banner
- All queued sends for that account get rescheduled to other accounts in the campaign

### 7.7 Scheduled Future Sends

`send_queue.scheduled_for` column — rows with a future timestamp sit in queue but are skipped until their time comes. The day-advance cron promotes `campaign_schedule` rows into `send_queue` with the correct `scheduled_for` date.

### 7.8 New DB Columns/Tables Needed

- `lead_reply_pause` (lead_id PK, paused_at, resumed_at)
- `accounts.last_send_at` timestamp
- `campaign_safety_settings.cross_platform_lead_pace_min` (default 5)
- `send_queue.scheduled_for` timestamp
- Nightly cron to reset `accounts.sends_today`
- Janitor cron for stuck `processing` rows

---

## 8. Sequence Builder

**Route:** `/sequences` + `/sequences/[id]`
**Role:** Define the "play" — what messages go out, on which platforms, in what order, with what timing.

### 8.1 Step Types

- **Send DM** — send a message on a platform (IG, FB, LI)
- **Connect** — send a LinkedIn connection request with note
- **Follow** — follow the lead on IG/FB
- **Email** — send via GHL
- **SMS** — send via GHL (last resort, final sequence day only)
- **Wait** — pause for X minutes / hours / days before next step
- **Conditional** — "If lead replied → end sequence. If no reply after 24h → continue to next step"

### 8.2 Wait Steps

- Units: minutes, hours, days (all three)
- Random range for stealth: "wait 4-6 hours" (picks random within range)
- Wait steps are FIRST-CLASS — the queue MUST honor them
- Cross-platform pacing is controlled here: "DM IG → wait 4hr → DM FB" means the queue waits exactly 4hr before scheduling the FB step

### 8.3 Conditional Branches

- "If lead replied → end sequence" (auto-detected via response detection)
- "If no reply after X days → send follow-up"
- "If lead opened email → skip to step 5" (future, needs email tracking)
- Strictly linear for V1, branching for V2

### 8.4 Cross-Platform Sequences

Each step has a `platforms` array. Example 7-day sequence:
- Day 1: IG DM (template group: solo_student)
- Day 3: LI Connect + Note (template group: partnership)
- Day 5: Email (template group: follow_up)
- Day 7: SMS (template group: follow_up, last resort)

### 8.5 Template Integration

Each sequence step links to a template group. When the send fires:
- Pick a random template from the group (for A/B testing)
- Auto-replace "NICHE" with lead's business_type
- Log which template was used for response rate tracking

### 8.6 Variant-Level Platform Targeting

Steps can have variants — different message text for different platforms. Step 1 on IG gets message A, Step 1 on FB gets message B. Tracked separately for A/B.

### 8.7 What's Already Built

- V2 schema: `sequences_v2`, `sequence_steps_v2`, `sequence_step_variants`, `sequence_assignments_v2`, `sequence_tag_assignments`, `sequence_tags`
- 17 default tags (niche + strategy)
- Cross-platform `platforms` array
- Frontend at `/sequences` + `/sequences/[id]`
- **Missing:** Wait steps as first-class, conditional branches, "Launch" execution trigger

---

## 9. Setup Wizard

**Route:** The "Get Started" flow (6-step guided onboarding in sidebar)
**Role:** Take a brand new user from zero to first DM sent. No terminal, no jargon, no confusion.

### 9.1 What It Is Today

A 6-step wizard:
1. Pick a location (proxy)
2. Pick an account
3. Browser opens inside the dashboard
4. You log in by hand (IG / FB / LI)
5. Click "Save my session" — cookies pin to your account
6. "What's next" guide

### 9.2 What It Should Be (Final Vision)

**Step 1: Create Your First Group**
- "A group is like a phone — one IP address, one browser. Your accounts live inside it."
- Pick proxy provider from dropdown (IPRoyal recommended) or enter custom
- System auto-tests proxy connection → green checkmark or red X

**Step 2: Add Your First Account**
- Pick platform (IG/FB/LI buttons — large, visual, obvious)
- Enter username
- Auto-assigns to the group you just made

**Step 3: Log In**
- VPS Chrome opens inside the dashboard (embedded noVNC, NOT a popup)
- Instagram / Facebook / LinkedIn login page pre-loaded
- You type your credentials + handle any 2FA
- System watches for successful login via cookie detection
- When logged in → "Connected ✅" badge flips automatically (no "I'm Logged In" button — auto-detect)

**Step 4: Record Your First Automation**
- "Now let's teach the system how to send a DM."
- Opens the recorder. You send one test DM manually.
- System records every click.
- Self-test runs automatically.
- Pass → "Your automation is ready!"

**Step 5: Import Leads**
- "Who do you want to reach?"
- CSV upload OR run the lead scraper (embedded, not a separate page)
- Preview first 10 leads → confirm

**Step 6: Launch Test Campaign**
- "Let's send 5 test DMs to make sure everything works."
- Pre-configured: 5 leads, 1 account, 1 step sequence, 10min delay
- Launch → watch in live feed → see DMs sent
- Pass → "You're live! 🎉" → routes to Outreach Hub

**Gating:** Each step blocks until the previous is complete. Can't skip. "Fill everything before Next" enforcement.

**Required inputs:** Timezone (mandatory in step 1 — needed for send windows).

---

## 10. Lead Scraper & Enrichment

### 10.1 Google Maps Scraper

**Route:** `/scraper` + `/agency/lead-scraper`

**Flow:**
1. Enter search query: "restaurants in NYC" or "barbers near Brooklyn"
2. Set batch size + filters (minimum reviews, rating, etc.)
3. Launch scrape job → uses proxy (needs separate scraping proxy, NOT the outreach proxy)
4. Results appear in `scraped_leads` table → review → approve → move to `leads` table
5. Deduplication runs automatically on import

**DB:** `scrape_jobs`, `scraped_leads`, `lead_moves`
**8 API routes deployed**

**Missing:** Dylan needs to buy a dedicated scraping proxy. Current outreach proxy should NOT be used for scraping.

### 10.2 Instagram Profile Scraper

Uses `apify/instagram-profile-scraper` (~$0.0023/scrape):
- Pulls followers, bio, category, last post
- Stores in `leads` table
- Manual trigger only (no scheduled scraping yet)

### 10.3 Enrichment Pipeline

**Script:** `rtrvr-sender/enrichment-pipeline.js`

For each lead, fills in missing data:
- **LinkedIn:** Brave Search for "[business name] [city] linkedin owner founder CEO" → finds personal /in/ profiles
- **Facebook:** Searches for FB page URLs
- **Instagram:** Searches for IG profile URLs
- **Website:** Fetches lead's website, extracts emails, phones, social links from HTML

**Rules:**
- Only fills gaps — never overwrites existing data
- Rate limited: 1 request/sec to Brave Search API
- Uses Brave Search only — does NOT touch outreach Chrome accounts
- Batch processing (default 50 leads)

**LinkedIn enrichment is critical:** 993 of 998 LinkedIn leads are COMPANY pages. Need to find decision-maker personal profiles before we can Connect + Note them.

### 10.4 Lead Scoring

Auto-scored A/B/C/D tiers based on data completeness:
- A = has IG + FB + email + phone
- B = has 3/4
- C = has 2/4
- D = has 1/4

**Future (dynamic scoring):**
- Lead responds → +20 points
- Lead ignores full sequence → +0
- Lead books meeting → +40
- Lead becomes client → +100
- Score auto-updates on every interaction

### 10.5 Lead Stats

- 12,028 total leads
- 100% IG, 100% Email, 95% Phone, 78% FB, 30% LI
- Top combo: IG+FB+Email+Phone = 1,570 leads
- 5 sequences needed to cover all platform combos

### 10.6 Future Scrapers (Not Built Yet)

- **Facebook group finder + joiner** — find relevant groups → auto-join → monitor posts
- **Facebook member scraper** — pull members from groups → feed to lead DB
- **Reddit / Social Scout** — scan subreddits for keyword matches → reply (partially built at `/social-scout`)
- **Scheduled scraping** — cron-based: weekly per niche per city

---

## 11. Pipeline & Response Detection

### 11.1 Pipeline / Kanban

**Route:** `/pipeline`

Drag-and-drop kanban board with stages:
- New → Contacted → Responded → Interested → Meeting Booked → Closed Won / Closed Lost

Currently manual drag-and-drop only.

**Final vision — auto-movement:**
- Sequence sent → auto-move to "Contacted"
- Response detected → auto-move to "Responded"
- Sequence complete + no response → auto-move to "Cold"
- Meeting booked (manual trigger or calendar integration) → "Meeting"
- Client signs (manual) → "Closed Won"

### 11.2 Response Detection (NOT BUILT — Critical)

This is the #1 missing feature for closing deals.

**What it needs to do:**
- Poll IG DM inbox via instagrapi → match against `leads` table → mark `responded=true`
- Poll FB Messenger inbox → same
- Poll LinkedIn inbox → same
- Poll email inbox via GHL API → same

**On response detected:**
- Update lead status
- Auto-move in pipeline
- Pause that lead's sequence on ALL platforms (if reply auto-pause is ON)
- Send notification to Dylan (Telegram + in-app)
- Log the response text for review

**Frequency:** Check every 15 minutes during active hours (9AM-9PM EST)

### 11.3 Follow-Up Sequences

Auto-trigger when:
- Lead responds but doesn't book → "Warm Follow-Up" sequence
- Lead goes cold after initial response → "Re-engage" sequence
- Cross-platform escalation: IG ignored → try email → try SMS (last resort)

---

## 12. Content Engine

### 12.1 AI Content Generator

**Route:** `/content-creator`

- Generate posts, captions, messages, pitches via AI
- DB: `content_templates`
- Multiple generation endpoints: `/api/generate-content`, `/api/generate-caption`, `/api/generate-ai-message`, `/api/generate-pitch`

### 12.2 Media / Video Generation

- HeyGen avatar integration (496 credits, 1 credit = 1 sec)
- Runway ML for cinematic video (1000 credits, gen4.5/veo3.1)
- Kling AI for timelapse transitions
- Remotion for composition (CSS/SVG/canvas — NOT real 3D)
- **Dylan wants studio-quality 3D explainer videos** — needs Blender + Mixamo
- MrBeast psychology: hook in 3 sec, fast cuts, dopamine every 5 sec
- 2 draft videos built: pizza shop + barber shop website redesign

### 12.3 Cross-Post Distribution (Late API)

**Route:** `/cross-post`

- Late API key active (free: 20 posts/mo, 2 profiles)
- Covers 15+ platforms: TikTok, IG, FB, LI, YouTube, X, Pinterest, Reddit, Bluesky, Threads, Google Business, Telegram, Snapchat, WhatsApp
- DB: `cross_posts`, `cross_post_results`

### 12.4 Content Calendar

**Route:** `/content-calendar`

- Schedule posts across platforms
- DB: `content_calendar`, `content_post_log`
- Needs deeper integration with Late API for actual posting

### 12.5 Content Personas

**Route:** `/content-personas`

Part of the 50-account × 10-niche content empire. Each persona = a fake but consistent identity posting niche-specific content.

### 12.6 Blog System

**Route:** `/blog`

- Full blog CMS: drafts, SEO score, keyword density, AI image generation, publishing pipeline
- DB: `blog_posts`, `blog_ideas`
- Content research: `/api/content/research`

### 12.7 Web Content / Niche Pages

**Route:** `/web-content`

- Site pages, niche landing pages, pain point targeting
- DB: `site_pages`, `niche_pages`, `niche_pain_points`, `landing_page_variants`, `page_recommendations`

---

## 13. Analytics & Revenue

### 13.1 Analytics Dashboard

**Routes:** `/agency/analytics`, `/dashboard`

Summary stats:
- Sends per day/week/month (by platform, by account)
- Response rates (by template, by sequence, by niche)
- Pipeline conversion rates (contacted → responded → meeting → closed)
- Account health overview
- Cost per lead, cost per meeting, cost per client

### 13.2 Revenue Tracking

**Route:** `/revenue`

- Manual entry for now: link lead → client → payment
- DB: `revenue`, `revenue_streams`, `revenue_transactions`
- **Future:** Auto-link from lead → client → payment → ROI per channel/sequence/template
- Proves what's working

### 13.3 Daily Scorecard

Cron job at 10 PM EST — aggregates day's stats, sends to Dylan via Telegram:
- DMs sent today (by platform)
- Responses received
- Meetings booked
- Pipeline movement
- Account health alerts
- Any failures/issues

---

## 14. Manual Mode

**Route:** `/manual`

Phone-optimized DM queue — for when you want to send messages yourself:
- One lead at a time
- Copy username + message, open the platform, paste, send, come back, mark sent
- Multi-platform tabs (IG / FB / LI)
- Daily limit tracking
- NICHE auto-replace in templates
- A/B template tracking (logs template_id per send)
- Sent history per lead
- Lead Intel panel (IG followers, bio, category, last post from scrape data)
- Search to mark responded
- Keyboard shortcuts: S=send, K=skip, C=copy, R=response
- Session timer + daily goal progress bar
- Quick problem buttons: profile not found, already messaged, business closed
- Shift handoff summary on logout

**What's missing:**
- Currently IG-only in the live version. FB/LI tabs exist in V2 code but need deployment verification.

---

## 15. Cron Jobs & Self-Healing

### 15.1 Active Cron Jobs

| Cron | Schedule | What It Does |
|------|----------|--------------|
| Campaign Worker | Every 60s (or daily on Hobby) | Drains `send_queue`, respects caps/delays/windows |
| Day Advance | Midnight EST | Promotes `campaign_schedule` → `send_queue` for today's sends |
| Sends Reset | Midnight EST | Resets `accounts.sends_today` to 0 |
| Janitor | Every 5 min | Stuck `processing` rows → back to `queued` |
| Cookie Health | Daily 6 AM EST | Checks all account cookies for freshness |
| Cookie Backup | Daily 3 AM EST | Archives cookies to Supabase storage |
| Warmup Tick | Daily 8 AM EST | Advances `warmup_day` for all warming accounts |
| Automations Maintenance | Daily 10 AM UTC | Replays each automation against test targets, flags broken ones |
| Daily Scorecard | 10 PM EST | Sends outreach stats to Dylan via Telegram |
| Auto Email/SMS | 2 PM EST | Sends email/SMS for sequence steps due today via GHL |
| Memory Maintenance | 4 AM EST Sundays | Reviews daily memory files, updates MEMORY.md |
| Security Rotation | 1st & 15th, 2 PM EST | Checks for credential rotation needs |

### 15.2 Self-Healing Pipeline (Automations)

When the maintenance cron detects a broken automation:

1. **Try text matching** — alternative text selectors
2. **Try vision AI** — screenshot + ask "where is the button?" → get coordinates
3. **Try auto-repair** — AI proposes new selector → tests → saves if works
4. **Click-track fallback** — record where user clicks next time, learn new path
5. **Notify** — if all else fails, Telegram alert

### 15.3 Service Recovery (VPS)

All outreach services run as systemd units:
- Cookie endpoint, outreach proxy, queue processor, local proxy, Chrome/Xvfb/x11vnc/noVNC
- `Restart=on-failure` — crashes self-heal
- Survives VPS reboots
- Health endpoints for monitoring

---

## 16. Notifications & Alerts

### 16.1 In-App

- Notification bell on dashboard header
- DB: `notifications` table
- Types: send failure, account health alert, automation broken, response detected, cookie expiring

### 16.2 Telegram (Dylan's Phone)

- Real-time alerts for critical events
- Daily scorecard summary
- Account health warnings
- Automation break notifications

### 16.3 Red Alert Badges

On the Overview tab:
- "3 accounts cooling" → yellow badge
- "1 cookie unhealthy" → red badge
- "2 automations broken" → red badge
- Click badge → jumps to the problem

---

## 17. Settings

**Route:** `/settings`

- **Outreach settings:** default delays, batch pauses, active hours, daily limits
- **Platform defaults:** per-platform delay minimums (IG: 10min, FB: 5min, LI: 15min)
- **Notification preferences:** which alerts go to Telegram vs. in-app only
- **Template management:** default NICHE replacement word
- **API keys:** GHL, Brave Search, Apify, Late API, HeyGen, etc.
- **PIN management:** change admin PIN
- **Business management:** multi-business support for future SaaS

---

## 18. Security & Auth

### 18.1 Dashboard Auth

- PIN login (122436) — simple, phone-friendly
- VA login system (on hold — VA hiring paused)

### 18.2 VPS Security

- UFW firewall: deny all, allow Tailscale + SSH
- SSH: root login disabled for password, key-only
- fail2ban for SSH brute force
- VNC restricted to Tailscale-only access
- File permissions: 600 on sensitive files

### 18.3 Supabase RLS

5 tables still anon-readable (campaigns, send_queue, send_log, retry_queue, businesses) — needs lockdown.

### 18.4 API Key Rotation

- GHL token: rotate regularly
- Security rotation cron checks 1st and 15th

---

## 19. Free Tools & Lead Magnets

**Route:** `current-v2.vercel.app/tools/*`

### 19.1 Website Roast Tool (LIVE)

- URL: current-v2.vercel.app/tools/roast
- Screenshot on left, big score ring on right, color-coded breakdown bars
- "5th grader" language — customer-friendly
- Free tier: 2-3 uses, then gate behind email capture
- Admin bypass for Dylan (no email/payment needed)
- Tested with senanclancyconstruction.com — scored 72/100

### 19.2 Brochure/Flyer Creator (NEXT)

- Freemium: 3 free, then $5-20/mo subscription
- Template-based with AI customization
- Lead magnet → email capture → nurture sequence in GHL

### 19.3 Strategy

Each free tool = lead magnet:
- Free tier: 2-3 uses
- Email gate: "Enter email to get full report"
- Email captured → GHL CRM → nurture sequence → upsell to agency services
- Cross-market between tools and services
- Connect all to GoHighLevel for automated email sequences

---

## 20. The 50-Account Content Empire

Dylan's content distribution plan:

**50 accounts across 5 platforms:**
- 10 Instagram
- 10 Facebook
- 10 LinkedIn
- 10 TikTok (buying)
- 10 YouTube (buying)

**× 10 niches:**
restaurants, barbers, contractors, dentists, gyms, pet groomers, auto shops, nail salons, photographers, retail

**Each account = 1 niche persona** posting niche-specific content:
- @NYCPizzaTips (IG) posts pizza shop marketing content
- @BarberShopGrowth (LI) posts barber business tips
- etc.

**Content flow:**
1. AI generates niche-specific content
2. Content calendar schedules posts
3. Late API distributes to platforms
4. Posts drive inbound leads → captured by free tools or DMs
5. Leads enter the outreach pipeline

**Content personas page** (`/content-personas`) manages all 50 identities.

---

## 21. GoHighLevel Integration

### 21.1 Current Setup

- **Portal:** https://portal.dcmarketingco.com/
- **Location ID:** NmH7aRBeDRq1Wo9qwOqq
- **Company ID:** IveyUvVcHkNEqmU6s8Y2
- **Token:** pit-a779c378-1685-4463-8738-b5eae8a3eade (sub-account level, ALL scopes)
- **Email:** dylanclancy@dcmarketingco.com
- **Phone:** +18458253659 (NOT for outreach)

### 21.2 What GHL Does

- **Email outreach** — cron job sends emails via GHL API
- **SMS outreach** — same cron, SMS confirmed working
- **CRM** — lead management, pipeline, contacts
- **Email sequences** — nurture leads captured by free tools
- **Client delivery** — portal for clients to see their campaigns

### 21.3 Rules

- PIT tokens MUST be created from inside the sub-account (not agency level)
- Email verification NOT available via API — must use GHL dashboard UI
- Dylan has 917 and 201 phone numbers for outreach (not the 845 number)

---

## 22. Database Schema (Key Tables)

### Core Outreach
- `leads` — 12,028 leads with platform links, scores, pipeline stage
- `send_queue` — queued sends awaiting execution
- `send_log` — completed send records
- `campaigns` — campaign definitions
- `campaign_schedule` — future day sends waiting for promotion
- `campaign_safety_settings` — per-campaign delay/window/pause rules
- `manual_sends` — manual mode send records

### Accounts & Proxies
- `proxy_groups` — proxy definitions with Chrome profile IDs
- `outreach_accounts` / `accounts` — account definitions
- `account_schedule` — daily capacity tracking
- `warmup_sequences` — warmup ramp definitions
- `automation_status` — per-account automation health

### Sequences & Templates
- `sequences_v2` — sequence definitions with cross-platform support
- `sequence_steps_v2` — individual steps
- `sequence_step_variants` — platform-specific variants
- `message_templates` — 47+ templates with A/B tracking
- `outreach_templates` — additional template storage
- `opener_templates` — opener-specific templates

### Content
- `content_calendar`, `content_post_log` — scheduling
- `content_personas` — 50-account persona definitions
- `content_templates` — AI generation templates
- `blog_posts`, `blog_ideas` — blog CMS
- `cross_posts`, `cross_post_results` — Late API distribution
- `video_generations` — video production tracking

### Intelligence
- `lead_activity` — interaction log
- `lead_responses` / `responses` — response records
- `notifications` — in-app notifications
- `activity_log` / `activity` — general activity
- `revenue`, `revenue_streams`, `revenue_transactions` — money tracking

### Scraping
- `scrape_jobs`, `scraped_leads`, `lead_moves` — scraper pipeline
- `scout_accounts`, `scout_campaigns`, `scout_matches`, `scout_replies` — Social Scout

### Infrastructure
- `recordings` — automation recordings
- `autobot_automations`, `autobot_runs` — legacy (dead, can drop)
- `chrome_profiles`, `playwright_profiles` — browser profiles
- `va_sessions`, `va_queue_state`, `va_send_log`, `va_tasks` — VA system (on hold)

**Total: ~75 tables**

---

## 23. API Routes (85+)

### Outreach
- `/api/automation/send` — trigger sends
- `/api/outreach/campaign-launch` — launch campaign
- `/api/outreach/send-email` — email via GHL
- `/api/campaigns/*` — CRUD
- `/api/outreach-tools` — settings

### Accounts
- `/api/proxy-groups` — CRUD
- `/api/account-schedule` — capacity tracking
- `/api/warmup` — warmup management
- `/api/gologin/*` — GoLogin integration

### Leads
- `/api/leads/*` — CRUD, import, score, filter
- `/api/enrichment/*` — enrichment pipeline
- `/api/duplicates` — dedup
- `/api/lead-scoring` — scoring engine

### Content
- `/api/generate-*` — AI content generation (content, caption, message, pitch, video, media)
- `/api/cross-post/*` — Late API distribution
- `/api/blog-posts` — blog CMS
- `/api/calendar/outreach` — calendar

### Scraping
- `/api/scraper/*` — 8 routes for jobs, leads, ingest, move, export, stats
- `/api/scrape-profiles` — IG scraper
- `/api/social-scout/*` — 5 routes

### Recordings
- `/api/recordings/*` — 7 routes: CRUD, start, stop, health, migrate, stats

### Infrastructure
- `/api/auth/verify-pin` — auth
- `/api/notifications` — in-app alerts
- `/api/cron/*` — cron job endpoints
- `/api/analytics`, `/api/dashboard`, `/api/revenue` — tracking

---

## 24. What's Done vs. What's Left

### ✅ DONE (Shipped & Working)

- Dashboard with PIN auth
- Accounts & Proxies page (CRUD, warmup, health badges, cookie capture)
- Proxy groups with Chrome profiles
- noVNC viewer embedded in dashboard
- Cookie persistence chain (capture → store → health check → backup)
- VPS cookie dump endpoint (port 3848) — 122 cookies in jar
- Automations page (4 tabs, recording flow, catalog tiles, maintenance cron)
- Workflow composer at /automations/selectors
- CDP senders: IG DM, IG Follow, FB DM, FB Follow, LI Connect + Note
- Queue processor on VPS
- Outreach Hub (5-step wizard, campaign launch, safety settings, live feed)
- Campaign worker (daily caps, cooldowns, retry)
- Sequence builder V2 (cross-platform, variants, tags)
- Template system (47+ templates, A/B tracking, NICHE replace)
- Manual Mode (phone-optimized, multi-platform tabs)
- Pipeline kanban (drag-and-drop)
- Lead scraper frontend + 8 API routes
- Enrichment pipeline (Brave Search)
- Lead scoring (static A/B/C/D)
- Daily scorecard cron → Telegram
- Auto email/SMS cron → GHL
- Blog CMS
- Cross-post via Late API
- Content calendar
- Revenue tracking (manual)
- Notification system
- VPS security hardening (UFW, SSH, fail2ban)
- BridgeMind MCP wired
- Hostinger MCP wired
- BridgeSpace mount on Dylan's Mac

### 🚧 HALF-DONE (Code Exists, Needs Finishing)

- Campaign worker: runs daily (Hobby tier), needs per-minute on Pro or VPS-side worker
- Cookie inject endpoint (`/cookies/inject`) — exists but 404
- `sends_today` counter increments but never resets (no midnight cron)
- Safety settings: worker reads them but doesn't actually enforce delay
- Calendar: exists but no per-account capacity view
- Campaign wizard: no clash detection across campaigns
- `send_queue.scheduled_for`: column exists, worker doesn't filter on it
- Automations AI healer: scaffolded but stubbed
- Content personas: page exists, not connected to posting pipeline
- GoLogin integration: API routes exist, Pro expired Apr 1
- Social Scout: frontend + scan works, auto-reply unclear
- Dynamic lead scoring: schema ready, no auto-update logic
- LinkedIn enrichment: enrichment pipeline built, needs automation/scheduling
- Account rotation: DB ready, rotation logic missing from sender

### ❌ NOT BUILT (Needs Full Build)

- Response detection (inbox polling for IG/FB/LI/email) — #1 priority
- Reply auto-pause system
- Account health auto-pause + notification
- Day-advance cron (promote campaign_schedule → send_queue)
- Midnight sends_today reset cron
- Janitor cron (stuck processing rows)
- Pipeline auto-movement (response → stage change)
- Follow-up sequences (auto-trigger on response)
- Wait steps as first-class in sequence builder
- Conditional branches in sequences
- Setup wizard (full guided onboarding as described in Section 9)
- Cross-platform interleaving (emerges from Smart Queue, needs queue rewrite)
- Content calendar → Late API auto-posting
- Facebook group finder / joiner / member scraper
- Scheduled scraping (cron-based weekly per niche)
- Self-healing selector pipeline (text match → vision AI → auto-repair → click-track)
- Revenue attribution (auto-link lead → client → payment → ROI)
- RLS lockdown on 5 anon-readable tables
- SystemD units for all outreach services (reboot survival)
- Google Maps scraper activation (needs proxy purchase)

---

*This is the system. Every idea Dylan has ever described, organized into one place. Build it in order: fix the Smart Queue → build Response Detection → wire Pipeline Auto-Movement → everything else follows.*


---

## 25. Agent Workflows — visual multi-agent system

Lives at `/agency/memory#agent-workflows` as a fourth top-level tab on the Memory page, with four subtabs underneath: **Agents · Workflows · Schedules · Runs**.

### Why this exists

Big jobs need agent teams. Examples Dylan named:
- "Write code → run tests → if tests fail, send errors back, fix, re-test, until pass"
- "Research lead → draft DM → wait for me to approve → send"
- "Every night at 2 AM: pull yesterday's metrics → analyze → email me a one-pager"

Most workflow tools (Zapier, n8n classic, Make) are DAG-only and handle loops badly. This one supports cycles, approval gates, and overnight scheduling — and the visual builder is designed for a non-technical owner.

### Architecture

- **Agent files** live in `Jarvis/agent-skills/{slug}.md` (vault). Each is YAML-frontmatter markdown — same format Claude Code uses for subagents — so they auto-rsync to `~/.claude/agents/` on the AI VPS and double as real subagents in terminal sessions. ("Build As One.")
- **Supabase tables**: `agents` (DB index of the .md files), `workflows` (xyflow node/edge graph as one jsonb blob), `schedules` (cron + payload), `workflow_runs` (one row per execution), `workflow_steps` (hierarchical trace).
- **Inngest** runs workflows. Every `step.run()` is a checkpoint, so a crash mid-run resumes from the last completed step. `step.waitForEvent` powers approval gates that pause indefinitely without burning compute. Loops execute as plain JS for-loops inside the function — Inngest persists state per iteration.
- **Agent runner** (`vps-deliverables/agent-runner/`) is a Node service on the AI VPS that Inngest calls per agent step. Reads the agent's .md file, spawns a Claude Code subagent with the system prompt + tools allowlist, streams logs back via SSE, enforces per-step token + wall-clock caps.
- **Vercel cron `/api/cron/workflow-tick`** fires every minute, drains due schedules, fires Inngest events. Vercel cron just queues; Inngest does the actual work asynchronously, sidestepping the 60s function timeout.

### Subtabs

**Agents** — file-tree (left) + editor (right), reusing the existing memory-tree TreeView and FileEditor scoped to `Jarvis/agent-skills/`. Each agent has model (opus/sonnet/haiku), tools allowlist, optional parent agent, optional default persona, max_tokens cap. "Test agent" button fires a one-shot run with streaming output.

**Workflows** — xyflow visual builder. Node types: Trigger · Agent · Orchestrator (a special agent that ROUTES, doesn't work) · Loop (container with child nodes; for_each / while / until) · Router (deterministic if/else) · Approval (pauses for human click) · Output. The Loop node renders as a resizable container with the looped subgraph inside (Sim Studio model — clearer than edge-back hacks).

Toolbar:
- **Save** — autosaves graph jsonb every 2s
- **Dry run with sample data** — executes with mocked LLM responses (no money spent), highlights nodes as they run, shows cost estimate
- **Run now** — real run, switches to the Runs subtab
- **Explain in plain English** — Claude reads the graph and writes a paragraph for non-technical readers. Critical UX feature.
- **Templates** — gallery; ships with three: code test/fix loop, outreach DM with approval, daily report

**Schedules** — table of cron jobs. "+ New schedule" picks a workflow, a friendly cron preset (Daily 2 AM, Weekdays 8 AM, etc.) or custom, timezone, initial payload (JSON). Toggle to enable/disable. The actual scheduler is the every-minute Vercel cron — schedules sit in the table until their `next_fire_at <= now()`.

**Runs** — left pane: live + recent runs (live ones pulse). Right pane on selection: hierarchical step tree (parent_step_id structure, polled every 2s while running) + selected step detail with input/output JSON + live SSE log stream + Pause/Abort buttons. Approval steps render inline with Approve/Reject + note. After completion, every run gets a one-paragraph plain-English summary auto-generated by Claude (the `summarizeRun` Inngest function) — the headline insight on the runs list.

### Cost guards (mandatory at three layers)

1. **Workflow** — `workflows.budget_usd` ($5 default), `max_steps` (50 default), `max_loop_iters` (10 default). Enforced by the Inngest function before each step.
2. **Step** — `agents.max_tokens` (8000 default) + 5-min wall-clock. Enforced by the VPS agent runner.
3. **Global** — `WORKFLOW_DAILY_BUDGET_USD` env ($25 default). Enforced by `/api/cron/workflow-tick` — refuses to queue new runs once today's spend hits the cap.

A guard trip flips the run to `status='budget_exceeded'`, fires a Sentry event, and surfaces an in-app notification. **Cost guards are not opt-out** — Dylan can raise them but can't disable them, by design.

### Key files (for reference)

- Migration: `migrations/20260427_agent_workflows.sql`
- Inngest function: `src/lib/inngest/functions/run-workflow.ts` (the runtime heart of the system — read it first)
- Graph types: `src/lib/workflow/graph.ts`
- Cost guards: `src/lib/workflow/cost-guards.ts`
- Cron: `src/app/api/cron/workflow-tick/route.ts`
- Page: `src/app/(dashboard)/agency/memory/page.tsx` (the 4th tab and subtab routing)
- Plan history: `/root/.claude/plans/okay-so-just-a-polymorphic-stearns.md`
