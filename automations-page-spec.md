# Automations Page — Spec

**Status:** spec only, do not build yet. Dylan described this on 2026-04-18.

---

## Layout

Mirrors the accounts & proxies page — 4 sub-tabs:

1. **Overview**
2. **Your Automations**
3. **Live View**
4. **Maintenance**

---

## Tab 1: Overview

TBD — high-level summary of automations (count, active vs broken, recent runs, success rate).

---

## Tab 2: Your Automations

**What exists today is fine as a base.** Needed additions:

- Next to EACH platform row, an "Add {Platform} Automation" button (Instagram, Facebook, LinkedIn, TikTok, YouTube, X, Snapchat, Pinterest)
- Click → modal/flow:
  1. Name the automation (e.g. "Instagram DM")
  2. Write ordered steps in human terms ("navigate to URL", "click this", "type that")
  3. Click Next / Confirm
  4. **Popup opens noVNC of the DUMMY GROUP** with step-instructions panel on the side (same UX pattern as the accounts/proxies setup wizard, but instead of login instructions it shows the recording steps)
  5. Dylan performs the actions in the VNC → recording captures everything
  6. Click Done → automation saved

**Per-automation actions (required):**
- Add
- Delete
- Rename
- Edit (re-record OR edit steps)

**What "recording" must capture for each step:**
- Mouse position (x, y) on screen
- Every selector for every clicked element (CSS selector, XPath, aria-label, data-testid, text content, class list, id) — capture a MASS of redundant info so if one breaks we have fallbacks
- Exact screen pixel coordinates (final fallback — if all selectors break, click the raw coords)
- Screenshot before/after each action (for visual AI fallback)
- DOM snapshot around the clicked element (parent chain, siblings) for context
- URL before/after
- Keyboard input (text typed)
- Timing (how long to wait before next step)
- Platform-specific state (scroll position, open modals, etc.)

**Why so much redundancy:** the AI agent uses all this to self-heal when selectors break. If primary selector fails → try fallback selectors → try finding by text/aria → try visual match → last resort click raw xy coords.

---

## Tab 3: Live View

**Purpose:** always-on embedded noVNC window showing the dummy group, used for recording + maintenance runs.

- Dropdown at top: "Dummy account" selector (shows the accounts in the currently-selected dummy group; pick which one to operate as).
  - Selection persists across page loads/reloads (save to Supabase, tied to user/business).
  - Only changes when Dylan explicitly changes it.
- Below: the live noVNC iframe.
- Bonus controls (proposed — flag for Dylan): "Reset session" button, "Stop" button, status indicator (running / idle).

**Dummy group concept:**
- A regular group in the accounts/proxies page, but marked `is_dummy = true` (new column).
- Fully set up (logged in across all platforms) using our normal setup wizard.
- Used ONLY for (a) recording new automations and (b) the maintenance cron job testing existing automations.
- Expendable — we don't care if it gets flagged/banned. Dylan has a separate set of real groups for actual outreach.

---

## Tab 4: Maintenance

**Purpose:** quality-control dashboard showing the health of every automation.

- Shows every automation with status: `active` / `needs_rerecording` / `fixing` / `broken`
- Last-tested timestamp per automation
- Last-failure reason (if any)
- Button: "Run maintenance now" (manual trigger of the cron)

**Maintenance cron (NEW — added to cron-jobs-todo.md):**
- Runs every day at 6:00 AM (Dylan's timezone — confirm)
- For each automation:
  1. Spin up dummy-group VNC session
  2. Execute the automation end-to-end
  3. If all steps succeed → mark `active`, update `last_tested_at`
  4. If a step fails → invoke the AI self-heal agent:
     - Agent gets the recording data (all selectors + screenshots + coords)
     - Agent tries: fallback selectors → text/aria match → visual match → raw coords
     - If self-heal succeeds → persist the new selector as the primary, mark `auto_fixed`, log the fix
     - If self-heal fails → mark `needs_rerecording`, notify Dylan via Telegram
  5. Close session

---

## Data model (proposed)

**`automations` table:**
- `id` uuid pk
- `business_id` text
- `platform` text (instagram/facebook/…)
- `name` text
- `description` text
- `status` enum (active, fixing, needs_rerecording, broken, draft)
- `version` int (bumped on every re-record or self-heal)
- `steps` jsonb (array of step objects — see below)
- `inputs_schema` jsonb (variables the automation takes, e.g. `{lead_handle, message_body}`)
- `last_tested_at` timestamptz
- `last_error` text
- `created_at`, `updated_at`

**Step object (inside `steps` jsonb):**
```json
{
  "kind": "click | type | navigate | wait | scroll | keypress",
  "description": "human-readable step title",
  "selectors": {
    "css": ".btn-send",
    "xpath": "//button[text()='Send']",
    "aria_label": "Send message",
    "test_id": "dm-send-button",
    "text": "Send",
    "classes": ["btn","btn-primary"],
    "id": "sendBtn",
    "parent_chain": [...]
  },
  "coords": { "x": 420, "y": 860 },
  "screenshot_before": "storage_url",
  "screenshot_after": "storage_url",
  "url_before": "https://instagram.com/direct/t/123",
  "url_after": "https://instagram.com/direct/t/123",
  "text_input": "Hey {lead_handle}, …",
  "wait_ms_after": 1500
}
```

**`automation_runs` table:**
- `id`, `automation_id`, `run_type` (maintenance | production), `account_id`, `status` (ok | self_healed | failed), `failed_step_index`, `error`, `healed_selectors` jsonb, `screenshots` jsonb, `started_at`, `ended_at`

**`automation_dummy_selection`:**
- `business_id`, `group_id`, `account_id`, `updated_at`

---

## Recording tech (implementation notes)

Two options — recommend Option A:

**Option A: CDP-based recorder (preferred)**
- Inject a recorder script into the dummy-group Chrome via CDP (already running, already reachable via our vnc-manager)
- Script listens to: `click`, `input`, `keydown`, `scroll`, `navigation` events
- On each event: capture DOM selector chain, coords, screenshot (via `Page.captureScreenshot`), URL
- Stream events to vnc-manager → Supabase
- No install, no extension — just works with what we already have
- Recorder turns on when user hits "Record", off when user hits "Done"

**Option B: Chrome extension**
- Write a dedicated extension, install it permanently in dummy-group Chrome profile
- Similar event capture via DOM APIs
- Downsides: needs install + maintenance, extension API limits

**Decision:** Option A (CDP recorder). Cleaner + no moving parts.

---

## Production runtime (when automation runs for real outreach, not maintenance)

This is how automations get INVOKED by the outreach engine:
1. Outreach engine picks a task (e.g. "send IG DM to lead X from account A in group G")
2. Looks up the matching automation (e.g. "Instagram DM")
3. Spins up VNC for group G (using account A's profile — same Chrome profile we've been building)
4. Replays the automation steps, substituting variables (`{lead_handle}` → lead.handle)
5. On any step failure → same self-heal path as maintenance
6. On success → log to `automation_runs` + write `sent_dms` entry
7. Close session (or park it per warm-pool logic)

**Open question for Dylan:** does every production run also invoke self-heal? Or should production stay strict (fail fast + alert) and only maintenance invokes the heal flow? → Cheaper compute to keep heal in maintenance only.

---

## Decisions locked in (from Dylan 2026-04-18/19)

1. **Timezone:** Eastern Standard Time (America/New_York). The 6am maintenance cron runs at 6am ET.

2. **Variables:** context-dependent. Any field that'd realistically change per-lead becomes a `{variable}`. Examples:
   - Follow automation → URL is a variable (`{target_profile_url}` or `{target_handle}`)
   - DM automation → URL + message body both variables (`{target_profile_url}`, `{message_body}`)
   - Like-post automation → URL variable only
   - Comment automation → URL + comment text variables
   During recording, the UI auto-detects text-input fields and prompts Dylan "is this a variable or fixed?" for each. Smart defaults: any obviously-templatable field (handles, URLs, messages) pre-checked as variable.

## Decisions locked in (continued — Dylan 2026-04-19)

3. **Self-heal runs at TWO layers (both on):**
   - **24/7 reactive:** if a real production run breaks mid-send, the AI self-heals RIGHT THEN. Non-negotiable — we don't leave real leads unhandled.
   - **6am proactive:** daily cron tests every automation against the dummy even when nothing has failed, as a preventative net.
   - **Blast-radius containment:** the moment a specific automation breaks on a platform (e.g. "Instagram DM"), pause every other run of that SAME automation on that SAME platform until it's healed. Keeps one broken selector from burning through 50 leads. Other automations on other platforms keep running.

4. **Dummy group = SINGLE GLOBAL (not per-business).** One dummy group used by every business's automations for recording + daily testing. Dummy accounts exist solely to absorb the weird repetitive activity and (possibly) get banned — real accounts stay clean.

5. **Recording reuse:** one dummy group handles all automation recordings across all platforms. Swap accounts via the live-view dropdown.

6. **Step editing:** full CRUD on individual steps (insert, delete, reorder, edit single selector) AND full re-record from scratch.

7. **Screenshot storage:** keep only the latest — overwrite on every maintenance/re-record run. Each step has a single current screenshot; daily cron replaces it with the freshest. Storage stays bounded (one screenshot per step, period).

8. **Multi-platform automations:** single-platform per automation (explicitly confirmed).

9. **Workflow builder / step-remixing (DEFERRED):** Dylan wants a future "workflow editor" where you can mix buttons/steps from existing automations (e.g. combine pieces of Follow + Unfollow + DM into a custom workflow). Build it LAST, with its own spec session before any code. Do not touch this until everything else ships + he reviews.

---

## Build order (phased so Dylan can test recording first)

**Phase 1 — what Dylan tests when he returns:**
1. DB migrations: add `is_dummy` to proxy_groups, new `automations` table, new `automation_runs` table
2. Vnc-manager: CDP recorder (start/stop endpoints, inject recorder script, capture events + selectors + coords + screenshots)
3. Frontend: restructure automations page into 4 sub-tabs
4. Frontend: Your Automations → "Add {Platform}" buttons → name + steps modal → dummy-group noVNC popup with recording UI
5. Frontend: Live View tab — dummy group noVNC embed + account dropdown (persisted)
6. Frontend: Maintenance tab — list of automations + status (passive, no cron yet)
7. Deploy, verify Dylan can record an automation end-to-end

**Phase 2 — after Dylan tests:**
8. Replay engine (execute stored steps against a live VNC with variable substitution)
9. 24/7 production self-heal (on real-run failure: AI heals, re-tries, pauses the specific automation's queue on that platform if unrecoverable)
10. 6am maintenance cron job
11. Outreach engine integration (real sends invoke automations with lead/account variables)

**Phase 3 — separate spec session, build LAST:**
12. Workflow builder (chain steps from multiple automations into custom workflows)
