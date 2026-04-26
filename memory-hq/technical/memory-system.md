# The Memory System

This project has TWO memory systems working together. Understand the split before you write a memory anywhere.

## 1. App-DB memory (what Dylan and the in-app AI see)

**Where it lives:** Supabase tables `memories`, `memory_personas`, `memory_settings`, `memory_versions`, `memory_injections`.
**Where Dylan edits it:** `/agency/memory` page in the dashboard.
**Endpoints:**
- `GET /api/memories` — list/filter
- `POST /api/memories` — create/update/delete/pin/archive/reorder/duplicate/bulk_archive
- `GET /api/memories/inject?persona_id=&business_id=&max_tokens=2000&q=&format=markdown|json` — returns the injected memory context as ready-to-use markdown
- `GET /api/memories/suggest` — auto-suggest new memories
- `POST /api/memories/health-scan` — quality check
- `GET/POST /api/memories/[id]/versions` — version history
- `GET /api/memories/export`, `POST /api/memories/import` — JSON
- `GET/POST /api/memory-settings` — token_budget, mcp_enabled, **mcp_api_key**, local_sync, auto_suggest

**Memory types** (4, identical to Claude Code's own auto-memory):
- `user` — who Dylan is, his role, preferences
- `feedback` — rules to apply every turn ("don't say leverage", "Eastern Time")
- `project` — goals, deadlines, in-flight work
- `reference` — pointers to external systems (Linear, Slack, GHL, etc.)

**Persona model:**
- Each persona has a `system_prompt`
- Personas can have a `parent_persona_id` (system prompts chain — child overrides parent)
- One persona per business is `is_default`
- `tone_terse` and `tone_formal` are dials
- `emoji_mode` is `off` / `auto` / `on`

**Trigger keywords:** memories with `trigger_keywords` only inject when the conversation query matches a keyword. Pinned memories override.

**Token budgeting:** `inject` endpoint takes `max_tokens` (capped at 16000), groups memories by type, packs in priority order until budget runs out. Logs to `memory_injections` and bumps `memories.last_used_at`.

## 2. Claude Code local memory (what the AI VPS keeps)

**Where it lives:** `/root/.claude/projects/-root/memory/` on the AI VPS.
**Format:** one markdown file per memory, indexed in `MEMORY.md`.
**Used by:** Claude Code itself, automatically loaded into every session.

This is where Claude keeps notes that are useful across sessions but don't need to surface in the user-facing dashboard — e.g. "user pasted credentials in chat once, don't re-do that," or "the AI VPS is srv1378286 not srv1197943."

## How they sync

- A custom MCP server (planned: `/root/services/memory-mcp/`) bridges Claude Code → the app DB endpoints. When Claude calls `memory_create`, the memory lands in Supabase and shows up in `/agency/memory`.
- Local Claude memory stays local. Sync is one-way only (Claude → app), and only for things meaningful to the user.

## Markdown narrative memory (this folder)

`/memory-hq/` is a third layer for **structured project narrative** that doesn't fit the per-fact `memories` table. Examples: this file, the architecture diagram, the agent prompts, decision logs, session summaries.

## Where to put a new memory (cheat sheet)

| What you're saving | Where it goes |
|---|---|
| "Dylan prefers Eastern Time" | App DB (feedback) — visible in `/agency/memory` |
| "Use shadcn/ui not headlessui in this repo" | App DB (feedback) |
| "GHL token rotation runs 1st & 15th" | App DB (project) — Dylan needs to see/edit |
| Today's session notes | `/memory-hq/sessions/2026-04-26.md` |
| "Decided to use FalkorDB for graph backend" | `/memory-hq/decisions/2026-04-26-falkordb.md` |
| "AI VPS hostname is srv1378286" | Claude local — only Claude needs this |
| Architecture diagram | `/memory-hq/technical/architecture.md` |
