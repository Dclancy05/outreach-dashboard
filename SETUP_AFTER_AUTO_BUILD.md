# 🌅 Welcome back — here's what landed overnight

> Built autonomously by Claude on 2026-05-02 night. Plan + audit trail at `/root/.claude/plans/jarvis-space-upgrade.md` + `/root/.claude/projects/-root/memory/jarvis-build/`.

## 🚀 What's live in production right now

Open these URLs to see the new work. PIN: `122436`.

| URL | What it is |
|---|---|
| **https://outreach-github.vercel.app/jarvis** | The new self-contained AI Space (own sidebar, header, status bar). Auto-redirects to `/jarvis/memory`. |
| **https://outreach-github.vercel.app/jarvis/memory** | 4-pane vault explorer with Inbox-folder filter, Time Machine, Continue card, drag-drop, F2 rename, soft-delete with grace period |
| **https://outreach-github.vercel.app/jarvis/agents** | 5-subtab Agents page (Agents · Workflows · Schedules · Runs · Health) |
| **https://outreach-github.vercel.app/jarvis/agents/[slug]** | Agent detail with themed CTA on missing slugs (no more white-404) + frontmatter strip + working Edit/Preview |
| **https://outreach-github.vercel.app/jarvis/terminals** | Real Claude Code terminals via xterm.js + WebSocket — fixed the dimension race |
| **https://outreach-github.vercel.app/jarvis/mcps** | Manage MCP servers (Playwright, Postgres, Brave Search seeded; install GitHub via OAuth) |
| **https://outreach-github.vercel.app/jarvis/workflows** | Visual workflow builder (xyflow canvas with Controls + MiniMap) |
| **https://outreach-github.vercel.app/agency/memory** | Original page still works (no regression) |
| **https://outreach-github.vercel.app/agency/agents** | Original works |

## 🔑 Where to paste keys

**Each section here = an action item for you. Each has the exact UI path.**

### 1. GitHub MCP (recommended — unlocks PR/issue automation in Jarvis)
1. Visit https://github.com/settings/applications/new
2. Application name: `Jarvis Space MCP`
3. Homepage URL: `https://outreach-github.vercel.app`
4. Authorization callback URL: `https://outreach-github.vercel.app/api/mcp/oauth/github/callback`
5. Save → copy Client ID + generate Client Secret
6. In dashboard: **Sidebar → Settings → API Keys → Add `github_mcp_oauth_client_id` + `github_mcp_token`** (two rows)
7. Then: **`/jarvis/mcps` → Catalog tab → GitHub card → Connect**. Walks you through OAuth.

### 2. (Optional) Vercel MCP — for deploy automation from Jarvis
- Comes with a Vercel API token. Path: vercel dashboard → Settings → Tokens → Create
- Paste at: **`/agency/integrations` → API Keys → Add `vercel_token`**
- Then `/jarvis/mcps → Catalog → Vercel → Connect`

### 3. (Optional) Sentry MCP — error triage assistant
- DSN already in your env per CLAUDE.md
- For the MCP integration: `/jarvis/mcps → Catalog → Sentry → Connect` (uses OAuth)

### 4. Vercel cron limit (if you want auto-snapshots + auto-inbox)
The 2 new crons (`/api/cron/vault-snapshot`, `/api/cron/inbox-tick`) are NOT in `vercel.json` because they pushed your project over the cron limit. The routes work — just no auto-trigger.

If your plan supports more crons:
1. Edit `vercel.json` and add at the bottom of the `crons` array:
   ```json
   { "path": "/api/cron/vault-snapshot", "schedule": "15 2 * * *" },
   { "path": "/api/cron/inbox-tick", "schedule": "*/15 * * * *" }
   ```
2. Commit + push to main; Vercel re-deploys.

If your plan doesn't: trigger manually or skip — both features still work as long as you visit them.

**Manual triggers (for testing):**
- `curl -X POST -H "Cookie: admin_session=<your>" https://outreach-github.vercel.app/api/notifications/seed` — re-seeds the inbox with fresh failed runs / agent proposals / health flags
- `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://outreach-github.vercel.app/api/cron/vault-snapshot` — snapshots the vault for time-travel

## 🐛 Bugs fixed (from the W1C audit)

Built-and-deployed:
- BUG-001/002 — agent detail page `/agency/agents/[slug]` showed white 404. Now themed CTA inside Jarvis chrome.
- BUG-003/011 — "Inbox" filter chip on Memory page hijacked notifications drawer. Renamed "Inbox folder", scopes vault tree.
- BUG-004 — 5 dialogs missing `DialogTitle`. All wrapped (a11y).
- BUG-005 — xterm `dimensions of undefined` race. ResizeObserver guards `Terminal#open()`.
- BUG-008 — mobile Agents subtabs unreachable. `overflow-x-auto + flex-shrink-0`.
- BUG-010/019 — stacked welcome+continue cards + mobile no-scroll. Single resume chip + `min-h-dvh`.
- BUG-014 — Edit/Preview tabs didn't swap content. Distinct panels via mode ternary.
- BUG-015 — YAML frontmatter rendered as prose. 30-line regex parser, body fed post-frontmatter.
- BUG-016 — Time Machine read-only not enforced. Tree+editor honor readOnly prop.
- BUG-017 — Move dialog included `.trash`. Filtered out.
- BUG-018 — no Rename action. Context menu + RenameDialog at every depth.
- a11y — nested-button violation. Fixed via `role="group"` + chevron-only inner button.

## 📦 Ship history (PRs)

| PR | What | Status |
|---|---|---|
| #55 | Memory redesign + /agency/agents (prior phase) | ✅ merged |
| #56 | Foundation: /jarvis route group + 11 bug fixes + carried-forward backend | ✅ merged → deployed |
| #57 (pending) | Features: MCP UI + Cmd+K + Workflows + Motion polish | 🟡 building, will be open by morning |
| #58 (pending) | Polish: theme + a11y + bug sweep + breakpoint cleanup | ⏸ |
| #59 (pending) | Outreach spec alignment: Automations + Accounts & Proxies + Outreach Hub backend & testing | ⏸ |

## ⚠️ Known gaps + roadmap

(Updated continuously as features land.)

### Built but waiting for your action
- GitHub MCP: routes shipped, UI shipped, just needs OAuth app created (5-min task, see §1 above)
- Sentry / Vercel MCPs: catalog entries exist, real install pending OAuth setup

### Stubbed for follow-up (not blocking anything)
- xyflow drag-onto-canvas drop wiring (palette declares draggable but onDrop deferred)
- Workflow builder dagre auto-layout
- Mobile inspector for /jarvis/workflows (`hidden lg:flex` below 1024)
- Cmd+K theme toggle is a stub; W5D will replace with real theme system

## 🛡️ Hard rules I followed all night

- **Zero Instagram/FB/LinkedIn DMs sent during testing.** Cookie validation only.
- **No bypass of ban-risk policy.** Warmup, caps, send delays, reply auto-pause untouched.
- **Production stayed up the whole time.** /agency/* never broke; /jarvis/* added incrementally.
- **3-PR cutover** so each merge was reviewable.

## 🧪 Test coverage

(Filled in after Wave 9 testing — comprehensive matrix.)

## 📂 If you want to dig deeper

| Doc | Purpose |
|---|---|
| `/root/.claude/plans/jarvis-space-upgrade.md` | The 11-wave master plan, ~456 lines |
| `/root/.claude/projects/-root/memory/jarvis-build/00-mission.md` | The mission statement |
| `/root/.claude/projects/-root/memory/jarvis-build/01-status-board.md` | Live wave-by-wave progress |
| `/root/.claude/projects/-root/memory/jarvis-build/02-key-decisions.md` | Architectural decisions locked in |
| `/root/.claude/projects/-root/memory/jarvis-build/03-user-instructions.md` | Your verbatim quotes (don't paraphrase) |
| `/root/.claude/projects/-root/memory/jarvis-build/04-execution-strategy.md` | Job queue + 5-min proctoring |
| `/root/.claude/projects/-root/memory/jarvis-build/05-rpbt-pattern.md` | Research-Plan-Build-Test cycles |
| `/root/.claude/projects/-root/memory/jarvis-build/06-orchestrator-upgrades.md` | Self-research on Claude Code best practices (832 lines) |
| `/root/.claude/projects/-root/memory/jarvis-build/agents/*.md` | Per-builder reports — every claim auditable |
| `/root/.claude/projects/-root/memory/jarvis-build/rpbt/mcp/*.md` | The MCP cycle's R/P/B/T artifacts |
| `/tmp/wave1-bug-audit.md` | 38 production bugs catalogued |
| `/tmp/wave1-screenshots/` | Visual evidence per bug |

Sleep was earned. ☕
